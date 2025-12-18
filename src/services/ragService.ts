import { AggregatedMetrics } from './metricsAggregator';
import { MetricChunk, VectorMetadata, VectorQueryResult } from '../models/VectorMetadata';
import embeddingService from './embeddingService';
import vectorService from './vectorService';
import { v4 as uuidv4 } from 'uuid';

/**
 * RAG (Retrieval-Augmented Generation) Service
 * Orchestrates chunking, embedding, indexing, and retrieval of metrics data
 */

const TTL_HOURS = 24; // Data expires after 24 hours

/**
 * Helper to format numbers
 */
const formatNumber = (num: number): string => {
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

/**
 * Helper to format currency (INR)
 */
const formatCurrency = (num: number): string => {
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Helper to format percentage
 */
const formatPercent = (num: number): string => {
  return num.toFixed(1) + '%';
};

/**
 * Helper to format change indicator
 */
const formatChange = (change: number): string => {
  if (Math.abs(change) < 0.1) return 'no change';
  const sign = change > 0 ? '↑' : '↓';
  return `${sign}${formatPercent(Math.abs(change))} vs previous period`;
};

/**
 * Helper to format duration
 */
const formatDuration = (minutes: number): string => {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  return `${minutes.toFixed(1)}min`;
};

/**
 * Convert aggregated metrics into semantic chunks
 */
export function chunkMetrics(metrics: AggregatedMetrics, projectId: string): MetricChunk[] {
  const chunks: MetricChunk[] = [];
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000).toISOString();
  const dateRangeLabel = `${metrics.dateRange.startDate} to ${metrics.dateRange.endDate}`;

  // Base metadata template
  const baseMetadata: Partial<VectorMetadata> = {
    projectId,
    startDate: metrics.dateRange.startDate,
    endDate: metrics.dateRange.endDate,
    dateRangeLabel,
    isFallbackData: false,
    createdAt: now,
    expiresAt,
  };

  // 1. TRAFFIC OVERVIEW CHUNK
  const trafficText = `Traffic Overview for ${dateRangeLabel}:
Total Sessions: ${formatNumber(metrics.trafficMetrics.sessions)} (${formatChange(metrics.trafficMetrics.sessionsChange)})
Total Users: ${formatNumber(metrics.trafficMetrics.users)} (${formatChange(metrics.trafficMetrics.usersChange)})
Bounce Rate: ${formatPercent(metrics.trafficMetrics.bounceRate)} (${formatChange(metrics.trafficMetrics.bounceRateChange)})
Average Session Duration: ${formatDuration(metrics.trafficMetrics.avgSessionDuration)} (${formatChange(metrics.trafficMetrics.avgSessionDurationChange)})

This data represents the overall website traffic performance. Sessions indicate total visits, users show unique visitors, bounce rate reflects single-page visits, and session duration measures engagement time.`;

  chunks.push({
    id: uuidv4(),
    text: trafficText,
    metadata: {
      ...baseMetadata,
      metricType: 'overview',
      category: 'traffic',
      textContent: trafficText,
      metricsSnapshot: metrics.trafficMetrics,
    } as VectorMetadata,
  });

  // 2. CONVERSION PERFORMANCE CHUNK
  const conversionText = `Conversion Performance for ${dateRangeLabel}:
Total Conversions: ${formatNumber(metrics.conversionMetrics.conversions)} (${formatChange(metrics.conversionMetrics.conversionsChange)})
Conversion Rate: ${formatPercent(metrics.conversionMetrics.conversionRate)} (${formatChange(metrics.conversionMetrics.conversionRateChange)})
Total Revenue: ${formatCurrency(metrics.conversionMetrics.revenue)} (${formatChange(metrics.conversionMetrics.revenueChange)})
Average Revenue per User (ARPU): ${formatCurrency(metrics.conversionMetrics.avgRevenuePerUser)} (${formatChange(metrics.conversionMetrics.avgRevenuePerUserChange)})

All revenue values are in Indian Rupees (INR/₹). This represents the business outcomes from marketing efforts, including goal completions, revenue generated, and per-user value.`;

  chunks.push({
    id: uuidv4(),
    text: conversionText,
    metadata: {
      ...baseMetadata,
      metricType: 'conversion',
      category: 'conversions',
      textContent: conversionText,
      metricsSnapshot: metrics.conversionMetrics,
    } as VectorMetadata,
  });

  // 3. CHANNEL BREAKDOWN CHUNKS (one per channel)
  if (metrics.channelBreakdown && metrics.channelBreakdown.length > 0) {
    metrics.channelBreakdown.forEach(channel => {
      const channelText = `${channel.channel} Channel Performance for ${dateRangeLabel}:
Sessions: ${formatNumber(channel.sessions)} (${formatPercent(channel.percentage)} of total traffic, ${formatChange(channel.sessionsChange)})
Users: ${formatNumber(channel.users)}
Conversions: ${formatNumber(channel.conversions)}
Revenue: ${formatCurrency(channel.revenue)}

This channel ${channel.channel === metrics.topPerformers.bestChannel ? '**is the best performing channel**' : channel.channel === metrics.topPerformers.worstChannel ? 'has the lowest performance' : 'contributes to overall traffic'}. It represents traffic from ${channel.channel.toLowerCase()} sources.`;

      chunks.push({
        id: uuidv4(),
        text: channelText,
        metadata: {
          ...baseMetadata,
          metricType: 'channel',
          platform: channel.channel.toLowerCase().replace(/\s+/g, '-'),
          category: `channel-${channel.channel.toLowerCase().replace(/\s+/g, '-')}`,
          textContent: channelText,
          metricsSnapshot: channel,
        } as VectorMetadata,
      });
    });
  }

  // 4. KEY INSIGHTS CHUNK
  const insightsText = `Key Performance Insights for ${dateRangeLabel}:
Best Performing Channel: ${metrics.topPerformers.bestChannel} with ${formatNumber(metrics.topPerformers.bestChannelSessions)} sessions
${metrics.topPerformers.worstChannel !== metrics.topPerformers.bestChannel ? `Lowest Performing Channel: ${metrics.topPerformers.worstChannel} with ${formatNumber(metrics.topPerformers.worstChannelSessions)} sessions` : ''}

Platform Connections Status:
- Total Platforms Available: ${metrics.platformConnections.total}
- Connected Platforms (${metrics.platformConnections.connected}): ${metrics.platformConnections.connectedPlatforms.join(', ') || 'None'}
- Not Connected (${metrics.platformConnections.notConnected}): ${metrics.platformConnections.notConnectedPlatforms.join(', ') || 'None'}

Overall Performance Summary:
The website received ${formatNumber(metrics.trafficMetrics.sessions)} sessions from ${formatNumber(metrics.trafficMetrics.users)} unique users, generating ${formatNumber(metrics.conversionMetrics.conversions)} conversions and ${formatCurrency(metrics.conversionMetrics.revenue)} in revenue. The conversion rate is ${formatPercent(metrics.conversionMetrics.conversionRate)}.`;

  chunks.push({
    id: uuidv4(),
    text: insightsText,
    metadata: {
      ...baseMetadata,
      metricType: 'insight',
      category: 'insights',
      textContent: insightsText,
      metricsSnapshot: {
        topPerformers: metrics.topPerformers,
        platformConnections: metrics.platformConnections,
      },
    } as VectorMetadata,
  });

  // 5. INDIVIDUAL PLATFORM CHUNKS
  const platformMetrics = metrics.individualPlatformMetrics;

  // Google Ads
  if (platformMetrics.googleAds) {
    const ga = platformMetrics.googleAds;
    const isFallback = ga._isFallbackData || false;
    const gaText = `Google Ads Performance${isFallback ? ` (Fallback Data: ${ga._fallbackPeriod})` : ''} for ${dateRangeLabel}:
Ad Spend: ${formatCurrency(ga.spend)}
Clicks: ${formatNumber(ga.clicks)}
Impressions: ${formatNumber(ga.impressions)}
Conversions: ${formatNumber(ga.conversions)}
Average Cost per Click (CPC): ${formatCurrency(ga.cpc)}
Click-through Rate (CTR): ${formatPercent(ga.ctr)}

${isFallback ? 'Note: This is fallback data from the last 30 days as no data was available for the requested period. ' : ''}Google Ads is a paid advertising platform. These metrics show the performance of search and display ad campaigns, including spending efficiency and conversion outcomes.`;

    chunks.push({
      id: uuidv4(),
      text: gaText,
      metadata: {
        ...baseMetadata,
        metricType: 'platform',
        platform: 'googleAds',
        category: 'google-ads',
        textContent: gaText,
        metricsSnapshot: ga,
        isFallbackData: isFallback,
        fallbackPeriod: ga._fallbackPeriod,
      } as VectorMetadata,
    });
  }

  // Meta Ads
  if (platformMetrics.metaAds) {
    const ma = platformMetrics.metaAds;
    const isFallback = ma._isFallbackData || false;
    const maText = `Meta Ads Performance${isFallback ? ` (Fallback Data: ${ma._fallbackPeriod})` : ''} for ${dateRangeLabel}:
Ad Spend: ${formatCurrency(ma.spend)}
Clicks: ${formatNumber(ma.clicks)}
Impressions: ${formatNumber(ma.impressions)}
Conversions: ${formatNumber(ma.conversions)}
Average Cost per Click (CPC): ${formatCurrency(ma.cpc)}
Click-through Rate (CTR): ${formatPercent(ma.ctr)}

${isFallback ? 'Note: This is fallback data from the last 30 days as no data was available for the requested period. ' : ''}Meta Ads (formerly Facebook Ads) runs advertising campaigns on Facebook, Instagram, and Messenger. These metrics track ad performance across the Meta ecosystem.`;

    chunks.push({
      id: uuidv4(),
      text: maText,
      metadata: {
        ...baseMetadata,
        metricType: 'platform',
        platform: 'metaAds',
        category: 'meta-ads',
        textContent: maText,
        metricsSnapshot: ma,
        isFallbackData: isFallback,
        fallbackPeriod: ma._fallbackPeriod,
      } as VectorMetadata,
    });
  }

  // Facebook
  if (platformMetrics.facebook) {
    const fb = platformMetrics.facebook;
    const isFallback = fb._isFallbackData || false;
    const fbText = `Facebook Page Performance${isFallback ? ` (Fallback Data: ${fb._fallbackPeriod})` : ''} for ${dateRangeLabel}:
Page Followers: ${formatNumber(fb.followers)}
Post Engagement: ${formatNumber(fb.engagement)} interactions
Page Reach: ${formatNumber(fb.reach)} people
Posts Published: ${formatNumber(fb.posts)}

${isFallback ? 'Note: This is fallback data from the last 30 days as no data was available for the requested period. ' : ''}Facebook organic performance shows how the business page performs without paid advertising. Engagement includes likes, comments, shares, and other interactions.`;

    chunks.push({
      id: uuidv4(),
      text: fbText,
      metadata: {
        ...baseMetadata,
        metricType: 'platform',
        platform: 'facebook',
        category: 'facebook',
        textContent: fbText,
        metricsSnapshot: fb,
        isFallbackData: isFallback,
        fallbackPeriod: fb._fallbackPeriod,
      } as VectorMetadata,
    });
  }

  // Instagram
  if (platformMetrics.instagram) {
    const ig = platformMetrics.instagram;
    const isFallback = ig._isFallbackData || false;
    const igText = `Instagram Account Performance${isFallback ? ` (Fallback Data: ${ig._fallbackPeriod})` : ''} for ${dateRangeLabel}:
Followers: ${formatNumber(ig.followers)}
Total Engagement: ${formatNumber(ig.engagement)} interactions
Reach: ${formatNumber(ig.reach)} accounts
Posts Published: ${formatNumber(ig.posts)}

${isFallback ? 'Note: This is fallback data from the last 30 days as no data was available for the requested period. ' : ''}Instagram performance metrics track audience growth, content engagement, and reach. Engagement includes likes, comments, saves, and shares on posts and stories.`;

    chunks.push({
      id: uuidv4(),
      text: igText,
      metadata: {
        ...baseMetadata,
        metricType: 'platform',
        platform: 'instagram',
        category: 'instagram',
        textContent: igText,
        metricsSnapshot: ig,
        isFallbackData: isFallback,
        fallbackPeriod: ig._fallbackPeriod,
      } as VectorMetadata,
    });
  }

  // Search Console
  if (platformMetrics.searchConsole) {
    const sc = platformMetrics.searchConsole;
    const isFallback = sc._isFallbackData || false;
    const scText = `Google Search Console Performance${isFallback ? ` (Fallback Data: ${sc._fallbackPeriod})` : ''} for ${dateRangeLabel}:
Total Clicks: ${formatNumber(sc.clicks)} from search results
Total Impressions: ${formatNumber(sc.impressions)} in search results
Click-through Rate (CTR): ${formatPercent(sc.ctr * 100)}
Average Search Position: ${sc.avgPosition.toFixed(1)}

${isFallback ? 'Note: This is fallback data from the last 30 days as no data was available for the requested period. ' : ''}Search Console tracks organic search performance in Google. Clicks show visits from search, impressions show how often the site appeared in search results, and position indicates ranking.`;

    chunks.push({
      id: uuidv4(),
      text: scText,
      metadata: {
        ...baseMetadata,
        metricType: 'platform',
        platform: 'searchConsole',
        category: 'search-console',
        textContent: scText,
        metricsSnapshot: sc,
        isFallbackData: isFallback,
        fallbackPeriod: sc._fallbackPeriod,
      } as VectorMetadata,
    });
  }

  // Platform connection status chunk (for platforms not connected or without data)
  const connectionStatusText = `Platform Connection Status for ${dateRangeLabel}:

Connected Platforms (${metrics.platformConnections.connected}/${metrics.platformConnections.total}):
${metrics.platformConnections.connectedPlatforms.map(p => `- ${p}: CONNECTED`).join('\n') || '- No platforms connected yet'}

Not Connected Platforms (${metrics.platformConnections.notConnected}):
${metrics.platformConnections.notConnectedPlatforms.map(p => `- ${p}: NOT CONNECTED - Need to connect from integrations page to get insights`).join('\n') || '- All platforms connected'}

Platform-Specific Details:
- Google Analytics: ${metrics.platformConnections.platformDetails.googleAnalytics.connected ? `Connected (Property: ${metrics.platformConnections.platformDetails.googleAnalytics.propertyId})` : 'Not Connected'}
- Google Ads: ${metrics.platformConnections.platformDetails.googleAds.connected ? `Connected (Customer: ${metrics.platformConnections.platformDetails.googleAds.customerId})` : 'Not Connected'}
- Meta Ads: ${metrics.platformConnections.platformDetails.metaAds.connected ? `Connected (Account: ${metrics.platformConnections.platformDetails.metaAds.accountId})` : 'Not Connected'}
- Search Console: ${metrics.platformConnections.platformDetails.searchConsole.connected ? `Connected (Site: ${metrics.platformConnections.platformDetails.searchConsole.siteUrl})` : 'Not Connected'}
- Facebook: ${metrics.platformConnections.platformDetails.facebook.connected ? `Connected (Page: ${metrics.platformConnections.platformDetails.facebook.pageId})` : 'Not Connected'}
- Instagram: ${metrics.platformConnections.platformDetails.instagram.connected ? `Connected (@${metrics.platformConnections.platformDetails.instagram.username})` : 'Not Connected'}
- YouTube: ${metrics.platformConnections.platformDetails.youtube.connected ? `Connected (Channel: ${metrics.platformConnections.platformDetails.youtube.channelId})` : 'Not Connected'}
- LinkedIn: ${metrics.platformConnections.platformDetails.linkedin.connected ? `Connected (Page: ${metrics.platformConnections.platformDetails.linkedin.pageId})` : 'Not Connected'}
- Google Places: ${metrics.platformConnections.platformDetails.googlePlaces.connected ? `Connected (Place: ${metrics.platformConnections.platformDetails.googlePlaces.placeId})` : 'Not Connected'}

To get insights from a specific platform, it must first be connected through the integrations page.`;

  chunks.push({
    id: uuidv4(),
    text: connectionStatusText,
    metadata: {
      ...baseMetadata,
      metricType: 'insight',
      category: 'platform-connections',
      textContent: connectionStatusText,
      metricsSnapshot: metrics.platformConnections,
    } as VectorMetadata,
  });

  console.log(`📦 Created ${chunks.length} semantic chunks from metrics`);
  return chunks;
}

/**
 * Index metrics to vector database
 */
export async function indexMetrics(
  metrics: AggregatedMetrics,
  projectId: string
): Promise<void> {
  try {
    console.log(`🚀 Starting RAG indexing for project ${projectId}...`);

    // Step 1: Create semantic chunks
    const chunks = chunkMetrics(metrics, projectId);

    // Step 2: Generate embeddings for all chunks
    const texts = chunks.map(chunk => chunk.text);
    const embeddingResponses = await embeddingService.generateEmbeddingsBatch(texts);
    const embeddings = embeddingResponses.map(r => r.embedding);

    // Step 3: Upsert vectors with embeddings to Pinecone
    await vectorService.upsertVectorsWithEmbeddings(chunks, embeddings);

    console.log(`✅ Successfully indexed ${chunks.length} chunks for project ${projectId}`);
  } catch (error: any) {
    console.error('❌ Error indexing metrics:', error.message);
    throw new Error(`Failed to index metrics: ${error.message}`);
  }
}

/**
 * Retrieve relevant context chunks based on user query
 */
export async function retrieveContext(
  userQuery: string,
  projectId: string,
  topK: number = 5,
  minScore: number = 0.7
): Promise<VectorQueryResult[]> {
  try {
    console.log(`🔍 Retrieving context for query: "${userQuery}"`);

    // Step 1: Generate embedding for user query
    const queryEmbedding = await embeddingService.generateEmbedding(userQuery);

    // Step 2: Query vector database
    const results = await vectorService.queryVectors({
      embedding: queryEmbedding,
      projectId,
      topK,
      minScore,
    });

    console.log(`✅ Retrieved ${results.length} relevant chunks`);
    return results;
  } catch (error: any) {
    console.error('❌ Error retrieving context:', error.message);
    throw new Error(`Failed to retrieve context: ${error.message}`);
  }
}

/**
 * Build context string from retrieved chunks
 */
export function buildContextFromChunks(chunks: VectorQueryResult[]): string {
  if (!chunks || chunks.length === 0) {
    return 'No relevant data found in the vector database.';
  }

  let context = 'Relevant Data Retrieved from Vector Database:\n\n';
  
  chunks.forEach((chunk, index) => {
    context += `[Source ${index + 1}] (Relevance: ${(chunk.score * 100).toFixed(1)}%):\n`;
    context += chunk.text;
    context += '\n\n';
  });

  return context;
}

/**
 * Check if project needs re-indexing
 */
export async function needsReindexing(
  projectId: string,
  maxAgeHours: number = 24
): Promise<boolean> {
  try {
    // Check if Pinecone is configured
    const { ENV } = await import('../config/env');
    if (!ENV.PINECONE_API_KEY) {
      console.log(`⚠️  Pinecone not configured - skipping indexing check`);
      return false; // Don't try to index if Pinecone isn't configured
    }

    // Check if project has any vectors
    const hasVectors = await vectorService.hasProjectVectors(projectId);
    if (!hasVectors) {
      console.log(`📊 Project ${projectId} has no indexed vectors - needs indexing`);
      return true;
    }

    // Check if data is stale
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const isStale = await vectorService.isProjectDataStale(projectId, maxAgeMs);
    
    if (isStale) {
      console.log(`⏰ Project ${projectId} data is older than ${maxAgeHours} hours - needs re-indexing`);
      return true;
    }

    console.log(`✅ Project ${projectId} has fresh indexed data`);
    return false;
  } catch (error: any) {
    console.error('❌ Error checking if re-indexing needed:', error.message);
    return false; // Don't index on error - fail gracefully
  }
}

/**
 * Re-index project metrics (delete old vectors and index new ones)
 */
export async function reindexProject(
  metrics: AggregatedMetrics,
  projectId: string
): Promise<void> {
  try {
    console.log(`🔄 Re-indexing project ${projectId}...`);

    // Step 1: Delete existing vectors for this project
    await vectorService.deleteVectorsByProject(projectId);

    // Step 2: Index new metrics
    await indexMetrics(metrics, projectId);

    console.log(`✅ Successfully re-indexed project ${projectId}`);
  } catch (error: any) {
    console.error('❌ Error re-indexing project:', error.message);
    throw new Error(`Failed to re-index project: ${error.message}`);
  }
}

export default {
  chunkMetrics,
  indexMetrics,
  retrieveContext,
  buildContextFromChunks,
  needsReindexing,
  reindexProject,
};
