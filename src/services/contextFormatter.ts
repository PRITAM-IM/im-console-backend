import { AggregatedMetrics } from './metricsAggregator';

/**
 * Context Formatter Service
 * Converts metrics data into natural language context for the AI chatbot
 */

/**
 * Helper functions for formatting
 */
const formatNumber = (num: number): string => {
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

const formatCurrency = (num: number): string => {
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPercent = (num: number): string => {
  return num.toFixed(1) + '%';
};

const formatChange = (change: number): string => {
  if (Math.abs(change) < 0.1) return 'no change';
  const sign = change > 0 ? '↑' : '↓';
  return `${sign}${formatPercent(Math.abs(change))}`;
};

const formatDuration = (minutes: number): string => {
  if (minutes < 1) return `${Math.round(minutes * 60)} seconds`;
  if (minutes < 60) return `${minutes.toFixed(1)} minutes`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
};

/**
 * Format metrics into natural language context for AI
 */
export function formatMetricsForContext(metrics: AggregatedMetrics): string {
  const sections: string[] = [];

  // Header with date range
  sections.push(`# Marketing Analytics Report`);
  sections.push(`Period: ${metrics.dateRange.startDate} to ${metrics.dateRange.endDate}`);
  sections.push(`All currency values are in Indian Rupees (INR/₹)\n`);

  // Platform Connections
  sections.push(`## Platform Connections`);
  sections.push(`Total Platforms: ${metrics.platformConnections.total}`);
  sections.push(`Connected: ${metrics.platformConnections.connected}`);
  sections.push(`Not Connected: ${metrics.platformConnections.notConnected}`);
  sections.push(`Connected Platforms: ${metrics.platformConnections.connectedPlatforms.join(', ')}`);
  if (metrics.platformConnections.notConnectedPlatforms.length > 0) {
    sections.push(`Not Connected: ${metrics.platformConnections.notConnectedPlatforms.join(', ')}`);
  }
  sections.push('');

  // Traffic Metrics
  if (metrics.trafficMetrics) {
    sections.push(`## Traffic Overview (Google Analytics)`);
    sections.push(`Sessions: ${formatNumber(metrics.trafficMetrics.sessions)} (${formatChange(metrics.trafficMetrics.sessionsChange || 0)})`);
    sections.push(`Users: ${formatNumber(metrics.trafficMetrics.users)} (${formatChange(metrics.trafficMetrics.usersChange || 0)})`);
    sections.push(`Bounce Rate: ${formatPercent(metrics.trafficMetrics.bounceRate)} (${formatChange(metrics.trafficMetrics.bounceRateChange || 0)})`);
    sections.push(`Avg Session Duration: ${formatDuration(metrics.trafficMetrics.avgSessionDuration)} (${formatChange(metrics.trafficMetrics.avgSessionDurationChange || 0)})`);
    sections.push('');
  }

  // Conversion Metrics
  if (metrics.conversionMetrics) {
    sections.push(`## Conversion Performance`);
    sections.push(`Conversions: ${formatNumber(metrics.conversionMetrics.conversions)} (${formatChange(metrics.conversionMetrics.conversionsChange || 0)})`);
    sections.push(`Conversion Rate: ${formatPercent(metrics.conversionMetrics.conversionRate)} (${formatChange(metrics.conversionMetrics.conversionRateChange || 0)})`);
    sections.push(`Revenue: ${formatCurrency(metrics.conversionMetrics.revenue)} (${formatChange(metrics.conversionMetrics.revenueChange || 0)})`);
    sections.push('');
  }

  // Channel Breakdown
  if (metrics.channelBreakdown && metrics.channelBreakdown.length > 0) {
    sections.push(`## Channel Performance`);
    metrics.channelBreakdown.forEach(channel => {
      sections.push(`\n### ${channel.channel}`);
      sections.push(`- Sessions: ${formatNumber(channel.sessions)} (${formatChange(channel.sessionsChange || 0)})`);
      sections.push(`- Users: ${formatNumber(channel.users)}`);
      sections.push(`- Conversions: ${formatNumber(channel.conversions)}`);
      if (channel.revenue > 0) {
        sections.push(`- Revenue: ${formatCurrency(channel.revenue)}`);
      }
    });
    sections.push('');
  }

  // Individual Platform Metrics
  if (metrics.individualPlatformMetrics) {
    sections.push(`## Individual Platform Metrics\n`);

    // Meta Ads
    if (metrics.individualPlatformMetrics.metaAds) {
      const meta = metrics.individualPlatformMetrics.metaAds;
      sections.push(`### Meta Ads`);
      if (meta._isFallbackData) {
        sections.push(`**Note: Showing last 30 days data (${meta._fallbackPeriod}) as no data available for requested period**`);
      }
      sections.push(`- Spend: ${formatCurrency(meta.spend)}`);
      sections.push(`- Clicks: ${formatNumber(meta.clicks)}`);
      sections.push(`- Impressions: ${formatNumber(meta.impressions)}`);
      sections.push(`- Conversions: ${formatNumber(meta.conversions)}`);
      sections.push(`- CPC: ${formatCurrency(meta.cpc)}`);
      sections.push(`- CTR: ${formatPercent(meta.ctr)}`);
      sections.push('');
    }

    // Facebook
    if (metrics.individualPlatformMetrics.facebook) {
      const fb = metrics.individualPlatformMetrics.facebook;
      sections.push(`### Facebook`);
      if (fb._isFallbackData) {
        sections.push(`**Note: Showing last 30 days data (${fb._fallbackPeriod}) as no data available for requested period**`);
      }
      sections.push(`- Followers: ${formatNumber(fb.followers)}`);
      sections.push(`- Engagement: ${formatNumber(fb.engagement)}`);
      sections.push(`- Reach: ${formatNumber(fb.reach)}`);
      sections.push(`- Posts: ${formatNumber(fb.posts)}`);
      sections.push('');
    }

    // Instagram
    if (metrics.individualPlatformMetrics.instagram) {
      const ig = metrics.individualPlatformMetrics.instagram;
      sections.push(`### Instagram`);
      if (ig._isFallbackData) {
        sections.push(`**Note: Showing last 30 days data (${ig._fallbackPeriod}) as no data available for requested period**`);
      }
      sections.push(`- Followers: ${formatNumber(ig.followers)}`);
      sections.push(`- Impressions: ${formatNumber(ig.reach)}`);
      sections.push(`- Reach: ${formatNumber(ig.reach)}`);
      sections.push(`- Engagement: ${formatNumber(ig.engagement)}`);
      sections.push(`- Posts: ${formatNumber(ig.posts)}`);
      sections.push('');
    }

    // Search Console
    if (metrics.individualPlatformMetrics.searchConsole) {
      const gsc = metrics.individualPlatformMetrics.searchConsole;
      sections.push(`### Google Search Console`);
      if (gsc._isFallbackData) {
        sections.push(`**Note: Showing last 30 days data (${gsc._fallbackPeriod}) as no data available for requested period**`);
      }
      sections.push(`- Total Clicks: ${formatNumber(gsc.clicks)}`);
      sections.push(`- Total Impressions: ${formatNumber(gsc.impressions)}`);
      sections.push(`- Average CTR: ${formatPercent(gsc.ctr)}`);
      sections.push(`- Average Position: ${gsc.avgPosition.toFixed(1)}`);
      sections.push('');
    }
  }

  // Top Performers
  if (metrics.topPerformers) {
    sections.push(`## Key Insights`);
    if (metrics.topPerformers.bestChannel) {
      sections.push(`Best Performing Channel: ${metrics.topPerformers.bestChannel} (${formatNumber(metrics.topPerformers.bestChannelSessions)} sessions)`);
    }
    if (metrics.topPerformers.worstChannel) {
      sections.push(`Needs Attention: ${metrics.topPerformers.worstChannel} (${formatNumber(metrics.topPerformers.worstChannelSessions)} sessions)`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

export default {
  formatMetricsForContext,
};
