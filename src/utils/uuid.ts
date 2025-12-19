/**
 * UUID Generator Utility
 * Simple UUID v4 generator that works in both CommonJS and ESM environments
 * Compatible with Vercel serverless functions
 */

import { randomBytes } from 'crypto';

/**
 * Generate a UUID v4 (random UUID)
 * Uses crypto.randomBytes for secure random generation
 */
export function generateUUID(): string {
  // Use Node.js crypto.randomBytes for secure random generation
  const bytes = randomBytes(16);
  
  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10
  
  // Convert to UUID string format
  const hex = bytes.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

/**
 * Alias for compatibility with uuid package
 */
export const v4 = generateUUID;

export default {
  v4: generateUUID,
  generateUUID,
};
