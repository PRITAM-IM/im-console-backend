import { openai } from '../config/openai';
import { EmbeddingResponse } from '../models/VectorMetadata';

/**
 * Embedding Service
 * Generates embeddings using OpenAI's text-embedding-3-small model
 */

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // Start with 1 second

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty for embedding generation');
  }

  let lastError: Error | null = null;

  // Retry logic with exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🔮 Generating embedding (attempt ${attempt}/${MAX_RETRIES})...`);
      
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('OpenAI returned empty embedding response');
      }

      const embedding = response.data[0].embedding;
      
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`);
      }

      console.log(`✅ Embedding generated successfully (${embedding.length} dimensions)`);
      return embedding;
    } catch (error: any) {
      lastError = error;
      console.error(`❌ Embedding generation failed (attempt ${attempt}/${MAX_RETRIES}):`, error.message);

      // Check if it's a rate limit error
      if (error.status === 429 && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`⏳ Rate limited. Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // If not a rate limit error or last attempt, throw immediately
      if (attempt === MAX_RETRIES) {
        break;
      }

      // For other errors, wait briefly before retry
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }

  // All retries failed
  throw new Error(`Failed to generate embedding after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Generate embeddings for multiple texts in batch
 * OpenAI supports up to 2048 texts per batch, but we'll use smaller batches for safety
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<EmbeddingResponse[]> {
  if (!texts || texts.length === 0) {
    return [];
  }

  const BATCH_SIZE = 100; // Process 100 texts at a time
  const results: EmbeddingResponse[] = [];

  console.log(`📦 Generating embeddings for ${texts.length} texts in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

    console.log(`🔮 Processing batch ${batchNumber}/${totalBatches} (${batch.length} texts)...`);

    let lastError: Error | null = null;

    // Retry logic for batch
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
        });

        if (!response.data || response.data.length !== batch.length) {
          throw new Error(`Expected ${batch.length} embeddings, got ${response.data?.length || 0}`);
        }

        // Map results to include original text
        const batchResults = response.data.map((item, index) => ({
          embedding: item.embedding,
          text: batch[index],
        }));

        results.push(...batchResults);
        console.log(`✅ Batch ${batchNumber}/${totalBatches} completed`);
        break; // Success, exit retry loop
      } catch (error: any) {
        lastError = error;
        console.error(`❌ Batch ${batchNumber} failed (attempt ${attempt}/${MAX_RETRIES}):`, error.message);

        if (error.status === 429 && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
          console.log(`⏳ Rate limited. Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (attempt === MAX_RETRIES) {
          throw new Error(`Batch ${batchNumber} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`✅ Generated ${results.length} embeddings successfully`);
  return results;
}

/**
 * Validate embedding vector
 */
export function validateEmbedding(embedding: number[]): boolean {
  if (!Array.isArray(embedding)) return false;
  if (embedding.length !== EMBEDDING_DIMENSIONS) return false;
  return embedding.every(val => typeof val === 'number' && !isNaN(val));
}

export default {
  generateEmbedding,
  generateEmbeddingsBatch,
  validateEmbedding,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
};
