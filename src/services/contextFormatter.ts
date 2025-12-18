import { AggregatedMetrics } from './metricsAggregator';

/**
 * Context Formatter Service
 * Converts structured metrics into natural language for AI context
 */

/**
 * Format metrics into human-readable text for AI context
 */
export function formatMetricsForContext(metrics: AggregatedMetrics): string {
  const { trafficMetrics, conversionMetrics, channelBreakdown, topPerformers, platformConnections, individualPlatformMetrics, dateRange } = metrics;

  // Helper to format numbers
  const formatNumber = (num: number): string => {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  // Helper to format currency (INR)
  const formatCurrency = (num: number): string => {
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Helper to format percentage
  const formatPercent = (num: number): string => {
    return num.toFixed(1) + '%';
  };

  // Helper to format change indicator
  const formatChange = (change: number): string => {
    if (Math.abs(change) < 0.1) return 'no change';
    const sign = change > 0 ? '↑' : '↓';
    return `${sign}${formatPercent(Math.abs(change))} vs previous period`;
  };

  // Format duration (minutes to readable format)
  const formatDuration = (minutes: number): string => {
    if (minutes < 1) return `${Math.round(minutes * 60)}s`;
    return `${minutes.toFixed(1)}min`;
  };

  // Build context string
  let context = `Marketing Performance Data\n`;
  context += `Period: ${dateRange.startDate} to ${dateRange.endDate}\n`;
  context += `IMPORTANT: This data covers the period from ${dateRange.startDate} to ${dateRange.endDate}. All currency values are in Indian Rupees (INR/₹). Do NOT convert to USD.\n\n`;

  // Platform Connections Overview
  context += `PLATFORM CONNECTIONS:\n`;
  context += `- Total Platforms Available: ${platformConnections.total}\n`;
  context += `- Connected: ${platformConnections.connected}\n`;
  context += `- Not Connected: ${platformConnections.notConnected}\n`;
  if (platformConnections.connectedPlatforms.length > 0) {
    context += `- Connected Platforms: ${platformConnections.connectedPlatforms.join(', ')}\n`;
  }
  if (platformConnections.notConnectedPlatforms.length > 0) {
    context += `- Not Connected Platforms: ${platformConnections.notConnectedPlatforms.join(', ')}\n`;
  }
  context += `\n`;

  // Traffic Metrics
  context += `TRAFFIC OVERVIEW:\n`;
  context += `- Total Sessions: ${formatNumber(trafficMetrics.sessions)} (${formatChange(trafficMetrics.sessionsChange)})\n`;
  context += `- Total Users: ${formatNumber(trafficMetrics.users)} (${formatChange(trafficMetrics.usersChange)})\n`;
  context += `- Bounce Rate: ${formatPercent(trafficMetrics.bounceRate)} (${formatChange(trafficMetrics.bounceRateChange)})\n`;
  context += `- Average Session Duration: ${formatDuration(trafficMetrics.avgSessionDuration)} (${formatChange(trafficMetrics.avgSessionDurationChange)})\n\n`;

  // Conversion Metrics
  context += `CONVERSION PERFORMANCE:\n`;
  context += `- Total Conversions: ${formatNumber(conversionMetrics.conversions)} (${formatChange(conversionMetrics.conversionsChange)})\n`;
  context += `- Conversion Rate: ${formatPercent(conversionMetrics.conversionRate)} (${formatChange(conversionMetrics.conversionRateChange)})\n`;
  context += `- Total Revenue: ${formatCurrency(conversionMetrics.revenue)} (${formatChange(conversionMetrics.revenueChange)})\n`;
  context += `- Avg Revenue per User: ${formatCurrency(conversionMetrics.avgRevenuePerUser)} (${formatChange(conversionMetrics.avgRevenuePerUserChange)})\n\n`;

  // Channel Breakdown
  if (channelBreakdown.length > 0) {
    context += `CHANNEL BREAKDOWN:\n`;
    
    // Sort by sessions and take top 5
    const topChannels = [...channelBreakdown]
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5);

    topChannels.forEach((channel, index) => {
      context += `${index + 1}. ${channel.channel}: ${formatNumber(channel.sessions)} sessions (${formatPercent(channel.percentage)} of total`;
      if (Math.abs(channel.sessionsChange) >= 0.1) {
        context += `, ${formatChange(channel.sessionsChange)}`;
      }
      context += `)\n`;
      
      if (channel.conversions > 0) {
        context += `   - Conversions: ${formatNumber(channel.conversions)}, Revenue: ${formatCurrency(channel.revenue)}\n`;
      }
    });
    context += `\n`;

    // Top/Bottom Performers
    context += `KEY INSIGHTS:\n`;
    context += `- Best Performing Channel: ${topPerformers.bestChannel} (${formatNumber(topPerformers.bestChannelSessions)} sessions)\n`;
    if (topPerformers.worstChannelSessions > 0 && topPerformers.worstChannel !== topPerformers.bestChannel) {
      context += `- Lowest Performing Channel: ${topPerformers.worstChannel} (${formatNumber(topPerformers.worstChannelSessions)} sessions)\n`;
    }
  } else {
    context += `CHANNEL BREAKDOWN:\n`;
    context += `No channel data available for this period.\n\n`;
  }

  // Individual Platform Metrics
  context += `\nINDIVIDUAL PLATFORM METRICS:\n`;
  
  // Always show status for ALL platforms, regardless of whether data exists
  
  // Google Ads
  if (individualPlatformMetrics.googleAds) {
    const ga = individualPlatformMetrics.googleAds;
    context += `\nGoogle Ads: CONNECTED - Data Available\n`;
    context += `- Spend: ${formatCurrency(ga.spend)}\n`;
    context += `- Clicks: ${formatNumber(ga.clicks)}\n`;
    context += `- Impressions: ${formatNumber(ga.impressions)}\n`;
    context += `- Conversions: ${formatNumber(ga.conversions)}\n`;
    context += `- Avg CPC: ${formatCurrency(ga.cpc)}\n`;
    context += `- CTR: ${formatPercent(ga.ctr)}\n`;
  } else if (platformConnections.platformDetails.googleAds.connected) {
    context += `\nGoogle Ads: CONNECTED - But no data available for this period\n`;
  } else {
    context += `\nGoogle Ads: NOT CONNECTED - Cannot provide data\n`;
  }
  
  // Meta Ads
  if (individualPlatformMetrics.metaAds) {
    const ma = individualPlatformMetrics.metaAds;
    if (ma._isFallbackData) {
      context += `\nMeta Ads: CONNECTED - Showing last 30 days data (${ma._fallbackPeriod})\n`;
      context += `Note: No data for requested period, showing most recent available data\n`;
    } else {
      context += `\nMeta Ads: CONNECTED - Data Available\n`;
    }
    context += `- Spend: ${formatCurrency(ma.spend)}\n`;
    context += `- Clicks: ${formatNumber(ma.clicks)}\n`;
    context += `- Impressions: ${formatNumber(ma.impressions)}\n`;
    context += `- Conversions: ${formatNumber(ma.conversions)}\n`;
    context += `- Avg CPC: ${formatCurrency(ma.cpc)}\n`;
    context += `- CTR: ${formatPercent(ma.ctr)}\n`;
  } else if (platformConnections.platformDetails.metaAds.connected) {
    context += `\nMeta Ads: CONNECTED - But no data available for this period\n`;
  } else {
    context += `\nMeta Ads: NOT CONNECTED - Cannot provide data\n`;
  }
  
  // Facebook
  if (individualPlatformMetrics.facebook) {
    const fb = individualPlatformMetrics.facebook;
    if (fb._isFallbackData) {
      context += `\nFacebook: CONNECTED - Showing last 30 days data (${fb._fallbackPeriod})\n`;
      context += `Note: No data for requested period, showing most recent available data\n`;
    } else {
      context += `\nFacebook: CONNECTED - Data Available\n`;
    }
    context += `- Followers: ${formatNumber(fb.followers)}\n`;
    context += `- Engagement: ${formatNumber(fb.engagement)}\n`;
    context += `- Reach: ${formatNumber(fb.reach)}\n`;
    context += `- Posts: ${formatNumber(fb.posts)}\n`;
  } else if (platformConnections.platformDetails.facebook.connected) {
    context += `\nFacebook: CONNECTED - But no data available for this period\n`;
  } else {
    context += `\nFacebook: NOT CONNECTED - Cannot provide data\n`;
  }
  
  // Instagram
  if (individualPlatformMetrics.instagram) {
    const ig = individualPlatformMetrics.instagram;
    context += `\nInstagram: CONNECTED - Data Available\n`;
    context += `- Followers: ${formatNumber(ig.followers)}\n`;
    context += `- Engagement: ${formatNumber(ig.engagement)}\n`;
    context += `- Reach: ${formatNumber(ig.reach)}\n`;
    context += `- Posts: ${formatNumber(ig.posts)}\n`;
  } else if (platformConnections.platformDetails.instagram.connected) {
    context += `\nInstagram: CONNECTED - But no data available for this period\n`;
  } else {
    context += `\nInstagram: NOT CONNECTED - Cannot provide data\n`;
  }
  
  // Search Console
  if (individualPlatformMetrics.searchConsole) {
    const sc = individualPlatformMetrics.searchConsole;
    if (sc._isFallbackData) {
      context += `\nSearch Console: CONNECTED - Showing last 30 days data (${sc._fallbackPeriod})\n`;
      context += `Note: No data for requested period, showing most recent available data\n`;
    } else {
      context += `\nSearch Console: CONNECTED - Data Available\n`;
    }
    context += `- Clicks: ${formatNumber(sc.clicks)}\n`;
    context += `- Impressions: ${formatNumber(sc.impressions)}\n`;
    context += `- CTR: ${formatPercent(sc.ctr * 100)}\n`;
    context += `- Avg Position: ${sc.avgPosition.toFixed(1)}\n`;
  } else if (platformConnections.platformDetails.searchConsole.connected) {
    context += `\nSearch Console: CONNECTED - But no data available for this period\n`;
  } else {
    context += `\nSearch Console: NOT CONNECTED - Cannot provide data\n`;
  }
  
  // YouTube
  if (platformConnections.platformDetails.youtube.connected) {
    context += `\nYouTube: CONNECTED - But no data available for this period\n`;
  } else {
    context += `\nYouTube: NOT CONNECTED - Cannot provide data\n`;
  }
  
  // LinkedIn
  if (platformConnections.platformDetails.linkedin.connected) {
    context += `\nLinkedIn: CONNECTED - But no data available for this period\n`;
  } else {
    context += `\nLinkedIn: NOT CONNECTED - Cannot provide data\n`;
  }
  
  // Google Places
  if (platformConnections.platformDetails.googlePlaces.connected) {
    context += `\nGoogle Places: CONNECTED - But no data available for this period\n`;
  } else {
    context += `\nGoogle Places: NOT CONNECTED - Cannot provide data\n`;
  }

  return context;
}

/**
 * Create a concise summary for conversation title
 */
export function generateConversationSummary(metrics: AggregatedMetrics): string {
  const { trafficMetrics, conversionMetrics } = metrics;
  
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return `${formatNumber(trafficMetrics.sessions)} sessions, ${formatNumber(conversionMetrics.conversions)} conversions, $${formatNumber(conversionMetrics.revenue)} revenue`;
}

export default {
  formatMetricsForContext,
  generateConversationSummary,
};
