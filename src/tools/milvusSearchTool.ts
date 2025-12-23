import asyncRagService from '../services/asyncRagService';

/**
 * Milvus Vector Search Tool for Agentic RAG
 * 
 * NOTE: Uses lazy loading for LangChain to prevent memory issues.
 */

// Tool definition (without LangChain dependency)
const milvusSearchDefinition = {
    name: 'milvus_vector_search_tool',
    description: `Use this tool to search historical context and user memory in the Milvus vector database.
  
  **When to use:**
  - Qualitative questions about user preferences, goals, or strategies
  - Questions like "What are my ROAS preferences?" or "What did we discuss about X?"
  - When the user asks about past conversations or insights
  - Strategic questions that require understanding of user's business context
  - Questions about trends or patterns across multiple time periods
  - When specific platform tools don't have the answer
  
  **Do NOT use for:**
  - Specific quantitative queries with dates (use platform tools instead)
  - Real-time metric requests (use platform tools)
  - Questions that can be answered by a single platform tool
  
  **This is the FALLBACK tool** - if no specific platform tool matches, use this to search the entire knowledge base.
  
  **Returns:** Relevant context chunks from Milvus including metrics snapshots, user memories, and historical insights.`,
    func: async ({ query, projectId, userId, topK = 10, includeUserMemory = true }: {
        query: string;
        projectId: string;
        userId: string;
        topK?: number;
        includeUserMemory?: boolean;
    }) => {
        try {
            // Check if Milvus is available
            const isAvailable = await asyncRagService.isAsyncRAGAvailable();
            if (!isAvailable) {
                return JSON.stringify({
                    error: 'Milvus vector database is not available',
                    suggestion: 'Historical context search is currently unavailable. Please ask specific metric questions using date ranges.',
                });
            }

            // Retrieve context from Milvus
            const result = await asyncRagService.retrieveContext(
                query,
                projectId,
                userId,
                undefined, // No specific date range for qualitative queries
                {
                    topK,
                    minScore: 0.60,
                    includeUserMemory,
                }
            );

            if (result.chunks.length === 0) {
                return JSON.stringify({
                    message: 'No relevant historical context found',
                    suggestion: 'This might be a new topic. Consider asking about specific metrics with date ranges.',
                    stats: result.stats,
                });
            }

            // Format the response
            const response: any = {
                success: true,
                query,
                stats: result.stats,
                context: result.context,
            };

            // Add chunk summaries
            if (result.chunks.length > 0) {
                response.relevantChunks = result.chunks.slice(0, 5).map((chunk: any) => ({
                    platform: chunk.platform,
                    category: chunk.category,
                    dateRange: `${chunk.startDate} to ${chunk.endDate}`,
                    relevanceScore: chunk.score,
                    snippet: chunk.text.substring(0, 200) + '...',
                }));
            }

            return JSON.stringify(response, null, 2);
        } catch (error: any) {
            return JSON.stringify({
                error: 'Failed to search Milvus vector database',
                message: error.message,
                suggestion: 'Try asking about specific metrics with date ranges instead.',
            });
        }
    },
};

// Cached tool - created lazily
let cachedTool: any | null = null;

/**
 * Factory function to create the Milvus search tool
 */
export async function createMilvusSearchTool(): Promise<any> {
    if (cachedTool) return cachedTool;

    console.log('[MilvusSearchTool] 🔄 Creating Milvus search tool...');

    const { z } = await import('zod');
    const { DynamicStructuredTool } = await import('@langchain/core/tools');

    const schema = z.object({
        query: z.string().describe('The user query to search for in the vector database'),
        projectId: z.string().describe('The MongoDB ObjectId of the project'),
        userId: z.string().describe('The MongoDB ObjectId of the user'),
        topK: z.number().optional().default(10).describe('Number of results to retrieve (default: 10)'),
        includeUserMemory: z.boolean().optional().default(true).describe('Whether to include user preferences and corrections (default: true)'),
    });

    cachedTool = new (DynamicStructuredTool as any)({
        name: milvusSearchDefinition.name,
        description: milvusSearchDefinition.description,
        schema,
        func: milvusSearchDefinition.func,
    });

    console.log('[MilvusSearchTool] ✅ Milvus search tool created');
    return cachedTool;
}

// Export the definition for reference
export { milvusSearchDefinition };
