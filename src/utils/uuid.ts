/**
 * UUID Generator Utility
 * Simple UUID v4 generator that works in both CommonJS and ESM environments
 * Compatible with Vercel serverless functions
 */

/**
 * Generate a UUID v4 (random UUID)
 * Uses crypto.randomUUID() if available (Node 14.17+), otherwise uses fallback
 */
export function generateUUID(): string {
  // Try to use native crypto.randomUUID() (Node 14.17+)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback: Manual UUID v4 generation
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Alias for compatibility with uuid package
 */
export const v4 = generateUUID;

export default {
  v4: generateUUID,
  generateUUID,
};
