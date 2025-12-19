import { ENV } from '../config/env';

/**
 * OpenAI Error Handler Utility
 * Provides retry logic and error handling for OpenAI API calls
 */

export interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
};

/**
 * Check if error is retryable
 */
function isRetryableError(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }
  
  // OpenAI API errors
  if (error.status) {
    // Rate limit errors (429)
    if (error.status === 429) return true;
    
    // Server errors (500-599)
    if (error.status >= 500) return true;
  }
  
  return false;
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, config: Required<RetryConfig>): number {
  const delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
  // Add jitter (random 0-20%)
  const jitter = delay * 0.2 * Math.random();
  return Math.floor(delay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: any;
  
  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // If this is the last attempt or error is not retryable, throw
      if (attempt === retryConfig.maxRetries || !isRetryableError(error)) {
        throw error;
      }
      
      // Calculate delay and wait
      const delay = getBackoffDelay(attempt, retryConfig);
      console.log(`[OpenAI Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Handle OpenAI errors and provide meaningful messages
 */
export function handleOpenAIError(error: any): string {
  // API key issues
  if (error.status === 401 || error.message?.includes('API key')) {
    return 'OpenAI API key is invalid or not configured. Please check your environment variables.';
  }
  
  // Rate limit
  if (error.status === 429) {
    return 'OpenAI API rate limit exceeded. Please try again in a moment.';
  }
  
  // Server errors
  if (error.status >= 500) {
    return 'OpenAI service is temporarily unavailable. Please try again later.';
  }
  
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return 'Network connection issue. Please check your internet connection and try again.';
  }
  
  // Quota/billing issues
  if (error.message?.includes('quota') || error.message?.includes('billing')) {
    return 'OpenAI API quota exceeded or billing issue. Please check your OpenAI account.';
  }
  
  // Invalid request
  if (error.status === 400) {
    return `Invalid request to OpenAI API: ${error.message || 'Unknown error'}`;
  }
  
  // Default error message
  return `OpenAI API error: ${error.message || 'Unknown error'}`;
}

/**
 * Validate OpenAI configuration
 */
export function validateOpenAIConfig(): { valid: boolean; message?: string } {
  if (!ENV.OPENAI_API_KEY) {
    return {
      valid: false,
      message: 'OPENAI_API_KEY is not configured in environment variables',
    };
  }
  
  if (!ENV.OPENAI_API_KEY.startsWith('sk-')) {
    return {
      valid: false,
      message: 'OPENAI_API_KEY appears to be invalid (should start with "sk-")',
    };
  }
  
  return { valid: true };
}

export default {
  retryWithBackoff,
  handleOpenAIError,
  validateOpenAIConfig,
};
