/**
 * Query Intent Parser
 * 
 * Parses user queries to extract temporal and contextual intent for:
 * - Time-based filtering (last week, September, yesterday)
 * - Platform-specific queries (Google Ads performance)
 * - Metric type filtering (conversions, traffic, revenue)
 * 
 * This enables accurate Milvus filtered vector searches.
 */

export interface ParsedIntent {
    // Temporal intent
    timeframe: {
        startTime: number;  // Unix timestamp in ms
        endTime: number;    // Unix timestamp in ms
        startDate: string;  // YYYY-MM-DD
        endDate: string;    // YYYY-MM-DD
        label: string;      // Human-readable label
        isHistorical: boolean;  // True if asking about past data
    };

    // Platform intent
    platforms: string[];   // e.g., ['googleAds', 'metaAds']

    // Metric type intent
    metricTypes: string[]; // e.g., ['conversion', 'platform']

    // Original query
    originalQuery: string;

    // Confidence score
    confidence: number;    // 0-1 score of parsing confidence
}

// Time pattern matchers
const TIME_PATTERNS = {
    // Relative patterns
    today: /\b(today|today'?s?)\b/i,
    yesterday: /\b(yesterday|yesterday'?s?)\b/i,
    thisWeek: /\b(this\s+week|current\s+week)\b/i,
    lastWeek: /\b(last\s+week|previous\s+week|past\s+week)\b/i,
    thisMonth: /\b(this\s+month|current\s+month)\b/i,
    lastMonth: /\b(last\s+month|previous\s+month|past\s+month)\b/i,
    twoMonthsAgo: /\b(two\s+months?\s+ago|2\s+months?\s+ago)\b/i,
    threeMonthsAgo: /\b(three\s+months?\s+ago|3\s+months?\s+ago)\b/i,
    lastNDays: /\b(last|past)\s+(\d+)\s+days?\b/i,
    lastNWeeks: /\b(last|past)\s+(\d+)\s+weeks?\b/i,
    lastNMonths: /\b(last|past)\s+(\d+)\s+months?\b/i,

    // Specific month patterns
    january: /\b(january|jan)\b/i,
    february: /\b(february|feb)\b/i,
    march: /\b(march|mar)\b/i,
    april: /\b(april|apr)\b/i,
    may: /\b(may)\b/i,
    june: /\b(june|jun)\b/i,
    july: /\b(july|jul)\b/i,
    august: /\b(august|aug)\b/i,
    september: /\b(september|sept?)\b/i,
    october: /\b(october|oct)\b/i,
    november: /\b(november|nov)\b/i,
    december: /\b(december|dec)\b/i,

    // Quarter patterns
    q1: /\b(q1|first\s+quarter)\b/i,
    q2: /\b(q2|second\s+quarter)\b/i,
    q3: /\b(q3|third\s+quarter)\b/i,
    q4: /\b(q4|fourth\s+quarter)\b/i,
};

// Platform matchers
const PLATFORM_PATTERNS: Record<string, RegExp> = {
    googleAds: /\b(google\s*ads?|adwords|google\s*advertising|paid\s*search)\b/i,
    metaAds: /\b(meta\s*ads?|facebook\s*ads?|fb\s*ads?|instagram\s*ads?)\b/i,
    facebook: /\b(facebook|fb)(?!\s*ads?)\b/i,
    instagram: /\b(instagram|ig|insta)(?!\s*ads?)\b/i,
    searchConsole: /\b(search\s*console|gsc|organic\s*search|seo)\b/i,
    googleAnalytics: /\b(google\s*analytics|ga4?|analytics)\b/i,
    youtube: /\b(youtube|yt)\b/i,
    linkedin: /\b(linkedin)\b/i,
};

// Metric type matchers
const METRIC_PATTERNS: Record<string, RegExp> = {
    overview: /\b(overview|summary|overall|general)\b/i,
    conversion: /\b(conversion|conversions|convert|sales|revenue|roas|roi)\b/i,
    channel: /\b(channel|channels|traffic\s*source|source|acquisition)\b/i,
    platform: /\b(platform|platforms?)\b/i,
    insight: /\b(insight|insights?|recommendation|suggest)\b/i,
    campaign: /\b(campaign|campaigns?|ad\s*set|ad\s*group)\b/i,
};

/**
 * Parse user query for temporal and contextual intent
 */
export function parseQueryIntent(
    query: string,
    defaultDateRange?: { startDate: string; endDate: string }
): ParsedIntent {
    const now = new Date();
    let confidence = 0.5; // Base confidence

    // Try to extract timeframe
    const timeframe = extractTimeframe(query, now, defaultDateRange);
    if (timeframe.label !== 'Default') {
        confidence += 0.3;
    }

    // Extract platforms
    const platforms = extractPlatforms(query);
    if (platforms.length > 0) {
        confidence += 0.1;
    }

    // Extract metric types
    const metricTypes = extractMetricTypes(query);
    if (metricTypes.length > 0) {
        confidence += 0.1;
    }

    return {
        timeframe,
        platforms,
        metricTypes,
        originalQuery: query,
        confidence: Math.min(confidence, 1.0),
    };
}

/**
 * Extract timeframe from query
 */
function extractTimeframe(
    query: string,
    now: Date,
    defaultRange?: { startDate: string; endDate: string }
): ParsedIntent['timeframe'] {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Check for specific patterns

    // Today
    if (TIME_PATTERNS.today.test(query)) {
        return createTimeframe(today, today, 'Today', false);
    }

    // Yesterday
    if (TIME_PATTERNS.yesterday.test(query)) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return createTimeframe(yesterday, yesterday, 'Yesterday', true);
    }

    // This week
    if (TIME_PATTERNS.thisWeek.test(query)) {
        const weekStart = getWeekStart(today);
        return createTimeframe(weekStart, today, 'This Week', false);
    }

    // Last week
    if (TIME_PATTERNS.lastWeek.test(query)) {
        const lastWeekEnd = getWeekStart(today);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekStart.getDate() - 6);
        return createTimeframe(lastWeekStart, lastWeekEnd, 'Last Week', true);
    }

    // This month
    if (TIME_PATTERNS.thisMonth.test(query)) {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return createTimeframe(monthStart, today, 'This Month', false);
    }

    // Last month
    if (TIME_PATTERNS.lastMonth.test(query)) {
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return createTimeframe(lastMonthStart, lastMonthEnd, 'Last Month', true);
    }

    // Two months ago
    if (TIME_PATTERNS.twoMonthsAgo.test(query)) {
        const end = new Date(now.getFullYear(), now.getMonth() - 1, 0);
        const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return createTimeframe(start, end, 'Two Months Ago', true);
    }

    // Three months ago
    if (TIME_PATTERNS.threeMonthsAgo.test(query)) {
        const end = new Date(now.getFullYear(), now.getMonth() - 2, 0);
        const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        return createTimeframe(start, end, 'Three Months Ago', true);
    }

    // Last N days
    const lastNDaysMatch = query.match(TIME_PATTERNS.lastNDays);
    if (lastNDaysMatch) {
        const n = parseInt(lastNDaysMatch[2], 10);
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() - 1); // Yesterday
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - n + 1);
        return createTimeframe(startDate, endDate, `Last ${n} Days`, true);
    }

    // Last N weeks
    const lastNWeeksMatch = query.match(TIME_PATTERNS.lastNWeeks);
    if (lastNWeeksMatch) {
        const n = parseInt(lastNWeeksMatch[2], 10);
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() - 1);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - (n * 7) + 1);
        return createTimeframe(startDate, endDate, `Last ${n} Weeks`, true);
    }

    // Last N months
    const lastNMonthsMatch = query.match(TIME_PATTERNS.lastNMonths);
    if (lastNMonthsMatch) {
        const n = parseInt(lastNMonthsMatch[2], 10);
        const endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        const startDate = new Date(now.getFullYear(), now.getMonth() - n, 1);
        return createTimeframe(startDate, endDate, `Last ${n} Months`, true);
    }

    // Specific months (e.g., "September performance")
    const monthPatterns = [
        { pattern: TIME_PATTERNS.january, month: 0, name: 'January' },
        { pattern: TIME_PATTERNS.february, month: 1, name: 'February' },
        { pattern: TIME_PATTERNS.march, month: 2, name: 'March' },
        { pattern: TIME_PATTERNS.april, month: 3, name: 'April' },
        { pattern: TIME_PATTERNS.may, month: 4, name: 'May' },
        { pattern: TIME_PATTERNS.june, month: 5, name: 'June' },
        { pattern: TIME_PATTERNS.july, month: 6, name: 'July' },
        { pattern: TIME_PATTERNS.august, month: 7, name: 'August' },
        { pattern: TIME_PATTERNS.september, month: 8, name: 'September' },
        { pattern: TIME_PATTERNS.october, month: 9, name: 'October' },
        { pattern: TIME_PATTERNS.november, month: 10, name: 'November' },
        { pattern: TIME_PATTERNS.december, month: 11, name: 'December' },
    ];

    for (const { pattern, month, name } of monthPatterns) {
        if (pattern.test(query)) {
            // Determine year (current or previous)
            let year = now.getFullYear();
            if (month > now.getMonth()) {
                year -= 1; // Month is in the past year
            }

            const startDate = new Date(year, month, 1);
            const endDate = new Date(year, month + 1, 0);
            return createTimeframe(startDate, endDate, `${name} ${year}`, true);
        }
    }

    // Quarters
    if (TIME_PATTERNS.q1.test(query)) {
        return createQuarterTimeframe(now, 1, 'Q1');
    }
    if (TIME_PATTERNS.q2.test(query)) {
        return createQuarterTimeframe(now, 2, 'Q2');
    }
    if (TIME_PATTERNS.q3.test(query)) {
        return createQuarterTimeframe(now, 3, 'Q3');
    }
    if (TIME_PATTERNS.q4.test(query)) {
        return createQuarterTimeframe(now, 4, 'Q4');
    }

    // Default: Use provided date range or last 7 days
    if (defaultRange) {
        const start = new Date(defaultRange.startDate);
        const end = new Date(defaultRange.endDate);
        return createTimeframe(start, end, 'Default', false);
    }

    // Fallback: Last 7 days (excluding today)
    const fallbackEnd = new Date(today);
    fallbackEnd.setDate(fallbackEnd.getDate() - 1);
    const fallbackStart = new Date(fallbackEnd);
    fallbackStart.setDate(fallbackStart.getDate() - 6);
    return createTimeframe(fallbackStart, fallbackEnd, 'Default', false);
}

