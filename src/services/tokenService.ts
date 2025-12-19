import { Tiktoken, encodingForModel } from 'js-tiktoken';
import { ChatMessage } from './chatService';
import { OPENAI_CONFIG } from '../config/openai';

/**
 * Token Service
 * Handles token counting and message truncation for OpenAI API
 */

let encoder: Tiktoken | null = null;

/**
 * Get or initialize the tokenizer
 */
function getEncoder(): Tiktoken | null {
  if (!encoder) {
    try {
      // Use GPT-4 tokenizer (cl100k_base encoding)
      encoder = encodingForModel('gpt-4');
    } catch (error) {
      console.error('[TokenService] Failed to initialize tokenizer:', error);
      return null;
    }
  }
  return encoder;
}

/**
 * Count tokens in a string
 */
export function countTokens(text: string): number {
  try {
    const enc = getEncoder();
    if (!enc) {
      // Fallback: rough estimate (1 token ≈ 4 characters)
      return Math.ceil(text.length / 4);
    }
    const tokens = enc.encode(text);
    return tokens.length;
  } catch (error) {
    console.error('[TokenService] Error counting tokens:', error);
    // Fallback: rough estimate (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens in messages array
 */
export function countMessagesTokens(messages: ChatMessage[]): number {
  let totalTokens = 0;
  
  for (const message of messages) {
    // Each message has some overhead (role, formatting, etc.)
    totalTokens += 4; // Overhead per message
    totalTokens += countTokens(message.role);
    totalTokens += countTokens(message.content);
  }
  
  totalTokens += 2; // Additional overhead for the entire request
  
  return totalTokens;
}

/**
 * Check if messages fit within token limits
 * Returns { withinLimit: boolean, estimatedTokens: number }
 */
export function checkTokenLimits(
  messages: ChatMessage[],
  maxTokens: number = OPENAI_CONFIG.maxTokens
): { withinLimit: boolean; estimatedTokens: number } {
  const messageTokens = countMessagesTokens(messages);
  const responseTokens = maxTokens;
  const estimatedTotal = messageTokens + responseTokens;
  
  // GPT-4 context limit is 8192 tokens, GPT-4-turbo is 128k
  // We'll use a safe limit of 16000 for total (prompt + response)
  const contextLimit = 16000;
  
  return {
    withinLimit: estimatedTotal <= contextLimit,
    estimatedTokens: estimatedTotal,
  };
}

/**
 * Truncate messages to fit within token limits
 * Keeps system message and most recent messages
 */
export function truncateMessages(
  messages: ChatMessage[],
  maxContextTokens: number = 12000
): ChatMessage[] {
  if (messages.length === 0) return messages;
  
  // Always keep the system message (first message)
  const systemMessage = messages[0].role === 'system' ? messages[0] : null;
  const otherMessages = systemMessage ? messages.slice(1) : messages;
  
  // Start from the most recent messages and work backwards
  const truncated: ChatMessage[] = [];
  let currentTokens = systemMessage ? countMessagesTokens([systemMessage]) : 0;
  
  // Add messages from most recent to oldest
  for (let i = otherMessages.length - 1; i >= 0; i--) {
    const message = otherMessages[i];
    const messageTokens = countMessagesTokens([message]);
    
    if (currentTokens + messageTokens <= maxContextTokens) {
      truncated.unshift(message);
      currentTokens += messageTokens;
    } else {
      // Stop adding messages if we exceed the limit
      break;
    }
  }
  
  // Prepend system message if it exists
  const result = systemMessage ? [systemMessage, ...truncated] : truncated;
  
  console.log(`[TokenService] Truncated messages from ${messages.length} to ${result.length} (${currentTokens} tokens)`);
  
  return result;
}

/**
 * Cleanup function to free encoder resources
 */
export function cleanup(): void {
  if (encoder) {
    // Note: js-tiktoken Tiktoken doesn't have a free() method
    // Just set to null for garbage collection
    encoder = null;
  }
}

export default {
  countTokens,
  countMessagesTokens,
  checkTokenLimits,
  truncateMessages,
  cleanup,
};
