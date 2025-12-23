/**
 * Tools Index
 * 
 * Exports lazy-loaded tools for the Agentic RAG architecture.
 * All tools are created via factory functions to prevent memory issues during initialization.
 * LangChain is ONLY imported when tools are actually needed (first chat request).
 */

import { createPlatformTools } from './platformTools';
import { createTimeParsingTool } from './timeParsingTool';
import { createMilvusSearchTool } from './milvusSearchTool';

// Cached tools array
let cachedAllTools: any[] | null = null;

/**
 * Create all agent tools lazily
 * This function should be called when the agent needs the tools, not at startup.
 */
export async function createAllAgentTools(): Promise<any[]> {
    if (cachedAllTools) return cachedAllTools;

    console.log('[Tools] 🔄 Creating all agent tools...');

    // Create all tools in parallel
    const [platformTools, timeParsingTool, milvusSearchTool] = await Promise.all([
        createPlatformTools(),
        createTimeParsingTool(),
        createMilvusSearchTool(),
    ]);

    cachedAllTools = [
        timeParsingTool,
        ...platformTools,
        milvusSearchTool,
    ];

    console.log('[Tools] ✅ Created', cachedAllTools.length, 'total tools');
    return cachedAllTools;
}

// Export factory functions for individual use
export {
    createPlatformTools,
    createTimeParsingTool,
    createMilvusSearchTool,
};

// Default export is the factory function
export default createAllAgentTools;