/**
 * Extract platforms from query
 */
function extractPlatforms(query: string): string[] {
    const platforms: string[] = [];

    for (const [platform, pattern] of Object.entries(PLATFORM_PATTERNS)) {
        if (pattern.test(query)) {
            platforms.push(platform);
        }
    }

    return platforms;
}

/**
 * Extract metric types from query
 */
function extractMetricTypes(query: string): string[] {
    const types: string[] = [];

    for (const [type, pattern] of Object.entries(METRIC_PATTERNS)) {
        if (pattern.test(query)) {
            types.push(type);
        }
    }

    return types;
}

/**
 * Create timeframe object
 */
function createTimeframe(
    start: Date,
    end: Date,
    label: string,
    isHistorical: boolean
): ParsedIntent['timeframe'] {
    return {
        startTime: start.getTime(),
        endTime: end.getTime() + (23 * 60 * 60 * 1000) + (59 * 60 * 1000) + (59 * 1000), // End of day
        startDate: formatDate(start),
        endDate: formatDate(end),
        label,
        isHistorical,
    };
}

/**
 * Create quarter timeframe
 */
function createQuarterTimeframe(
    now: Date,
    quarter: number,
    label: string
): ParsedIntent['timeframe'] {
    let year = now.getFullYear();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

    if (quarter >= currentQuarter) {
        year -= 1; // Assume previous year if quarter is current or future
    }

    const startMonth = (quarter - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);

    return createTimeframe(start, end, `${label} ${year}`, true);
}

/**
 * Get start of week (Monday)
 */
function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

/**
 * Detect if query contains a correction/instruction for user memory
 */
export function detectUserCorrection(query: string): {
    isCorrection: boolean;
    correctionType: 'preference' | 'correction' | 'instruction' | null;
    instruction: string | null;
} {
    const correctionPatterns = [
        { pattern: /\b(actually|instead|rather|not\s+that|wrong)\b/i, type: 'correction' as const },
        { pattern: /\b(focus\s+on|prioritize|emphasize|always\s+show)\b/i, type: 'preference' as const },
        { pattern: /\b(remember\s+that|keep\s+in\s+mind|note\s+that|don'?t\s+forget)\b/i, type: 'instruction' as const },
        { pattern: /\b(i\s+prefer|i\s+want|i\s+like|i\s+need)\b/i, type: 'preference' as const },
    ];

    for (const { pattern, type } of correctionPatterns) {
        if (pattern.test(query)) {
            return {
                isCorrection: true,
                correctionType: type,
                instruction: query,
            };
        }
    }

    return {
        isCorrection: false,
        correctionType: null,
        instruction: null,
    };
}

export default {
    parseQueryIntent,
    detectUserCorrection,
};
