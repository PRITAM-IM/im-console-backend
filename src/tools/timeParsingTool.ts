import * as chrono from 'chrono-node';

/**
 * Time Parsing Tool for Agentic RAG
 * 
 * Converts natural language date references into ISO 8601 date strings (YYYY-MM-DD).
 * NOTE: Uses lazy loading for LangChain to prevent memory issues.
 */

// Tool definition (without LangChain dependency)
const timeParsingDefinition = {
    name: 'time_parsing_tool',
    description: `Use this tool to convert natural language date expressions into ISO 8601 date strings (YYYY-MM-DD format).
  
  **When to use:**
  - User mentions relative dates like "yesterday", "last week", "7 days ago"
  - User mentions specific days like "last Tuesday", "this Monday"
  - User mentions periods like "last month", "Q1", "this year"
  - Before calling ANY platform tool with date parameters
  
  **Examples:**
  - "yesterday" → returns startDate and endDate for yesterday
  - "last 7 days" → returns startDate (7 days ago) and endDate (yesterday)
  - "last Tuesday" → returns startDate and endDate for last Tuesday
  - "last month" → returns startDate (first day of last month) and endDate (last day of last month)
  - "Q1 2024" → returns startDate (2024-01-01) and endDate (2024-03-31)
  
  **Returns:** JSON with startDate and endDate in YYYY-MM-DD format, plus interpretation details.`,
    func: async ({ naturalLanguageDate, referenceDate }: { naturalLanguageDate: string; referenceDate?: string }) => {
        try {
            const refDate = referenceDate ? new Date(referenceDate) : new Date();

            // Parse the natural language date
            const parsed = chrono.parse(naturalLanguageDate, refDate);

            if (parsed.length === 0) {
                // Try common patterns manually if chrono fails
                const result = parseCommonPatterns(naturalLanguageDate, refDate);
                if (result) {
                    return JSON.stringify(result, null, 2);
                }

                return JSON.stringify({
                    error: 'Could not parse date expression',
                    input: naturalLanguageDate,
                    suggestion: 'Try using formats like "yesterday", "last 7 days", "last month", or specific dates like "2024-01-15"',
                });
            }

            // Get the parsed date
            const parsedDate = parsed[0];
            let startDate: Date;
            let endDate: Date;

            // Check if it's a range or single date
            if (parsedDate.end) {
                startDate = parsedDate.start.date();
                endDate = parsedDate.end.date();
            } else {
                startDate = parsedDate.start.date();
                endDate = new Date(startDate);
            }

            // Handle special cases for common queries
            const lowerInput = naturalLanguageDate.toLowerCase();

            // "last X days" pattern
            if (lowerInput.includes('last') && (lowerInput.includes('day') || lowerInput.includes('week'))) {
                const daysMatch = lowerInput.match(/(\d+)\s*days?/);
                if (daysMatch) {
                    const days = parseInt(daysMatch[1]);
                    endDate = new Date(refDate);
                    endDate.setDate(endDate.getDate() - 1);
                    startDate = new Date(endDate);
                    startDate.setDate(startDate.getDate() - (days - 1));
                } else if (lowerInput.includes('week')) {
                    endDate = new Date(refDate);
                    endDate.setDate(endDate.getDate() - 1);
                    startDate = new Date(endDate);
                    startDate.setDate(startDate.getDate() - 6);
                }
            }

            // "last month" pattern
            if (lowerInput.includes('last month')) {
                const lastMonth = new Date(refDate);
                lastMonth.setMonth(lastMonth.getMonth() - 1);
                startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
                endDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
            }

            // "this month" pattern
            if (lowerInput.includes('this month')) {
                startDate = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
                endDate = new Date(refDate);
                endDate.setDate(endDate.getDate() - 1);
            }

            // Format dates as YYYY-MM-DD
            const formatDate = (date: Date): string => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const result = {
                success: true,
                input: naturalLanguageDate,
                interpretation: parsedDate.text,
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                daysInRange: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
            };

            return JSON.stringify(result, null, 2);
        } catch (error: any) {
            return JSON.stringify({
                error: 'Failed to parse date',
                input: naturalLanguageDate,
                message: error.message,
            });
        }
    },
};

/**
 * Fallback parser for common patterns that chrono might miss
 */
function parseCommonPatterns(input: string, refDate: Date): any | null {
    const lower = input.toLowerCase().trim();
    const today = new Date(refDate);

    const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Yesterday
    if (lower === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
            success: true,
            input,
            interpretation: 'yesterday',
            startDate: formatDate(yesterday),
            endDate: formatDate(yesterday),
            daysInRange: 1,
        };
    }

    // Today
    if (lower === 'today') {
        return {
            success: true,
            input,
            interpretation: 'today',
            startDate: formatDate(today),
            endDate: formatDate(today),
            daysInRange: 1,
        };
    }

    // Last 7 days (default)
    if (lower.includes('last 7 days') || lower.includes('past 7 days') || lower.includes('last week')) {
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() - 1);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 6);
        return {
            success: true,
            input,
            interpretation: 'last 7 days',
            startDate: formatDate(startDate),
            endDate: formatDate(endDate),
            daysInRange: 7,
        };
    }

    // Last 30 days
    if (lower.includes('last 30 days') || lower.includes('past 30 days')) {
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() - 1);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 29);
        return {
            success: true,
            input,
            interpretation: 'last 30 days',
            startDate: formatDate(startDate),
            endDate: formatDate(endDate),
            daysInRange: 30,
        };
    }

    // Last month
    if (lower.includes('last month')) {
        const lastMonth = new Date(today);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
        const endDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
        return {
            success: true,
            input,
            interpretation: 'last month',
            startDate: formatDate(startDate),
            endDate: formatDate(endDate),
            daysInRange: endDate.getDate(),
        };
    }

    // This month (up to yesterday)
    if (lower.includes('this month')) {
        const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() - 1);
        return {
            success: true,
            input,
            interpretation: 'this month (up to yesterday)',
            startDate: formatDate(startDate),
            endDate: formatDate(endDate),
            daysInRange: endDate.getDate(),
        };
    }

    return null;
}

// Cached tool - created lazily
let cachedTool: any | null = null;

/**
 * Factory function to create the time parsing tool
 */
export async function createTimeParsingTool(): Promise<any> {
    if (cachedTool) return cachedTool;

    console.log('[TimeParsingTool] 🔄 Creating time parsing tool...');

    const { z } = await import('zod');
    const { DynamicStructuredTool } = await import('@langchain/core/tools');

    const schema = z.object({
        naturalLanguageDate: z.string().describe('The natural language date expression to parse (e.g., "last Tuesday", "7 days ago", "last month")'),
        referenceDate: z.string().optional().describe('Optional reference date in YYYY-MM-DD format. Defaults to today.'),
    });

    cachedTool = new (DynamicStructuredTool as any)({
        name: timeParsingDefinition.name,
        description: timeParsingDefinition.description,
        schema,
        func: timeParsingDefinition.func,
    });

    console.log('[TimeParsingTool] ✅ Time parsing tool created');
    return cachedTool;
}

// Export the definition for reference
export { timeParsingDefinition };
