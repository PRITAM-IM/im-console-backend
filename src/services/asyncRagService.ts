import milvusVectorService, { MilvusQueryResult, UserMemory } from './milvusVectorService';
import embeddingService from './embeddingService';
import queryIntentParser, { ParsedIntent } from './queryIntentParser';
import { ENV } from '../config/env';

/**
 * Async RAG Service (Milvus-based)
 * 
 * This service handles the READ side of the RAG architecture:
 * - Intent-based query parsing for temporal/platform filtering
 * - Vector similarity search with Milvus filters
 * - User memory retrieval for self-learning
 * 
 * Key Differences from Legacy RAG:
 * - NO synchronous indexing during queries (data pre-indexed by worker)
 * - Sub-second response times (just embedding + search)
 * - Full historical data access via timestamp filters
 * 
 * Success Metrics:
 * - Latency: < 500ms for context retrieval
 * - Accuracy: 3+ months historical data accessible
 * - Isolation: Partition key ensures no cross-project leaks
 */

export interface AsyncRAGContext {
    context: string;
    chunks: MilvusQueryResult[];
    userMemories: UserMemory[];
    intent: ParsedIntent;
    stats: {
        embeddingTimeMs: number;
        searchTimeMs: number;
        totalTimeMs: number;
        chunksRetrieved: number;
        memoriesRetrieved: number;
    };
}

/**
 * Retrieve context using async Milvus-based RAG
 * This is the main entry point for the chat service
 */
export async function retrieveContext(
    userQuery: string,
    projectId: string,
    userId: string,
    dateRange?: { startDate: string; endDate: string },
    options?: {
        topK?: number;
        minScore?: number;
        includeUserMemory?: boolean;
    }
): Promise<AsyncRAGContext> {
    const startTime = Date.now();
    const {
        topK = 10,
        minScore = 0.60,
        includeUserMemory = true,
    } = options || {};

    console.log(`[AsyncRAG] Retrieving context for query: "${userQuery.substring(0, 50)}..."`);

    // Step 1: Parse query intent (temporal, platform, metric type)
    const intent = queryIntentParser.parseQueryIntent(userQuery, dateRange);

    console.log(`[AsyncRAG] Parsed intent:`, {
        timeframe: intent.timeframe.label,
        platforms: intent.platforms,
        metricTypes: intent.metricTypes,
        confidence: intent.confidence.toFixed(2),
    });

    // Step 2: Generate query embedding
    const embeddingStart = Date.now();
    const queryEmbedding = await embeddingService.generateEmbedding(userQuery);
    const embeddingTimeMs = Date.now() - embeddingStart;

    console.log(`[AsyncRAG] Embedding generated in ${embeddingTimeMs}ms`);

    // Step 3: Search Milvus with intent-based filters
    const searchStart = Date.now();

    let chunks = await milvusVectorService.queryVectors({
        embedding: queryEmbedding,
        projectId,
        topK,
        minScore,
        timestampRange: {
            startTime: intent.timeframe.startTime,
            endTime: intent.timeframe.endTime,
        },
        platforms: intent.platforms.length > 0 ? intent.platforms : undefined,
        metricTypes: intent.metricTypes.length > 0 ? intent.metricTypes : undefined,
    });

    // If no chunks found, try with a wider 30-day window (without platform/metric filters)
    let usedFallbackWindow = false;
    if (chunks.length === 0) {
        console.log(`[AsyncRAG] No data for requested period, trying 30-day fallback window...`);

        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const fallbackChunks = await milvusVectorService.queryVectors({
            embedding: queryEmbedding,
            projectId,
            topK,
            minScore: 0.50, // Lower threshold
            timestampRange: {
                startTime: thirtyDaysAgo,
                endTime: Date.now(),
            },
            // No platform/metric filters - get any available data
        });

        if (fallbackChunks.length > 0) {
            console.log(`[AsyncRAG] Found ${fallbackChunks.length} chunks in 30-day fallback window`);
            chunks = fallbackChunks;
            usedFallbackWindow = true;

            // Update intent to reflect the fallback
            intent.timeframe.label = 'Last 30 Days (Fallback)';
            intent.timeframe.startDate = new Date(thirtyDaysAgo).toISOString().split('T')[0];
            intent.timeframe.endDate = new Date().toISOString().split('T')[0];
        }
    }

    const searchTimeMs = Date.now() - searchStart;
    console.log(`[AsyncRAG] Milvus search completed in ${searchTimeMs}ms, found ${chunks.length} chunks${usedFallbackWindow ? ' (using 30-day fallback)' : ''}`);

    // Step 4: Retrieve user memories (self-learning)
    let userMemories: UserMemory[] = [];

    if (includeUserMemory && userId) {
        try {
            userMemories = await milvusVectorService.retrieveUserMemories(
                userId,
                queryEmbedding,
                3, // Top 3 relevant memories
                0.70
            );
            console.log(`[AsyncRAG] Retrieved ${userMemories.length} user memories`);
        } catch (error) {
            // Non-fatal: continue without memories
            console.warn('[AsyncRAG] Failed to retrieve user memories:', error);
        }
    }

    // Step 5: Build context from chunks
    const context = buildContextFromChunks(chunks, intent, userMemories);

    const totalTimeMs = Date.now() - startTime;
    console.log(`[AsyncRAG] Context retrieval completed in ${totalTimeMs}ms`);

    return {
        context,
        chunks,
        userMemories,
        intent,
        stats: {
            embeddingTimeMs,
            searchTimeMs,
            totalTimeMs,
            chunksRetrieved: chunks.length,
            memoriesRetrieved: userMemories.length,
        },
    };
}

/**
 * Build context string from retrieved chunks
 */
