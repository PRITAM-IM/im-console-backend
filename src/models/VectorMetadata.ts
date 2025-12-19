/**
 * VectorMetadata - TypeScript interfaces for Pinecone vector metadata
 * Defines the structure of metadata attached to each vector in the database
 */

export interface VectorMetadata {
  projectId: string;
  metricType: 'overview' | 'conversion' | 'channel' | 'platform' | 'insight' | 'campaign';
  platform?: string; // e.g., 'metaAds', 'googleAds', 'facebook', 'instagram', etc.
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  dateRangeLabel: string; // Human-readable label like "Dec 11-17, 2025"
  category: string; // e.g., 'traffic', 'conversions', 'organic-search', 'meta-ads'
  textContent: string; // The actual text chunk that was embedded
  metricsSnapshot: Record<string, any>; // JSON snapshot of the metrics
  isFallbackData: boolean; // Whether this is fallback data (last 30 days)
  fallbackPeriod?: string; // If fallback, the actual period of the data
  createdAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp (for TTL - 24 hours from creation)
}

export interface MetricChunk {
  id: string; // Unique identifier for the vector
  text: string; // The text content to be embedded
  metadata: VectorMetadata;
}

export interface VectorQueryResult {
  id: string;
  score: number; // Similarity score (0-1)
  metadata: VectorMetadata;
  text: string; // Retrieved text content
}

export interface EmbeddingResponse {
  embedding: number[];
  text: string;
}

export interface UpsertVectorParams {
  chunks: MetricChunk[];
  namespace?: string; // Optional namespace for multi-tenancy
}

export interface QueryVectorParams {
  embedding: number[];
  projectId: string;
  topK?: number; // Number of results to return (default: 5)
  minScore?: number; // Minimum similarity score (default: 0.7)
  namespace?: string;
  dateRange?: {
    startDate: string;
    endDate: string;
  }; // Optional date range filtering
}

export interface DeleteVectorParams {
  projectId?: string; // Delete all vectors for a project
  beforeDate?: string; // Delete vectors expiring before this date
  namespace?: string;
}
