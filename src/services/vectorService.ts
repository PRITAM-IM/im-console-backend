import { getPineconeIndex } from '../config/pinecone';
import {
  VectorMetadata,
  MetricChunk,
  VectorQueryResult,
  UpsertVectorParams,
  QueryVectorParams,
  DeleteVectorParams,
} from '../models/VectorMetadata';
import { v4 as uuidv4 } from '../utils/uuid';

/**
 * Vector Service
 * Handles all Pinecone vector database operations
 */

const UPSERT_BATCH_SIZE = 100; // Pinecone supports up to 1000, but we'll use 100 for safety
const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0.7;

/**
 * Upsert vectors to Pinecone
 */
export async function upsertVectors(params: UpsertVectorParams): Promise<void> {
  const { chunks, namespace } = params;

  if (!chunks || chunks.length === 0) {
    console.log('⚠️ No chunks to upsert');
    return;
  }

  try {
    const index = getPineconeIndex();
    console.log(`📤 Upserting ${chunks.length} vectors to Pinecone...`);

    // Process in batches
    for (let i = 0; i < chunks.length; i += UPSERT_BATCH_SIZE) {
      const batch = chunks.slice(i, i + UPSERT_BATCH_SIZE);
      const batchNumber = Math.floor(i / UPSERT_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(chunks.length / UPSERT_BATCH_SIZE);

      console.log(`📦 Upserting batch ${batchNumber}/${totalBatches} (${batch.length} vectors)...`);

      // Transform chunks to Pinecone format
      const vectors = batch.map(chunk => ({
        id: chunk.id,
        values: [], // Will be filled by embeddings
        metadata: {
          ...chunk.metadata,
          textContent: chunk.text, // Store text in metadata for retrieval
        },
      }));

      // Note: Embeddings should already be generated before calling this function
      // This is just the upsert operation
      // We'll handle embedding generation in the RAG service

      await index.namespace(namespace || '').upsert(vectors as any);
      console.log(`✅ Batch ${batchNumber}/${totalBatches} upserted successfully`);

      // Small delay between batches
      if (i + UPSERT_BATCH_SIZE < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Successfully upserted ${chunks.length} vectors`);
  } catch (error: any) {
    console.error('❌ Error upserting vectors:', error.message);
    throw new Error(`Failed to upsert vectors: ${error.message}`);
  }
}

/**
 * Upsert vectors with embeddings (complete flow)
 */
export async function upsertVectorsWithEmbeddings(
  chunks: MetricChunk[],
  embeddings: number[][],
  namespace?: string
): Promise<void> {
  if (!chunks || chunks.length === 0) {
    console.log('⚠️ No chunks to upsert');
    return;
  }

  if (chunks.length !== embeddings.length) {
    throw new Error(`Chunk count (${chunks.length}) does not match embedding count (${embeddings.length})`);
  }

  try {
    const index = getPineconeIndex();
    console.log(`📤 Upserting ${chunks.length} vectors with embeddings to Pinecone...`);

    // Process in batches
    for (let i = 0; i < chunks.length; i += UPSERT_BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + UPSERT_BATCH_SIZE);
      const batchEmbeddings = embeddings.slice(i, i + UPSERT_BATCH_SIZE);
      const batchNumber = Math.floor(i / UPSERT_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(chunks.length / UPSERT_BATCH_SIZE);

      console.log(`📦 Upserting batch ${batchNumber}/${totalBatches} (${batchChunks.length} vectors)...`);

      // Transform chunks to Pinecone format with embeddings
      const vectors = batchChunks.map((chunk, idx) => ({
        id: chunk.id,
        values: batchEmbeddings[idx],
        metadata: {
          projectId: chunk.metadata.projectId,
          metricType: chunk.metadata.metricType,
          platform: chunk.metadata.platform || '',
          startDate: chunk.metadata.startDate,
          endDate: chunk.metadata.endDate,
          dateRangeLabel: chunk.metadata.dateRangeLabel,
          category: chunk.metadata.category,
          textContent: chunk.text,
          metricsSnapshot: JSON.stringify(chunk.metadata.metricsSnapshot),
          isFallbackData: chunk.metadata.isFallbackData,
          fallbackPeriod: chunk.metadata.fallbackPeriod || '',
          createdAt: chunk.metadata.createdAt,
          expiresAt: chunk.metadata.expiresAt,
        },
      }));

      await index.namespace(namespace || '').upsert(vectors);
      console.log(`✅ Batch ${batchNumber}/${totalBatches} upserted successfully`);

      // Small delay between batches
      if (i + UPSERT_BATCH_SIZE < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Successfully upserted ${chunks.length} vectors with embeddings`);
  } catch (error: any) {
    console.error('❌ Error upserting vectors with embeddings:', error.message);
    throw new Error(`Failed to upsert vectors with embeddings: ${error.message}`);
  }
}

/**
 * Query vectors from Pinecone
 */
export async function queryVectors(params: QueryVectorParams): Promise<VectorQueryResult[]> {
  const {
    embedding,
    projectId,
    topK = DEFAULT_TOP_K,
    minScore = DEFAULT_MIN_SCORE,
    namespace,
  } = params;

  try {
    const index = getPineconeIndex();
    console.log(`🔍 Querying Pinecone for project ${projectId} (topK: ${topK}, minScore: ${minScore})...`);

    const queryResponse = await index.namespace(namespace || '').query({
      vector: embedding,
      topK,
      filter: {
        projectId: { $eq: projectId },
      },
      includeMetadata: true,
    });

    if (!queryResponse.matches || queryResponse.matches.length === 0) {
      console.log('⚠️ No matching vectors found');
      return [];
    }

    // Filter by minimum score and transform results
    const results: VectorQueryResult[] = queryResponse.matches
      .filter(match => (match.score || 0) >= minScore)
      .map(match => {
        const metadata = match.metadata as any;
        return {
          id: match.id,
          score: match.score || 0,
          text: metadata.textContent || '',
          metadata: {
            projectId: metadata.projectId,
            metricType: metadata.metricType,
            platform: metadata.platform,
            startDate: metadata.startDate,
            endDate: metadata.endDate,
            dateRangeLabel: metadata.dateRangeLabel,
            category: metadata.category,
            textContent: metadata.textContent,
            metricsSnapshot: typeof metadata.metricsSnapshot === 'string' 
              ? JSON.parse(metadata.metricsSnapshot) 
              : metadata.metricsSnapshot,
            isFallbackData: metadata.isFallbackData === true || metadata.isFallbackData === 'true',
            fallbackPeriod: metadata.fallbackPeriod,
            createdAt: metadata.createdAt,
            expiresAt: metadata.expiresAt,
          },
        };
      });

    console.log(`✅ Found ${results.length} matching vectors (${queryResponse.matches.length} total, ${queryResponse.matches.length - results.length} filtered by score)`);
    
    // Log similarity scores for debugging
    if (results.length > 0) {
      console.log('📊 Similarity scores:', results.map(r => `${r.metadata.category}: ${r.score.toFixed(3)}`).join(', '));
    }

    return results;
  } catch (error: any) {
    console.error('❌ Error querying vectors:', error.message);
    throw new Error(`Failed to query vectors: ${error.message}`);
  }
}

/**
 * Delete vectors by project ID
 */
export async function deleteVectorsByProject(
  projectId: string,
  namespace?: string
): Promise<void> {
  try {
    const index = getPineconeIndex();
    console.log(`🗑️ Deleting all vectors for project ${projectId}...`);

    await index.namespace(namespace || '').deleteMany({
      projectId: { $eq: projectId },
    });

    console.log(`✅ Deleted all vectors for project ${projectId}`);
  } catch (error: any) {
    console.error('❌ Error deleting vectors by project:', error.message);
    throw new Error(`Failed to delete vectors by project: ${error.message}`);
  }
}

/**
 * Delete expired vectors (TTL cleanup)
 */
export async function deleteExpiredVectors(namespace?: string): Promise<void> {
  try {
    const index = getPineconeIndex();
    const now = new Date().toISOString();
    
    console.log(`🗑️ Deleting expired vectors (before ${now})...`);

    await index.namespace(namespace || '').deleteMany({
      expiresAt: { $lt: now },
    });

    console.log(`✅ Deleted expired vectors`);
  } catch (error: any) {
    console.error('❌ Error deleting expired vectors:', error.message);
    throw new Error(`Failed to delete expired vectors: ${error.message}`);
  }
}

/**
 * Delete all vectors (use with caution!)
 */
export async function deleteAllVectors(namespace?: string): Promise<void> {
  try {
    const index = getPineconeIndex();
    console.log(`🗑️ Deleting ALL vectors in namespace "${namespace || 'default'}"...`);

    await index.namespace(namespace || '').deleteAll();

    console.log(`✅ Deleted all vectors`);
  } catch (error: any) {
    console.error('❌ Error deleting all vectors:', error.message);
    throw new Error(`Failed to delete all vectors: ${error.message}`);
  }
}

/**
 * Check if project has indexed vectors
 */
export async function hasProjectVectors(
  projectId: string,
  namespace?: string
): Promise<boolean> {
  try {
    const index = getPineconeIndex();
    
    // Query with a dummy vector just to check if any records exist
    const dummyVector = new Array(1536).fill(0);
    const response = await index.namespace(namespace || '').query({
      vector: dummyVector,
      topK: 1,
      filter: {
        projectId: { $eq: projectId },
      },
    });

    return response.matches && response.matches.length > 0;
  } catch (error: any) {
    console.error('❌ Error checking project vectors:', error.message);
    return false;
  }
}

/**
 * Check if project data is stale (older than maxAge in milliseconds)
 */
export async function isProjectDataStale(
  projectId: string,
  maxAge: number = 24 * 60 * 60 * 1000, // 24 hours default
  namespace?: string
): Promise<boolean> {
  try {
    const index = getPineconeIndex();
    const cutoffDate = new Date(Date.now() - maxAge).toISOString();
    
    // Query with a dummy vector to check if any recent records exist
    const dummyVector = new Array(1536).fill(0);
    const response = await index.namespace(namespace || '').query({
      vector: dummyVector,
      topK: 1,
      filter: {
        projectId: { $eq: projectId },
        createdAt: { $gte: cutoffDate },
      },
    });

    // If no recent records found, data is stale
    return !response.matches || response.matches.length === 0;
  } catch (error: any) {
    console.error('❌ Error checking if data is stale:', error.message);
    return true; // Assume stale on error
  }
}

export default {
  upsertVectors,
  upsertVectorsWithEmbeddings,
  queryVectors,
  deleteVectorsByProject,
  deleteExpiredVectors,
  deleteAllVectors,
  hasProjectVectors,
  isProjectDataStale,
};
