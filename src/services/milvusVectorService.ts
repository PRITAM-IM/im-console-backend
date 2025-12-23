import { randomUUID } from 'crypto';
import { getMilvusClient, MILVUS_CONFIG } from '../config/milvus';
import { ConsistencyLevelEnum } from '@zilliz/milvus2-sdk-node';

// Use crypto.randomUUID for generating UUIDs
const uuidv4 = () => randomUUID();

/**
 * Milvus Vector Service
 * 
 * Handles all vector operations for the async RAG architecture:
 * - Upsert: Background worker writes metrics embeddings
 * - Query: Chat API reads with partition key isolation + timestamp filtering
 * - Delete: Cleanup operations for data management
 * 
 * Key Features:
 * - Partition Keys: projectId for O(1) multi-tenant isolation
 * - Scalar Filtering: timestamp for "last month" type queries
 * - Batch Processing: Efficient bulk operations
 */

// Metric chunk interface (same structure for consistency)
export interface MetricChunk {
    id: string;
    text: string;
    metadata: {
        projectId: string;
        metricType: 'overview' | 'conversion' | 'channel' | 'platform' | 'insight' | 'campaign';
        platform?: string;
        startDate: string;
        endDate: string;
        dateRangeLabel: string;
        category: string;
        textContent: string;
        metricsSnapshot: Record<string, any>;
        isFallbackData: boolean;
        fallbackPeriod?: string;
        createdAt: string;
        expiresAt: string;
    };
}

// Query result interface
export interface MilvusQueryResult {
    id: string;
    score: number;
    text: string;
    metadata: {
        projectId: string;
        metricType: string;
        platform: string;
        startDate: string;
        endDate: string;
        category: string;
        timestamp: number;
        metricsSnapshot?: Record<string, any>;
    };
}

// Query parameters
export interface MilvusQueryParams {
    embedding: number[];
    projectId: string;
    topK?: number;
    minScore?: number;
    timestampRange?: {
        startTime: number;  // Unix timestamp in ms
        endTime: number;    // Unix timestamp in ms
    };
    dateRange?: {
        startDate: string;  // YYYY-MM-DD
        endDate: string;    // YYYY-MM-DD
    };
    metricTypes?: string[];
    platforms?: string[];
}

/**
 * Upsert vectors with embeddings to Milvus
 * Called by the background sync worker
 */
export async function upsertVectors(
    chunks: MetricChunk[],
    embeddings: number[][],
    projectId: string
): Promise<void> {
    if (chunks.length === 0 || chunks.length !== embeddings.length) {
        console.log('[MilvusService] No chunks to upsert or length mismatch');
        return;
    }

    const client = getMilvusClient();
    const collectionName = MILVUS_CONFIG.ANALYTICS_COLLECTION;

    console.log(`[MilvusService] Upserting ${chunks.length} vectors for project ${projectId}`);

    // Transform chunks to Milvus format
    const data = chunks.map((chunk, index) => {
        const timestamp = new Date(chunk.metadata.startDate).getTime();

        return {
            id: chunk.id || uuidv4(),
            project_id: projectId,
            timestamp: timestamp,
            start_date: chunk.metadata.startDate,
            end_date: chunk.metadata.endDate,
            metric_type: chunk.metadata.metricType,
            platform: chunk.metadata.platform || 'general',
            category: chunk.metadata.category,
            text_content: chunk.text.substring(0, 8000), // Truncate if too long
            metrics_json: JSON.stringify(chunk.metadata.metricsSnapshot || {}),
            embedding: embeddings[index],
            // Additional dynamic fields
            date_range_label: chunk.metadata.dateRangeLabel,
            is_fallback: chunk.metadata.isFallbackData || false,
            created_at: chunk.metadata.createdAt,
        };
    });

    // Batch upsert (Milvus handles batching internally for large datasets)
    const BATCH_SIZE = 100;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);

        try {
            await client.insert({
                collection_name: collectionName,
                data: batch,
            });

            console.log(`[MilvusService] Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(data.length / BATCH_SIZE)}`);
        } catch (error: any) {
            console.error(`[MilvusService] Error inserting batch:`, error.message);
            throw error;
        }
    }

    console.log(`✅ [MilvusService] Successfully upserted ${chunks.length} vectors`);
}

/**
 * Query vectors with intent-based filtering
 * Used by chatService for retrieval
 */
