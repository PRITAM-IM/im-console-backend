import cron from 'node-cron';
import { randomUUID } from 'crypto';
import Project from '../models/Project';
import metricsAggregator, { AggregatedMetrics } from '../services/metricsAggregator';
import embeddingService from '../services/embeddingService';
import milvusVectorService, { MetricChunk } from '../services/milvusVectorService';
import { ENV } from '../config/env';
import { initializeMilvusCollections, MILVUS_CONFIG } from '../config/milvus';

// Use crypto.randomUUID for generating UUIDs
const uuidv4 = () => randomUUID();

/**
 * Milvus Sync Worker
 * 
 * Background ETL Process for Asynchronous RAG:
 * - Runs every hour (configurable via MILVUS_SYNC_CRON)
 * - Loops through all active projects
 * - Batch-fetches metrics from 9 connected APIs
 * - Generates embeddings and upserts to Milvus with high-fidelity metadata
 * 
 * Architecture Benefits:
 * - Chat API only READS from Milvus (sub-second response)
 * - Worker WRITES to Milvus (background, no user wait)
 * - Historical data preserved for 90 days (fixes "last month" queries)
 */

// Track sync status
interface SyncStatus {
    isRunning: boolean;
    lastRunAt: Date | null;
    lastSuccessAt: Date | null;
    lastError: string | null;
    projectsProcessed: number;
    vectorsUpserted: number;
}

let syncStatus: SyncStatus = {
    isRunning: false,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    projectsProcessed: 0,
    vectorsUpserted: 0,
};

/**
 * Initialize the Milvus sync worker
 * Call this in server.ts during application startup
 */
export async function initMilvusSyncWorker(): Promise<void> {
    if (ENV.MILVUS_SYNC_ENABLED !== 'true') {
        console.log('⏸️ [MilvusSyncWorker] Sync worker is DISABLED via MILVUS_SYNC_ENABLED');
        return;
    }

    if (!ENV.MILVUS_ADDRESS) {
        console.log('⚠️ [MilvusSyncWorker] MILVUS_ADDRESS not configured, skipping worker initialization');
        return;
    }

    try {
        // Initialize Milvus collections (creates if not exist)
        console.log('🔧 [MilvusSyncWorker] Initializing Milvus collections...');
        await initializeMilvusCollections();

        // Schedule the cron job
        const cronSchedule = ENV.MILVUS_SYNC_CRON || '0 * * * *'; // Default: every hour
        console.log(`⏰ [MilvusSyncWorker] Scheduling sync with cron: "${cronSchedule}"`);

        cron.schedule(cronSchedule, async () => {
            console.log('🔄 [MilvusSyncWorker] Scheduled sync triggered');
            await runSync();
        });

        console.log('✅ [MilvusSyncWorker] Worker initialized successfully');

        // Run initial sync after 30 seconds to allow server to fully start
        setTimeout(async () => {
            console.log('🚀 [MilvusSyncWorker] Running initial sync...');
            await runSync();
        }, 30000);

    } catch (error: any) {
        console.error('❌ [MilvusSyncWorker] Failed to initialize:', error.message);
    }
}

/**
 * Run the sync process
 * Can be called manually or by cron schedule
 */
export async function runSync(): Promise<SyncStatus> {
    if (syncStatus.isRunning) {
        console.log('⚠️ [MilvusSyncWorker] Sync already in progress, skipping');
        return syncStatus;
    }

    syncStatus.isRunning = true;
    syncStatus.lastRunAt = new Date();
    syncStatus.projectsProcessed = 0;
    syncStatus.vectorsUpserted = 0;

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔄 [MilvusSyncWorker] Starting metrics sync...');
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════════════');

    try {
        // Get all active projects with at least one connected platform
        const projects = await Project.find({
            $or: [
                { gaPropertyId: { $exists: true, $ne: null } },
                { googleAdsCustomerId: { $exists: true, $ne: null } },
                { metaAdsAccountId: { $exists: true, $ne: null } },
                { facebookPageId: { $exists: true, $ne: null } },
                { 'instagram.igUserId': { $exists: true, $ne: null } },
                { youtubeChannelId: { $exists: true, $ne: null } },
                { searchConsoleSiteUrl: { $exists: true, $ne: null } },
                { linkedinPageId: { $exists: true, $ne: null } },
                { googlePlacesId: { $exists: true, $ne: null } },
            ]
        }).select('_id name').lean();

        console.log(`📊 [MilvusSyncWorker] Found ${projects.length} active projects to sync`);

        // Process projects in batches to avoid overwhelming APIs
        const BATCH_SIZE = 5;
        for (let i = 0; i < projects.length; i += BATCH_SIZE) {
            const batch = projects.slice(i, i + BATCH_SIZE);

            await Promise.allSettled(
                batch.map(project => syncProject(project._id.toString(), project.name))
            );

            // Small delay between batches to be nice to APIs
            if (i + BATCH_SIZE < projects.length) {
                await sleep(2000);
            }
        }

        syncStatus.lastSuccessAt = new Date();
        syncStatus.lastError = null;

        console.log('═══════════════════════════════════════════════════════════════');
        console.log('✅ [MilvusSyncWorker] Sync completed successfully');
        console.log(`   Projects: ${syncStatus.projectsProcessed}`);
        console.log(`   Vectors: ${syncStatus.vectorsUpserted}`);
        console.log(`   Duration: ${Date.now() - syncStatus.lastRunAt!.getTime()}ms`);
        console.log('═══════════════════════════════════════════════════════════════');

    } catch (error: any) {
        console.error('❌ [MilvusSyncWorker] Sync failed:', error.message);
        syncStatus.lastError = error.message;
    } finally {
        syncStatus.isRunning = false;
    }

    return syncStatus;
}