function buildContextFromChunks(
    chunks: MilvusQueryResult[],
    intent: ParsedIntent,
    userMemories: UserMemory[]
): string {
    const sections: string[] = [];

    // Add user-defined rules from memories (self-learning)
    if (userMemories.length > 0) {
        sections.push('=== USER-DEFINED RULES (Remember These) ===');
        for (const memory of userMemories) {
            sections.push(`• ${memory.correction}`);
        }
        sections.push('');
    }

    // Add data context header
    sections.push(`=== DATA CONTEXT FOR ${intent.timeframe.label.toUpperCase()} ===`);
    sections.push(`Period: ${intent.timeframe.startDate} to ${intent.timeframe.endDate}`);

    if (intent.platforms.length > 0) {
        sections.push(`Focused Platforms: ${intent.platforms.join(', ')}`);
    }
    sections.push('');

    // No chunks found
    if (chunks.length === 0) {
        sections.push('⚠️ DATA AVAILABILITY NOTICE');
        sections.push(`No data was found for the requested period: ${intent.timeframe.label} (${intent.timeframe.startDate} to ${intent.timeframe.endDate})`);
        sections.push('');
        sections.push('IMPORTANT - Tell the user:');
        sections.push('1. You could not find data for the specific period they asked about.');
        sections.push('2. Suggest they ask about a different time period (e.g., "last 30 days", "last month", "November").');
        sections.push('3. If they asked about a specific platform (YouTube, Meta Ads, etc.), suggest trying: "Show me [platform] data for the last 30 days"');
        sections.push('');
        sections.push('Possible reasons:');
        sections.push('- The platform may not have been active during this period');
        sections.push('- Data sync may still be in progress (syncs run hourly)');
        sections.push('- The requested date range may be outside the 90-day retention window');
        sections.push('');
        sections.push('DO NOT make up or hallucinate any metrics. Be honest that you do not have the data.');
        return sections.join('\n');
    }

    // Add retrieved chunks
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const relevance = (chunk.score * 100).toFixed(1);

        sections.push(`[Source ${i + 1}] (Relevance: ${relevance}%):`);
        sections.push(chunk.text);
        sections.push('');
    }

    // Add metadata summary
    sections.push('=== RETRIEVAL METADATA ===');
    sections.push(`Chunks Retrieved: ${chunks.length}`);
    sections.push(`Average Relevance: ${calculateAverageScore(chunks).toFixed(1)}%`);

    const platforms = [...new Set(chunks.map(c => c.metadata.platform).filter(Boolean))];
    if (platforms.length > 0) {
        sections.push(`Platforms in Context: ${platforms.join(', ')}`);
    }

    return sections.join('\n');
}

/**
 * Calculate average score of chunks
 */
function calculateAverageScore(chunks: MilvusQueryResult[]): number {
    if (chunks.length === 0) return 0;
    const sum = chunks.reduce((acc, chunk) => acc + chunk.score, 0);
    return (sum / chunks.length) * 100;
}

/**
 * Store a user correction for self-learning
 * Called when user provides feedback like "focus on ROAS, not Spend"
 */
export async function storeUserCorrection(
    userId: string,
    projectId: string,
    originalQuery: string,
    correction: string,
    type: 'correction' | 'preference' | 'instruction' = 'preference'
): Promise<void> {
    console.log(`[AsyncRAG] Storing user correction for user ${userId}`);

    try {
        // Generate embedding for the correction
        const embedding = await embeddingService.generateEmbedding(correction);

        await milvusVectorService.storeUserMemory({
            userId,
            projectId,
            memoryType: type,
            originalQuery,
            correction,
        }, embedding);

        console.log(`✅ [AsyncRAG] Stored user ${type}`);
    } catch (error: any) {
        console.error('[AsyncRAG] Failed to store user correction:', error.message);
        throw error;
    }
}

/**
 * Check if Milvus has recent data for a project
 * Used to show sync status in UI
 */
export async function checkDataFreshness(projectId: string): Promise<{
    hasData: boolean;
    isRecent: boolean;
    vectorCount: number;
}> {
    try {
        const vectorCount = await milvusVectorService.getVectorCount(projectId);
        const isRecent = await milvusVectorService.hasRecentData(projectId, 24); // 24 hours

        return {
            hasData: vectorCount > 0,
            isRecent,
            vectorCount,
        };
    } catch (error) {
        return {
            hasData: false,
            isRecent: false,
            vectorCount: 0,
        };
    }
}

/**
 * Get retrieval-ready status for a project
 */
export async function getProjectStatus(projectId: string): Promise<{
    ready: boolean;
    message: string;
    vectorCount: number;
    lastSyncAge: string;
}> {
    const freshness = await checkDataFreshness(projectId);

    if (!freshness.hasData) {
        return {
            ready: false,
            message: 'No data indexed. Waiting for background sync.',
            vectorCount: 0,
            lastSyncAge: 'Never',
        };
    }

    if (!freshness.isRecent) {
        return {
            ready: true,
            message: 'Data available but may be outdated.',
            vectorCount: freshness.vectorCount,
            lastSyncAge: '> 24 hours',
        };
    }

    return {
        ready: true,
        message: 'Ready with fresh data.',
        vectorCount: freshness.vectorCount,
        lastSyncAge: '< 24 hours',
    };
}

/**
 * Fallback to legacy context if Milvus is not available
 * This ensures graceful degradation during migration
 */
export async function isAsyncRAGAvailable(): Promise<boolean> {
    if (!ENV.MILVUS_ADDRESS) {
        return false;
    }

    try {
        const { checkMilvusHealth } = await import('../config/milvus');
        return await checkMilvusHealth();
    } catch (error) {
        return false;
    }
}

export default {
    retrieveContext,
    storeUserCorrection,
    checkDataFreshness,
    getProjectStatus,
    isAsyncRAGAvailable,
};