export async function queryVectors(params: MilvusQueryParams): Promise<MilvusQueryResult[]> {
    const {
        embedding,
        projectId,
        topK = MILVUS_CONFIG.DEFAULT_TOP_K,
        minScore = MILVUS_CONFIG.DEFAULT_MIN_SCORE,
        timestampRange,
        dateRange,
        metricTypes,
        platforms,
    } = params;

    const client = getMilvusClient();
    const collectionName = MILVUS_CONFIG.ANALYTICS_COLLECTION;

    // Build filter expression
    const filters: string[] = [];

    // Project ID filter (partition key - REQUIRED for isolation)
    filters.push(`project_id == "${projectId}"`);

    // Timestamp range filter (for "last month", "September" queries)
    if (timestampRange) {
        filters.push(`timestamp >= ${timestampRange.startTime}`);
        filters.push(`timestamp <= ${timestampRange.endTime}`);
    }

    // Date string filter (alternative to timestamp)
    if (dateRange) {
        filters.push(`start_date >= "${dateRange.startDate}"`);
        filters.push(`end_date <= "${dateRange.endDate}"`);
    }

    // Metric type filter
    if (metricTypes && metricTypes.length > 0) {
        const typeFilter = metricTypes.map(t => `metric_type == "${t}"`).join(' || ');
        filters.push(`(${typeFilter})`);
    }

    // Platform filter
    if (platforms && platforms.length > 0) {
        const platformFilter = platforms.map(p => `platform == "${p}"`).join(' || ');
        filters.push(`(${platformFilter})`);
    }

    const filterExpr = filters.join(' && ');

    console.log(`[MilvusService] Querying with filter: ${filterExpr}`);
    console.log(`[MilvusService] TopK: ${topK}, MinScore: ${minScore}`);

    try {
        const searchResults = await client.search({
            collection_name: collectionName,
            data: [embedding], // v2.6+ API uses 'data' array
            filter: filterExpr,
            limit: topK,
            output_fields: [
                'id', 'project_id', 'timestamp', 'start_date', 'end_date',
                'metric_type', 'platform', 'category', 'text_content', 'metrics_json',
                'date_range_label', 'is_fallback', 'created_at'
            ],
            params: {
                ef: MILVUS_CONFIG.HNSW_EF,
            },
            consistency_level: ConsistencyLevelEnum.Bounded,
        });

        // Filter by minimum score and transform results
        const results: MilvusQueryResult[] = [];

        if (searchResults.results && searchResults.results.length > 0) {
            for (const result of searchResults.results) {
                // Milvus returns distance, convert to similarity score
                // For COSINE: similarity = 1 - distance (when using IP, it's the score directly)
                const score = result.score || 0;

                if (score >= minScore) {
                    let metricsSnapshot = {};
                    try {
                        metricsSnapshot = result.metrics_json ? JSON.parse(result.metrics_json as string) : {};
                    } catch (e) {
                        // Ignore JSON parse errors
                    }

                    results.push({
                        id: result.id as string,
                        score: score,
                        text: result.text_content as string,
                        metadata: {
                            projectId: result.project_id as string,
                            metricType: result.metric_type as string,
                            platform: result.platform as string,
                            startDate: result.start_date as string,
                            endDate: result.end_date as string,
                            category: result.category as string,
                            timestamp: result.timestamp as number,
                            metricsSnapshot,
                        },
                    });
                }
            }
        }

        console.log(`[MilvusService] Found ${results.length} results above minScore ${minScore}`);
        return results;
    } catch (error: any) {
        console.error('[MilvusService] Query error:', error.message);
        throw error;
    }
}

/**
 * Delete vectors for a project
 * Used for cleanup or re-indexing
 */
export async function deleteVectorsByProject(projectId: string): Promise<void> {
    const client = getMilvusClient();
    const collectionName = MILVUS_CONFIG.ANALYTICS_COLLECTION;

    console.log(`[MilvusService] Deleting vectors for project ${projectId}`);

    try {
        await client.delete({
            collection_name: collectionName,
            filter: `project_id == "${projectId}"`,
        });

        console.log(`✅ [MilvusService] Deleted all vectors for project ${projectId}`);
    } catch (error: any) {
        console.error('[MilvusService] Delete error:', error.message);
        throw error;
    }
}

/**
 * Delete old vectors by timestamp
 * Used for TTL cleanup
 */
export async function deleteVectorsByAge(projectId: string, beforeTimestamp: number): Promise<void> {
    const client = getMilvusClient();
    const collectionName = MILVUS_CONFIG.ANALYTICS_COLLECTION;

    console.log(`[MilvusService] Deleting vectors older than ${new Date(beforeTimestamp).toISOString()} for project ${projectId}`);

    try {
        await client.delete({
            collection_name: collectionName,
            filter: `project_id == "${projectId}" && timestamp < ${beforeTimestamp}`,
        });

        console.log(`✅ [MilvusService] Cleanup completed for project ${projectId}`);
    } catch (error: any) {
        console.error('[MilvusService] Delete by age error:', error.message);
        throw error;
    }
}