/**
 * Sync a single project
 */
async function syncProject(projectId: string, projectName: string): Promise<void> {
    console.log(`\n📦 [MilvusSyncWorker] Processing: ${projectName} (${projectId})`);

    try {
        // Define date ranges for syncing (current week + historical data)
        const dateRanges = getDateRangesToSync();

        for (const range of dateRanges) {
            console.log(`   📅 Syncing ${range.label}: ${range.startDate} to ${range.endDate}`);

            try {
                // Fetch aggregated metrics
                const metrics = await metricsAggregator.getProjectMetrics(
                    projectId,
                    range.startDate,
                    range.endDate
                );

                // Skip if no meaningful data
                if (!hasValidMetrics(metrics)) {
                    console.log(`   ⚠️ No data for ${range.label}`);
                    continue;
                }

                // Chunk metrics into semantic segments
                const chunks = chunkMetrics(metrics, projectId, range);

                if (chunks.length === 0) {
                    console.log(`   ⚠️ No chunks generated for ${range.label}`);
                    continue;
                }

                // Generate embeddings in batch
                const texts = chunks.map(c => c.text);
                const embeddingResponses = await embeddingService.generateEmbeddingsBatch(texts);

                // Extract just the embedding arrays from the response objects
                const embeddings = embeddingResponses.map(r => r.embedding);

                // Upsert to Milvus
                await milvusVectorService.upsertVectors(chunks, embeddings, projectId);

                syncStatus.vectorsUpserted += chunks.length;
                console.log(`   ✅ Synced ${chunks.length} chunks for ${range.label}`);

            } catch (error: any) {
                console.error(`   ❌ Error syncing ${range.label}:`, error.message);
            }

            // Small delay between date ranges
            await sleep(500);
        }

        syncStatus.projectsProcessed++;

    } catch (error: any) {
        console.error(`   ❌ Failed to sync project ${projectId}:`, error.message);
    }
}

/**
 * Get date ranges to sync
 * Returns current week/month + historical ranges for "last month" queries
 */
function getDateRangesToSync(): Array<{ startDate: string; endDate: string; label: string }> {
    const ranges: Array<{ startDate: string; endDate: string; label: string }> = [];
    const today = new Date();

    // Current week (last 7 days)
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() - 1); // Yesterday
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);

    ranges.push({
        startDate: formatDate(weekStart),
        endDate: formatDate(weekEnd),
        label: 'Current Week',
    });

    // Last 4 weeks (for better historical context)
    for (let weekOffset = 1; weekOffset <= 4; weekOffset++) {
        const end = new Date(weekEnd);
        end.setDate(end.getDate() - (weekOffset * 7));
        const start = new Date(end);
        start.setDate(start.getDate() - 6);

        ranges.push({
            startDate: formatDate(start),
            endDate: formatDate(end),
            label: `Week -${weekOffset}`,
        });
    }

    // Previous month (full month)
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    ranges.push({
        startDate: formatDate(prevMonthStart),
        endDate: formatDate(prevMonthEnd),
        label: 'Previous Month',
    });

    // Two months ago (for "2 months ago" queries)
    const twoMonthsEnd = new Date(today.getFullYear(), today.getMonth() - 1, 0);
    const twoMonthsStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);

    ranges.push({
        startDate: formatDate(twoMonthsStart),
        endDate: formatDate(twoMonthsEnd),
        label: 'Two Months Ago',
    });

    // Three months ago
    const threeMonthsEnd = new Date(today.getFullYear(), today.getMonth() - 2, 0);
    const threeMonthsStart = new Date(today.getFullYear(), today.getMonth() - 3, 1);

    ranges.push({
        startDate: formatDate(threeMonthsStart),
        endDate: formatDate(threeMonthsEnd),
        label: 'Three Months Ago',
    });

    return ranges;
}

