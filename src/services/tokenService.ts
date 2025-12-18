import { Tiktoken, encodingForModel } from 'js-tiktoken';
import { OPENAI_CONFIG } from '../config/openai';

/**
 * Token Management Service
 * Handles token counting and context window management for OpenAI API
 */

let encoder: Tiktoken | null = null;

/**
 * Get or initialize the token encoder for the current model
 */
function getEncoder(): Tiktoken {
  if (!encoder) {
    try {
      // Get encoding for the configured model
      const modelName = OPENAI_CONFIG.model as any;
      encoder = encodingForModel(modelName);
    } catch (error) {
      // Fallback to gpt-4 encoding if model not recognized
      console.warn('[TokenService] Could not get encoding for model, using gpt-4 fallback');
      encoder = encodingForModel('gpt-4');
    }
  }
  return encoder;
}

/**
 * Count tokens in a single text string
 */
export function countTokens(text: string): number {
  try {
    const enc = getEncoder();
    const tokens = enc.encode(text);
    return tokens.length;
  } catch (error) {
    console.error('[TokenService] Error counting tokens:', error);
    // Fallback: rough estimate (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens in an array of messages (OpenAI chat format)
 */
export function countMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  let totalTokens = 0;
  
  for (const message of messages) {
    // Count tokens for role and content
    totalTokens += countTokens(message.role);
    totalTokens += countTokens(message.content);
    // Add overhead per message (approximately 3 tokens per message for formatting)
    totalTokens += 3;
  }
  
  // Add overhead for the entire messages array
  totalTokens += 3;
  
  return totalTokens;
}

/**
 * Estimate total tokens for a chat completion request
 */
export function estimateRequestTokens(
  messages: Array<{ role: string; content: string }>,
  maxResponseTokens: number = OPENAI_CONFIG.maxTokens
): {
  promptTokens: number;
  maxResponseTokens: number;
  totalTokens: number;
} {
  const promptTokens = countMessagesTokens(messages);
  const totalTokens = promptTokens + maxResponseTokens;
  
  return {
    promptTokens,
    maxResponseTokens,
    totalTokens,
  };
}

/**
 * Check if a request will exceed the context window
 * Returns warning message if approaching limits
 */
export function checkTokenLimits(
  messages: Array<{ role: string; content: string }>,
  maxResponseTokens: number = OPENAI_CONFIG.maxTokens
): {
  isValid: boolean;
  warning?: string;
  estimate: ReturnType<typeof estimateRequestTokens>;
} {
  const estimate = estimateRequestTokens(messages, maxResponseTokens);
  
  // Model context window limits (approximate)
  const contextLimits: Record<string, number> = {
    'gpt-4-turbo': 128000,
    'gpt-4': 8192,
    'gpt-3.5-turbo': 16385,
  };
  
  const modelName = OPENAI_CONFIG.model;
  const limit = contextLimits[modelName] || 8192;
  
  // Check if exceeds hard limit
  if (estimate.totalTokens > limit) {
    return {
      isValid: false,
      warning: `Request exceeds context window limit (${estimate.totalTokens} > ${limit} tokens)`,
      estimate,
    };
  }
  
  // Warn if approaching limit (80% threshold)
  if (estimate.totalTokens > limit * 0.8) {
    return {
      isValid: true,
      warning: `Approaching context window limit (${estimate.totalTokens} / ${limit} tokens)`,
      estimate,
    };
  }
  
  return {
    isValid: true,
    estimate,
  };
}

/**
 * Truncate conversation history to fit within token limits
 * Keeps system message and most recent messages
 */
export function truncateMessages(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 4000
): Array<{ role: string; content: string }> {
  if (messages.length === 0) return messages;
  
  // Always keep system message (first message)
  const systemMessage = messages[0].role === 'system' ? messages[0] : null;
  const conversationMessages = systemMessage ? messages.slice(1) : messages;
  
  // Start with system message tokens
  let totalTokens = systemMessage ? countMessagesTokens([systemMessage]) : 0;
  const truncated: Array<{ role: string; content: string }> = [];
  
  // Add messages from most recent, working backwards
  for (let i = conversationMessages.length - 1; i >= 0; i--) {
    const message = conversationMessages[i];
    const messageTokens = countMessagesTokens([message]);
    
    if (totalTokens + messageTokens <= maxTokens) {
      truncated.unshift(message);
      totalTokens += messageTokens;
    } else {
      break;
    }
  }
  
  // Combine system message with truncated conversation
  const result = systemMessage ? [systemMessage, ...truncated] : truncated;
  
  console.log(`[TokenService] Truncated messages: ${messages.length} -> ${result.length} (${totalTokens} tokens)`);
  
  return result;
}

/**
 * Cleanup encoder on process exit
 */
export function cleanupEncoder(): void {
  if (encoder) {
    // Note: js-tiktoken v1.x doesn't require manual cleanup
    // The encoder will be garbage collected automatically
    encoder = null;
  }
}
