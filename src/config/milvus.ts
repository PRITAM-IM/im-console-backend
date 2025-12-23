import { MilvusClient, DataType, ConsistencyLevelEnum } from '@zilliz/milvus2-sdk-node';
import { ENV } from './env';

/**
 * Milvus Configuration (Zilliz Cloud)
 * 
 * Architecture:
 * - hotel_analytics: Main collection for metrics data with partition keys
 * - user_memory: Secondary collection for self-learning user preferences
 * 
 * Key Features:
 * - Partition Keys: projectId for O(1) multi-tenant isolation
 * - Scalar Indexes: timestamp for time-based filtering
 * - Dynamic Schema: Flexible metadata for evolving platform metrics
 */

// Configuration constants
export const MILVUS_CONFIG = {
    // Collection names
    ANALYTICS_COLLECTION: 'hotel_analytics',
    USER_MEMORY_COLLECTION: 'user_memory',

    // Vector dimensions (OpenAI text-embedding-3-small)
    EMBEDDING_DIM: 1536,

    // Index configuration
    INDEX_TYPE: 'HNSW',
    METRIC_TYPE: 'COSINE',

    // HNSW parameters for optimal recall/speed balance
    HNSW_M: 16,          // Number of connections per node
    HNSW_EF_CONSTRUCTION: 256, // Build-time search width
    HNSW_EF: 64,         // Search-time search width

    // Search defaults
    DEFAULT_TOP_K: 10,
    DEFAULT_MIN_SCORE: 0.60, // Slightly lower for better recall

    // Data retention
    TTL_DAYS: 90, // Keep 90 days of history for "last month" queries
};

// Milvus client singleton
let milvusClient: MilvusClient | null = null;

/**
 * Get or initialize Milvus client
 */
export function getMilvusClient(): MilvusClient {
    if (!ENV.MILVUS_ADDRESS) {
        throw new Error('❌ MILVUS_ADDRESS is not configured in environment variables');
    }

    if (!milvusClient) {
        try {
            console.log('🔌 Initializing Milvus client...');
            console.log(`   Address: ${ENV.MILVUS_ADDRESS}`);

            milvusClient = new MilvusClient({
                address: ENV.MILVUS_ADDRESS,
                token: ENV.MILVUS_TOKEN || undefined,
                ssl: ENV.MILVUS_SSL === 'true',
            });

            console.log('✅ Milvus client initialized successfully');
        } catch (error: any) {
            console.error('❌ Failed to initialize Milvus client:', error.message);
            throw error;
        }
    }

    return milvusClient;
}

/**
 * Initialize Milvus collections
 * Creates hotel_analytics and user_memory collections with proper schema
 */
export async function initializeMilvusCollections(): Promise<void> {
    try {
        const client = getMilvusClient();

        // Check and create hotel_analytics collection
        await createAnalyticsCollection(client);

        // Check and create user_memory collection
        await createUserMemoryCollection(client);

        console.log('✅ All Milvus collections initialized');
    } catch (error: any) {
        console.error('❌ Error initializing Milvus collections:', error.message);
        throw error;
    }
}

/**
 * Create hotel_analytics collection
 * Main metrics storage with partition keys for multi-tenant isolation
 */
async function createAnalyticsCollection(client: MilvusClient): Promise<void> {
    const collectionName = MILVUS_CONFIG.ANALYTICS_COLLECTION;

    // Check if collection exists
    const hasCollection = await client.hasCollection({ collection_name: collectionName });

    if (hasCollection.value) {
        console.log(`✅ Collection "${collectionName}" already exists`);
        return;
    }

    console.log(`📊 Creating collection "${collectionName}"...`);

    // Schema definition with partition key and scalar indexes
    const schema = [
        // Primary key - auto-generated UUID
        {
            name: 'id',
            data_type: DataType.VarChar,
            is_primary_key: true,
            max_length: 64,
            description: 'Unique identifier for the vector',
        },
        // Partition key for multi-tenant isolation (O(1) query performance per project)
        {
            name: 'project_id',
            data_type: DataType.VarChar,
            max_length: 64,
            is_partition_key: true,
            description: 'Project ID for tenant isolation',
        },
        // Timestamp for time-based filtering (fixes "last month" issue)
        {
            name: 'timestamp',
            data_type: DataType.Int64,
            description: 'Unix timestamp in milliseconds for temporal queries',
        },
        // Date range for human-readable filtering
        {
            name: 'start_date',
            data_type: DataType.VarChar,
            max_length: 32,
            description: 'Start date in YYYY-MM-DD format',
        },
        {
            name: 'end_date',
            data_type: DataType.VarChar,
            max_length: 32,
            description: 'End date in YYYY-MM-DD format',
        },
        // Metric type categorization
        {
            name: 'metric_type',
            data_type: DataType.VarChar,
            max_length: 64,
            description: 'Type: overview, conversion, channel, platform, insight',
        },
        // Platform identifier
        {
            name: 'platform',
            data_type: DataType.VarChar,
            max_length: 64,
            description: 'Platform: googleAds, metaAds, facebook, instagram, etc.',
        },
        // Category for filtering
        {
            name: 'category',
            data_type: DataType.VarChar,
            max_length: 128,
            description: 'Category for grouping: traffic, conversions, channel-organic, etc.',
        },
        // Text content for retrieval
        {
            name: 'text_content',
            data_type: DataType.VarChar,
            max_length: 8192,
            description: 'The actual text chunk for context retrieval',
        },
        // Metrics snapshot as JSON string
        {
            name: 'metrics_json',
            data_type: DataType.VarChar,
            max_length: 16384,
            description: 'JSON-stringified metrics snapshot',
        },
        // Vector embedding
        {
            name: 'embedding',
            data_type: DataType.FloatVector,
            dim: MILVUS_CONFIG.EMBEDDING_DIM,
            description: 'Vector embedding for semantic search',
        },
    ];

    // Create collection
    await client.createCollection({
        collection_name: collectionName,
        fields: schema,
        enable_dynamic_field: true, // Allow additional metadata fields
    });

    console.log(`📊 Creating indexes for "${collectionName}"...`);

    // Create vector index (HNSW for fast approximate search)
    await client.createIndex({
        collection_name: collectionName,
        field_name: 'embedding',
        index_type: MILVUS_CONFIG.INDEX_TYPE,
        metric_type: MILVUS_CONFIG.METRIC_TYPE,
        params: {
            M: MILVUS_CONFIG.HNSW_M,
            efConstruction: MILVUS_CONFIG.HNSW_EF_CONSTRUCTION,
        },
    });

    // Create scalar index on timestamp for time-based filtering
    await client.createIndex({
        collection_name: collectionName,
        field_name: 'timestamp',
        index_type: 'STL_SORT', // Scalar index for range queries
    });

    // Create scalar index on project_id (partition key)
    await client.createIndex({
        collection_name: collectionName,
        field_name: 'project_id',
        index_type: 'Trie', // Trie index for string matching
    });

    // Load collection into memory
    await client.loadCollection({ collection_name: collectionName });

    console.log(`✅ Collection "${collectionName}" created and loaded successfully`);
}