/**
 * Chunk aggregated metrics into semantic segments
 * Same logic as ragService but optimized for background processing
 */
function chunkMetrics(
    metrics: AggregatedMetrics,
    projectId: string,
    dateRange: { startDate: string; endDate: string; label: string }
): MetricChunk[] {
    const chunks: MetricChunk[] = [];
    const now = new Date().toISOString();
    const ttlDate = new Date(Date.now() + MILVUS_CONFIG.TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const createChunk = (
        type: MetricChunk['metadata']['metricType'],
        platform: string,
        category: string,
        text: string,
        metricsSnapshot: Record<string, any>
    ): MetricChunk => ({
        id: uuidv4(),
        text,
        metadata: {
            projectId,
            metricType: type,
            platform,
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
            dateRangeLabel: dateRange.label,
            category,
            textContent: text,
            metricsSnapshot,
            isFallbackData: false,
            createdAt: now,
            expiresAt: ttlDate,
        },
    });

    // Traffic Overview chunk
    if (metrics.trafficMetrics) {
        const tm = metrics.trafficMetrics;
        chunks.push(createChunk(
            'overview',
            'general',
            'traffic',
            `Traffic Overview for ${dateRange.label} (${dateRange.startDate} to ${dateRange.endDate}):
Sessions: ${formatNumber(tm.sessions)} (${formatChange(tm.sessionsChange)})
Users: ${formatNumber(tm.users)} (${formatChange(tm.usersChange)})
Bounce Rate: ${tm.bounceRate?.toFixed(1)}%
Avg Session Duration: ${formatDuration(tm.avgSessionDuration)}

This shows the overall website traffic performance for the period.`,
            tm
        ));
    }

    // Conversion Performance chunk
    if (metrics.conversionMetrics) {
        const cm = metrics.conversionMetrics;
        chunks.push(createChunk(
            'conversion',
            'general',
            'conversions',
            `Conversion Performance for ${dateRange.label} (${dateRange.startDate} to ${dateRange.endDate}):
Total Conversions: ${formatNumber(cm.conversions)} (${formatChange(cm.conversionsChange)})
Conversion Rate: ${cm.conversionRate?.toFixed(2)}%
Revenue: ₹${formatNumber(cm.revenue)}
Average Revenue Per User: ₹${cm.avgRevenuePerUser?.toFixed(2)}

This shows how well the website converts visitors into customers.`,
            cm
        ));
    }

    // Channel Performance chunks
    if (metrics.channelBreakdown && metrics.channelBreakdown.length > 0) {
        for (const channel of metrics.channelBreakdown) {
            chunks.push(createChunk(
                'channel',
                'general',
                `channel-${channel.channel.toLowerCase().replace(/\s+/g, '-')}`,
                `${channel.channel} Channel Performance for ${dateRange.label}:
Sessions: ${formatNumber(channel.sessions)} (${formatChange(channel.sessionsChange)})
Users: ${formatNumber(channel.users)}
Conversions: ${formatNumber(channel.conversions)}
Revenue: ₹${formatNumber(channel.revenue)}
Share: ${channel.percentage?.toFixed(1)}% of total traffic

This channel represents ${channel.channel.toLowerCase()} traffic sources.`,
                channel
            ));
        }
    }

    // Platform-specific chunks
    const platformMetrics = metrics.individualPlatformMetrics;

    if (platformMetrics?.googleAds) {
        const ga = platformMetrics.googleAds;
        chunks.push(createChunk(
            'platform',
            'googleAds',
            'google-ads',
            `Google Ads Performance for ${dateRange.label}:
Ad Spend: ₹${formatNumber(ga.spend)}
Clicks: ${formatNumber(ga.clicks)}
Impressions: ${formatNumber(ga.impressions)}
Conversions: ${formatNumber(ga.conversions)}
CPC: ₹${ga.cpc?.toFixed(2)}
CTR: ${ga.ctr?.toFixed(2)}%

Google Ads is a paid search advertising platform.`,
            ga
        ));
    }

    if (platformMetrics?.metaAds) {
        const ma = platformMetrics.metaAds;
        chunks.push(createChunk(
            'platform',
            'metaAds',
            'meta-ads',
            `Meta Ads Performance for ${dateRange.label}:
Ad Spend: ₹${formatNumber(ma.spend)}
Clicks: ${formatNumber(ma.clicks)}
Impressions: ${formatNumber(ma.impressions)}
Conversions: ${formatNumber(ma.conversions)}
CPC: ₹${ma.cpc?.toFixed(2)}
CTR: ${ma.ctr?.toFixed(2)}%

Meta Ads (Facebook/Instagram advertising) performance.`,
            ma
        ));
    }

    if (platformMetrics?.facebook) {
        const fb = platformMetrics.facebook;
        chunks.push(createChunk(
            'platform',
            'facebook',
            'facebook',
            `Facebook Page Performance for ${dateRange.label}:
Page Followers: ${formatNumber(fb.followers)}
Engagement: ${formatNumber(fb.engagement)}
Reach: ${formatNumber(fb.reach)}
Posts Published: ${formatNumber(fb.posts)}

Facebook organic social media performance.`,
            fb
        ));
    }

    if (platformMetrics?.instagram) {
        const ig = platformMetrics.instagram;
        chunks.push(createChunk(
            'platform',
            'instagram',
            'instagram',
            `Instagram Performance for ${dateRange.label}:
Followers: ${formatNumber(ig.followers)}
Engagement: ${formatNumber(ig.engagement)}
Reach: ${formatNumber(ig.reach)}
Posts: ${formatNumber(ig.posts)}

Instagram organic social media performance.`,
            ig
        ));
    }

    if (platformMetrics?.searchConsole) {
        const sc = platformMetrics.searchConsole;
        chunks.push(createChunk(
            'platform',
            'searchConsole',
            'search-console',
            `Google Search Console Performance for ${dateRange.label}:
Total Clicks: ${formatNumber(sc.clicks)}
Total Impressions: ${formatNumber(sc.impressions)}
Average CTR: ${sc.ctr?.toFixed(2)}%
Average Position: ${sc.avgPosition?.toFixed(1)}

This shows organic search performance on Google.`,
            sc
        ));
    }

    // Platform Connections summary chunk
    if (metrics.platformConnections) {
        const pc = metrics.platformConnections;
        chunks.push(createChunk(
            'insight',
            'general',
            'platform-connections',
            `Platform Connections Status:
Total Available: ${pc.total}
Connected: ${pc.connected} (${pc.connectedPlatforms.join(', ') || 'None'})
Not Connected: ${pc.notConnected} (${pc.notConnectedPlatforms.join(', ') || 'All connected'})

This shows which marketing platforms are integrated.`,
            { connected: pc.connectedPlatforms, notConnected: pc.notConnectedPlatforms }
        ));
    }

    return chunks;
}

/**
 * Check if metrics have any meaningful data
 */
function hasValidMetrics(metrics: AggregatedMetrics): boolean {
    if (!metrics) return false;

    // Check traffic
    if (metrics.trafficMetrics?.sessions > 0) return true;
    if (metrics.trafficMetrics?.users > 0) return true;

    // Check conversions
    if (metrics.conversionMetrics?.conversions > 0) return true;
    if (metrics.conversionMetrics?.revenue > 0) return true;

    // Check channels
    if (metrics.channelBreakdown && metrics.channelBreakdown.length > 0) return true;

    // Check individual platforms
    const pm = metrics.individualPlatformMetrics;
    if ((pm?.googleAds?.spend ?? 0) > 0 || (pm?.googleAds?.clicks ?? 0) > 0) return true;
    if ((pm?.metaAds?.spend ?? 0) > 0 || (pm?.metaAds?.clicks ?? 0) > 0) return true;
    if ((pm?.facebook?.followers ?? 0) > 0) return true;
    if ((pm?.instagram?.followers ?? 0) > 0) return true;
    if ((pm?.searchConsole?.clicks ?? 0) > 0) return true;

    return false;
}

// Helper functions
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

function formatNumber(num: number | undefined): string {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatChange(change: number | undefined): string {
    if (change === undefined || change === null) return 'no change';
    const sign = change > 0 ? '↑' : change < 0 ? '↓' : '';
    return `${sign}${Math.abs(change).toFixed(1)}%`;
}

function formatDuration(minutes: number | undefined): string {
    if (!minutes) return '0 sec';
    if (minutes < 1) return `${Math.round(minutes * 60)} sec`;
    return `${minutes.toFixed(1)} min`;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get current sync status
 */
export function getSyncStatus(): SyncStatus {
    return { ...syncStatus };
}

/**
 * Trigger manual sync (for admin API)
 */
export async function triggerManualSync(): Promise<SyncStatus> {
    console.log('🔧 [MilvusSyncWorker] Manual sync triggered');
    return runSync();
}

export default {
    initMilvusSyncWorker,
    runSync,
    getSyncStatus,
    triggerManualSync,
};