/**
 * Get vector count for a project
 */
export async function getVectorCount(projectId: string): Promise<number> {
    const client = getMilvusClient();
    const collectionName = MILVUS_CONFIG.ANALYTICS_COLLECTION;

    try {
        const result = await client.query({
            collection_name: collectionName,
            filter: `project_id == "${projectId}"`,
            output_fields: ['id'],
            limit: 10000, // Max count
        });

        return result.data?.length || 0;
    } catch (error: any) {
        console.error('[MilvusService] Count error:', error.message);
        return 0;
    }
}

/**
 * Check if project has recent data (for sync status)
 */
export async function hasRecentData(projectId: string, withinHours: number = 24): Promise<boolean> {
    const client = getMilvusClient();
    const collectionName = MILVUS_CONFIG.ANALYTICS_COLLECTION;
    const cutoffTime = Date.now() - (withinHours * 60 * 60 * 1000);

    try {
        const result = await client.query({
            collection_name: collectionName,
            filter: `project_id == "${projectId}" && timestamp >= ${cutoffTime}`,
            output_fields: ['id'],
            limit: 1,
        });

        return (result.data?.length || 0) > 0;
    } catch (error: any) {
        console.error('[MilvusService] Recent data check error:', error.message);
        return false;
    }
}

// ============================================================================
// USER MEMORY COLLECTION OPERATIONS (Self-Learning Feedback Loop)
// ============================================================================

export interface UserMemory {
    id: string;
    userId: string;
    projectId: string;
    timestamp: number;
    memoryType: 'correction' | 'preference' | 'instruction';
    originalQuery: string;
    correction: string;
}

/**
 * Store user correction/preference
 * Called when user provides feedback like "focus on ROAS, not Spend"
 */
export async function storeUserMemory(
    memory: Omit<UserMemory, 'id' | 'timestamp'>,
    embedding: number[]
): Promise<void> {
    const client = getMilvusClient();
    const collectionName = MILVUS_CONFIG.USER_MEMORY_COLLECTION;

    const data = {
        id: uuidv4(),
        user_id: memory.userId,
        project_id: memory.projectId,
        timestamp: Date.now(),
        memory_type: memory.memoryType,
        original_query: memory.originalQuery.substring(0, 2000),
        correction: memory.correction.substring(0, 4000),
        embedding: embedding,
    };

    try {
        await client.insert({
            collection_name: collectionName,
            data: [data],
        });

        console.log(`✅ [MilvusService] Stored user memory for user ${memory.userId}`);
    } catch (error: any) {
        console.error('[MilvusService] Error storing user memory:', error.message);
        throw error;
    }
}

/**
 * Retrieve relevant user memories
 * Called at the start of every chat to inject user-defined rules
 */
export async function retrieveUserMemories(
    userId: string,
    queryEmbedding: number[],
    topK: number = 5,
    minScore: number = 0.70
): Promise<UserMemory[]> {
    const client = getMilvusClient();
    const collectionName = MILVUS_CONFIG.USER_MEMORY_COLLECTION;

    try {
        const searchResults = await client.search({
            collection_name: collectionName,
            data: [queryEmbedding], // v2.6+ API uses 'data' array
            filter: `user_id == "${userId}"`,
            limit: topK,
            output_fields: [
                'id', 'user_id', 'project_id', 'timestamp',
                'memory_type', 'original_query', 'correction'
            ],
            params: {
                ef: MILVUS_CONFIG.HNSW_EF,
            },
            consistency_level: ConsistencyLevelEnum.Bounded,
        });

        const memories: UserMemory[] = [];

        if (searchResults.results && searchResults.results.length > 0) {
            for (const result of searchResults.results) {
                const score = result.score || 0;

                if (score >= minScore) {
                    memories.push({
                        id: result.id as string,
                        userId: result.user_id as string,
                        projectId: result.project_id as string,
                        timestamp: result.timestamp as number,
                        memoryType: result.memory_type as UserMemory['memoryType'],
                        originalQuery: result.original_query as string,
                        correction: result.correction as string,
                    });
                }
            }
        }

        console.log(`[MilvusService] Found ${memories.length} relevant user memories`);
        return memories;
    } catch (error: any) {
        console.error('[MilvusService] Error retrieving user memories:', error.message);
        return [];
    }
}

export default {
    upsertVectors,
    queryVectors,
    deleteVectorsByProject,
    deleteVectorsByAge,
    getVectorCount,
    hasRecentData,
    storeUserMemory,
    retrieveUserMemories,
};