/**
 * Create user_memory collection
 * Stores user corrections and preferences for self-learning
 */
async function createUserMemoryCollection(client: MilvusClient): Promise<void> {
    const collectionName = MILVUS_CONFIG.USER_MEMORY_COLLECTION;

    // Check if collection exists
    const hasCollection = await client.hasCollection({ collection_name: collectionName });

    if (hasCollection.value) {
        console.log(`✅ Collection "${collectionName}" already exists`);
        return;
    }

    console.log(`🧠 Creating collection "${collectionName}"...`);

    // Schema for user memory
    const schema = [
        {
            name: 'id',
            data_type: DataType.VarChar,
            is_primary_key: true,
            max_length: 64,
            description: 'Unique identifier',
        },
        {
            name: 'user_id',
            data_type: DataType.VarChar,
            max_length: 64,
            is_partition_key: true,
            description: 'User ID for per-user memory isolation',
        },
        {
            name: 'project_id',
            data_type: DataType.VarChar,
            max_length: 64,
            description: 'Project context for the memory',
        },
        {
            name: 'timestamp',
            data_type: DataType.Int64,
            description: 'When the memory was created',
        },
        {
            name: 'memory_type',
            data_type: DataType.VarChar,
            max_length: 64,
            description: 'Type: correction, preference, instruction',
        },
        {
            name: 'original_query',
            data_type: DataType.VarChar,
            max_length: 2048,
            description: 'The original user query',
        },
        {
            name: 'correction',
            data_type: DataType.VarChar,
            max_length: 4096,
            description: 'User correction or instruction',
        },
        {
            name: 'embedding',
            data_type: DataType.FloatVector,
            dim: MILVUS_CONFIG.EMBEDDING_DIM,
            description: 'Vector embedding of the correction',
        },
    ];

    // Create collection
    await client.createCollection({
        collection_name: collectionName,
        fields: schema,
        enable_dynamic_field: true,
    });

    // Create vector index
    await client.createIndex({
        collection_name: collectionName,
        field_name: 'embedding',
        index_type: MILVUS_CONFIG.INDEX_TYPE,
        metric_type: MILVUS_CONFIG.METRIC_TYPE,
        params: {
            M: MILVUS_CONFIG.HNSW_M,
            efConstruction: MILVUS_CONFIG.HNSW_EF_CONSTRUCTION,
        },
    });

    // Create scalar index on user_id
    await client.createIndex({
        collection_name: collectionName,
        field_name: 'user_id',
        index_type: 'Trie',
    });

    // Load collection
    await client.loadCollection({ collection_name: collectionName });

    console.log(`✅ Collection "${collectionName}" created and loaded successfully`);
}

/**
 * Get collection statistics
 */
export async function getCollectionStats(collectionName: string): Promise<any> {
    try {
        const client = getMilvusClient();
        const stats = await client.getCollectionStatistics({ collection_name: collectionName });
        return stats;
    } catch (error: any) {
        console.error('❌ Error getting collection stats:', error.message);
        throw error;
    }
}

/**
 * Health check for Milvus connection
 */
export async function checkMilvusHealth(): Promise<boolean> {
    try {
        const client = getMilvusClient();
        const health = await client.checkHealth();
        return health.isHealthy;
    } catch (error) {
        return false;
    }
}

export default {
    getMilvusClient,
    initializeMilvusCollections,
    getCollectionStats,
    checkMilvusHealth,
    MILVUS_CONFIG,
};
