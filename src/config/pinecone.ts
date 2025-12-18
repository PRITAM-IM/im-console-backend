import { Pinecone } from '@pinecone-database/pinecone';
import { ENV } from './env';

/**
 * Pinecone Configuration
 * Initializes Pinecone client and manages index configuration
 */

// Configuration constants
export const PINECONE_CONFIG = {
  indexName: ENV.PINECONE_INDEX_NAME || 'hotel-analytics-metrics',
  dimension: 1536, // OpenAI text-embedding-3-small dimensions
  metric: 'cosine' as const,
  cloud: 'aws' as const,
  region: 'us-east-1',
};

// Initialize Pinecone client
let pineconeClient: Pinecone | null = null;

/**
 * Get or initialize Pinecone client
 */
export function getPineconeClient(): Pinecone {
  if (!ENV.PINECONE_API_KEY) {
    throw new Error('❌ PINECONE_API_KEY is not configured in environment variables');
  }

  if (!pineconeClient) {
    console.log('🔌 Initializing Pinecone client...');
    pineconeClient = new Pinecone({
      apiKey: ENV.PINECONE_API_KEY,
    });
    console.log('✅ Pinecone client initialized successfully');
  }

  return pineconeClient;
}

/**
 * Initialize Pinecone index (create if doesn't exist)
 * Call this during application startup
 */
export async function initializePineconeIndex(): Promise<void> {
  try {
    const client = getPineconeClient();
    
    console.log(`🔍 Checking if index "${PINECONE_CONFIG.indexName}" exists...`);
    
    // List existing indexes
    const indexes = await client.listIndexes();
    const indexExists = indexes.indexes?.some(index => index.name === PINECONE_CONFIG.indexName);

    if (indexExists) {
      console.log(`✅ Index "${PINECONE_CONFIG.indexName}" already exists`);
      return;
    }

    // Create serverless index if it doesn't exist
    console.log(`📊 Creating new index "${PINECONE_CONFIG.indexName}"...`);
    await client.createIndex({
      name: PINECONE_CONFIG.indexName,
      dimension: PINECONE_CONFIG.dimension,
      metric: PINECONE_CONFIG.metric,
      spec: {
        serverless: {
          cloud: PINECONE_CONFIG.cloud,
          region: PINECONE_CONFIG.region,
        },
      },
    });

    console.log(`✅ Index "${PINECONE_CONFIG.indexName}" created successfully`);
    
    // Wait for index to be ready
    console.log('⏳ Waiting for index to be ready...');
    await waitForIndexReady(client, PINECONE_CONFIG.indexName);
    console.log('✅ Index is ready for operations');
  } catch (error: any) {
    console.error('❌ Error initializing Pinecone index:', error.message);
    throw error;
  }
}

/**
 * Wait for index to be ready (max 60 seconds)
 */
async function waitForIndexReady(client: Pinecone, indexName: string, maxWaitTime = 60000): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 2000; // Check every 2 seconds

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const indexDescription = await client.describeIndex(indexName);
      if (indexDescription.status?.ready) {
        return;
      }
    } catch (error) {
      // Index might not be immediately available, continue polling
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Index "${indexName}" did not become ready within ${maxWaitTime}ms`);
}

/**
 * Get Pinecone index instance
 */
export function getPineconeIndex() {
  const client = getPineconeClient();
  return client.index(PINECONE_CONFIG.indexName);
}

/**
 * Delete Pinecone index (use with caution!)
 */
export async function deletePineconeIndex(): Promise<void> {
  try {
    const client = getPineconeClient();
    console.log(`🗑️ Deleting index "${PINECONE_CONFIG.indexName}"...`);
    await client.deleteIndex(PINECONE_CONFIG.indexName);
    console.log(`✅ Index "${PINECONE_CONFIG.indexName}" deleted successfully`);
  } catch (error: any) {
    console.error('❌ Error deleting Pinecone index:', error.message);
    throw error;
  }
}

/**
 * Get index statistics
 */
export async function getIndexStats() {
  try {
    const index = getPineconeIndex();
    const stats = await index.describeIndexStats();
    return stats;
  } catch (error: any) {
    console.error('❌ Error fetching index stats:', error.message);
    throw error;
  }
}

export default {
  getPineconeClient,
  getPineconeIndex,
  initializePineconeIndex,
  deletePineconeIndex,
  getIndexStats,
  PINECONE_CONFIG,
};
