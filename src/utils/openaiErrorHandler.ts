import { OpenAI } from 'openai';

/**
 * OpenAI Error Handler
 * Provides user-friendly error messages and handles common OpenAI API errors
 */

export interface OpenAIError {
  message: string;
  code?: string;
  statusCode?: number;
  retryable: boolean;
}

/**
 * Handle OpenAI API errors and return user-friendly messages
 */
export function handleOpenAIError(error: any): OpenAIError {
  console.error('[OpenAI Error]', {
    message: error.message,
    status: error.status,
    code: error.code,
    type: error.type,
  });

  // Rate limiting (429)
  if (error.status === 429) {
    return {
      message: 'Avi is experiencing high demand right now. Please try again in a moment.',
      code: 'RATE_LIMIT',
      statusCode: 429,
      retryable: true,
    };
  }

  // Token limit exceeded
  if (error.status === 400 && error.message?.includes('maximum context length')) {
    return {
      message: 'This conversation has become too long. Please start a new conversation.',
      code: 'CONTEXT_LENGTH_EXCEEDED',
      statusCode: 400,
      retryable: false,
    };
  }

  // Authentication errors (401)
  if (error.status === 401) {
    return {
      message: 'AI service authentication failed. Please contact support.',
      code: 'AUTH_ERROR',
      statusCode: 401,
      retryable: false,
    };
  }

  // Invalid request (400)
  if (error.status === 400) {
    return {
      message: 'Invalid request to AI service. Please try rephrasing your question.',
      code: 'BAD_REQUEST',
      statusCode: 400,
      retryable: false,
    };
  }

  // Server errors (500, 503)
  if (error.status >= 500) {
    return {
      message: 'AI service is temporarily unavailable. Please try again later.',
      code: 'SERVER_ERROR',
      statusCode: error.status,
      retryable: true,
    };
  }

  // Network/Connection errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return {
      message: 'Unable to connect to AI service. Please check your connection and try again.',
      code: 'CONNECTION_ERROR',
      retryable: true,
    };
  }

  // API key errors
  if (error.message?.includes('API key')) {
    return {
      message: 'AI service configuration error. Please contact support.',
      code: 'API_KEY_ERROR',
      statusCode: 401,
      retryable: false,
    };
  }

  // Model not found or deprecated
  if (error.status === 404 || error.message?.includes('model')) {
    return {
      message: 'AI service configuration error. Please contact support.',
      code: 'MODEL_ERROR',
      statusCode: 404,
      retryable: false,
    };
  }

  // Generic fallback
  return {
    message: 'Avi encountered an unexpected error. Please try again.',
    code: 'UNKNOWN_ERROR',
    retryable: true,
  };
}

/**
 * Retry logic for retryable errors
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const handledError = handleOpenAIError(error);
      lastError = error;

      // Don't retry if error is not retryable
      if (!handledError.retryable) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Calculate backoff delay: exponential with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(`[OpenAI] Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Validate OpenAI configuration
 */
export function validateOpenAIConfig(apiKey: string): { valid: boolean; error?: string } {
  if (!apiKey) {
    return {
      valid: false,
      error: 'OpenAI API key is not configured',
    };
  }

  if (!apiKey.startsWith('sk-')) {
    return {
      valid: false,
      error: 'OpenAI API key format is invalid',
    };
  }

  return { valid: true };
}
