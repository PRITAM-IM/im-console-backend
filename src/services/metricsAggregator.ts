import analyticsService from './analyticsService';
import Project from '../models/Project';
import mongoose from 'mongoose';
import axios from 'axios';

/**
 * Metrics Aggregator Service
 * Aggregates all relevant project metrics for AI context
 * Includes platform connections and individual platform metrics
 */

export interface AggregatedMetrics {
  trafficMetrics: {
    sessions: number;
    users: number;
    sessionsChange: number;
    usersChange: number;
    bounceRate: number;
    bounceRateChange: number;
    avgSessionDuration: number;
    avgSessionDurationChange: number;
  };
  conversionMetrics: {
    conversions: number;
    conversionsChange: number;
    conversionRate: number;
    conversionRateChange: number;
    revenue: number;
    revenueChange: number;
    avgRevenuePerUser: number;
    avgRevenuePerUserChange: number;
  };
  channelBreakdown: Array<{
    channel: string;
    sessions: number;
    sessionsChange: number;
    users: number;
    conversions: number;
    revenue: number;
    percentage: number;
  }>;
  topPerformers: {
    bestChannel: string;
    bestChannelSessions: number;
    worstChannel: string;
    worstChannelSessions: number;
  };
  platformConnections: {
    total: number;
    connected: number;
    notConnected: number;
    connectedPlatforms: string[];
    notConnectedPlatforms: string[];
    platformDetails: {
      googleAnalytics: { connected: boolean; propertyId?: string };
      googleAds: { connected: boolean; customerId?: string; spend?: number; conversions?: number };
      metaAds: { connected: boolean; accountId?: string; spend?: number; conversions?: number };
      searchConsole: { connected: boolean; siteUrl?: string; clicks?: number; impressions?: number };
      facebook: { connected: boolean; pageId?: string; followers?: number; engagement?: number };
      instagram: { connected: boolean; username?: string; followers?: number; engagement?: number };
      youtube: { connected: boolean; channelId?: string };
      linkedin: { connected: boolean; pageId?: string };
      googlePlaces: { connected: boolean; placeId?: string };
    };
  };
  individualPlatformMetrics: {
    googleAds?: {
      spend: number;
      clicks: number;
      impressions: number;
      conversions: number;
      cpc: number;
      ctr: number;
      _isFallbackData?: boolean;
      _fallbackPeriod?: string;
    };
    metaAds?: {
      spend: number;
      clicks: number;
      impressions: number;
      conversions: number;
      cpc: number;
      ctr: number;
      _isFallbackData?: boolean;
      _fallbackPeriod?: string;
    };
    facebook?: {
      followers: number;
      engagement: number;
      reach: number;
      posts: number;
      _isFallbackData?: boolean;
      _fallbackPeriod?: string;
    };
    instagram?: {
      followers: number;
      engagement: number;
      reach: number;
      posts: number;
      _isFallbackData?: boolean;
      _fallbackPeriod?: string;
    };
    searchConsole?: {
      clicks: number;
      impressions: number;
      ctr: number;
      avgPosition: number;
      _isFallbackData?: boolean;
      _fallbackPeriod?: string;
    };
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

/**
 * Get aggregated project metrics for AI context
 */
export async function getProjectMetrics(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<AggregatedMetrics> {
  try {
    console.log(`[MetricsAggregator] Fetching metrics for project ${projectId} from ${startDate} to ${endDate}`);

    // Get project to find GA property ID
    const project = await Project.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Check if project has GA connection
    if (!project.gaPropertyId) {
      console.warn(`[MetricsAggregator] Project ${projectId} has no GA property connected`);
      return getEmptyMetrics(startDate, endDate);
    }

    const propertyId = project.gaPropertyId;

    // Build platform connections info
    const platformConnections = buildPlatformConnections(project);

    // Fetch overview metrics and channel data in parallel
    const [overviewData, channelData] = await Promise.all([
      analyticsService.getOverviewMetrics(projectId, propertyId, startDate, endDate),
      analyticsService.getSessionChannels(projectId, propertyId, startDate, endDate),
    ]);

    // Calculate conversion rate
    const conversionRate = overviewData.sessions > 0 
      ? (overviewData.conversions / overviewData.sessions) * 100 
      : 0;

    // Calculate previous conversion rate for change
    const prevSessions = overviewData.sessions / (1 + overviewData.sessionsChange / 100);
    const prevConversions = overviewData.conversions / (1 + overviewData.conversionsChange / 100);
    const prevConversionRate = prevSessions > 0 ? (prevConversions / prevSessions) * 100 : 0;
    const conversionRateChange = prevConversionRate > 0 
      ? ((conversionRate - prevConversionRate) / prevConversionRate) * 100 
      : 0;

    // Process channel data
    const totalSessions = overviewData.sessions;
    const processedChannels = (channelData || []).map((channel: any) => ({
      channel: channel.channel || 'Unknown',
      sessions: channel.sessions || 0,
      sessionsChange: channel.sessionsChange || 0,
      users: channel.users || 0,
      conversions: channel.conversions || 0,
      revenue: channel.revenue || 0,
      percentage: totalSessions > 0 ? (channel.sessions / totalSessions) * 100 : 0,
    }));

    // Sort by sessions to find top/bottom performers
    const sortedChannels = [...processedChannels].sort((a, b) => b.sessions - a.sessions);
    const bestChannel = sortedChannels[0] || { channel: 'N/A', sessions: 0 };
    const worstChannel = sortedChannels[sortedChannels.length - 1] || { channel: 'N/A', sessions: 0 };

    // Fetch individual platform metrics
    const individualPlatformMetrics = await fetchIndividualPlatformMetrics(project, projectId, startDate, endDate);

    return {
      trafficMetrics: {
        sessions: overviewData.sessions || 0,
        users: overviewData.totalUsers || 0,
        sessionsChange: overviewData.sessionsChange || 0,
        usersChange: overviewData.totalUsersChange || 0,
        bounceRate: overviewData.bounceRate || 0,
        bounceRateChange: overviewData.bounceRateChange || 0,
        avgSessionDuration: overviewData.averageSessionDuration || 0,
        avgSessionDurationChange: overviewData.averageSessionDurationChange || 0,
      },
      conversionMetrics: {
        conversions: overviewData.conversions || 0,
        conversionsChange: overviewData.conversionsChange || 0,
        conversionRate,
        conversionRateChange,
        revenue: overviewData.totalRevenue || 0,
        revenueChange: overviewData.totalRevenueChange || 0,
        avgRevenuePerUser: overviewData.averageRevenuePerUser || 0,
        avgRevenuePerUserChange: overviewData.averageRevenuePerUserChange || 0,
      },
      channelBreakdown: processedChannels,
      topPerformers: {
        bestChannel: bestChannel.channel,
        bestChannelSessions: bestChannel.sessions,
        worstChannel: worstChannel.channel,
        worstChannelSessions: worstChannel.sessions,
      },
      platformConnections,
      individualPlatformMetrics,
      dateRange: {
        startDate,
        endDate,
      },
    };
  } catch (error) {
    console.error('[MetricsAggregator] Error fetching project metrics:', error);
    // Return empty metrics instead of failing
    return getEmptyMetrics(startDate, endDate);
  }
}

/**
 * Get empty metrics structure (for projects without data)
 */
function getEmptyMetrics(startDate: string, endDate: string): AggregatedMetrics {
  return {
    trafficMetrics: {
      sessions: 0,
      users: 0,
      sessionsChange: 0,
      usersChange: 0,
      bounceRate: 0,
      bounceRateChange: 0,
      avgSessionDuration: 0,
      avgSessionDurationChange: 0,
    },
    conversionMetrics: {
      conversions: 0,
      conversionsChange: 0,
      conversionRate: 0,
      conversionRateChange: 0,
      revenue: 0,
      revenueChange: 0,
      avgRevenuePerUser: 0,
      avgRevenuePerUserChange: 0,
    },
    channelBreakdown: [],
    topPerformers: {
      bestChannel: 'No data',
      bestChannelSessions: 0,
      worstChannel: 'No data',
      worstChannelSessions: 0,
    },
    platformConnections: {
      total: 9,
      connected: 0,
      notConnected: 9,
      connectedPlatforms: [],
      notConnectedPlatforms: [
        'Google Analytics',
        'Google Ads',
        'Meta Ads',
        'Search Console',
        'Facebook',
        'Instagram',
        'YouTube',
        'LinkedIn',
        'Google Places',
      ],
      platformDetails: {
        googleAnalytics: { connected: false },
        googleAds: { connected: false },
        metaAds: { connected: false },
        searchConsole: { connected: false },
        facebook: { connected: false },
        instagram: { connected: false },
        youtube: { connected: false },
        linkedin: { connected: false },
        googlePlaces: { connected: false },
      },
    },
    individualPlatformMetrics: {},
    dateRange: {
      startDate,
      endDate,
    },
  };
}

/**
 * Build platform connections information
 */
function buildPlatformConnections(project: any) {
  const connectedPlatforms: string[] = [];
  const notConnectedPlatforms: string[] = [];

  const platformDetails = {
    googleAnalytics: {
      connected: !!project.gaPropertyId,
      propertyId: project.gaPropertyId,
    },
    googleAds: {
      connected: !!project.googleAdsCustomerId,
      customerId: project.googleAdsCustomerId,
    },
    metaAds: {
      connected: !!project.metaAdsAccountId,
      accountId: project.metaAdsAccountId,
    },
    searchConsole: {
      connected: !!project.searchConsoleSiteUrl,
      siteUrl: project.searchConsoleSiteUrl,
    },
    facebook: {
      connected: !!project.facebookPageId,
      pageId: project.facebookPageId,
    },
    instagram: {
      connected: !!project.instagram?.igUserId,
      username: project.instagram?.igUsername,
    },
    youtube: {
      connected: !!project.youtubeChannelId,
      channelId: project.youtubeChannelId,
    },
    linkedin: {
      connected: !!project.linkedinPageId,
      pageId: project.linkedinPageId,
    },
    googlePlaces: {
      connected: !!project.googlePlacesId,
      placeId: project.googlePlacesId,
    },
  };

  // Build connected/not connected lists
  if (platformDetails.googleAnalytics.connected) connectedPlatforms.push('Google Analytics');
  else notConnectedPlatforms.push('Google Analytics');

  if (platformDetails.googleAds.connected) connectedPlatforms.push('Google Ads');
  else notConnectedPlatforms.push('Google Ads');

  if (platformDetails.metaAds.connected) connectedPlatforms.push('Meta Ads');
  else notConnectedPlatforms.push('Meta Ads');

  if (platformDetails.searchConsole.connected) connectedPlatforms.push('Search Console');
  else notConnectedPlatforms.push('Search Console');

  if (platformDetails.facebook.connected) connectedPlatforms.push('Facebook');
  else notConnectedPlatforms.push('Facebook');

  if (platformDetails.instagram.connected) connectedPlatforms.push('Instagram');
  else notConnectedPlatforms.push('Instagram');

  if (platformDetails.youtube.connected) connectedPlatforms.push('YouTube');
  else notConnectedPlatforms.push('YouTube');

  if (platformDetails.linkedin.connected) connectedPlatforms.push('LinkedIn');
  else notConnectedPlatforms.push('LinkedIn');

  if (platformDetails.googlePlaces.connected) connectedPlatforms.push('Google Places');
  else notConnectedPlatforms.push('Google Places');

  return {
    total: 9,
    connected: connectedPlatforms.length,
    notConnected: notConnectedPlatforms.length,
    connectedPlatforms,
    notConnectedPlatforms,
    platformDetails,
  };
}

/**
 * Fetch individual platform metrics with fallback to last 30 days if no data
 */
async function fetchIndividualPlatformMetrics(
  project: any,
  projectId: string,
  startDate: string,
  endDate: string
) {
  const metrics: any = {};

  // Helper function to try fetching with fallback
  const fetchWithFallback = async (cacheKey: string, dateKey: string) => {
    // Try primary date range first
    let data = await analyticsService.getCachedData(projectId, cacheKey, dateKey);
    
    // If no data, try last 30 days as fallback
    if (!data || Object.keys(data).length === 0) {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const thirtyDaysAgo = new Date(yesterday);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      
      const fallbackStart = thirtyDaysAgo.toISOString().split('T')[0];
      const fallbackEnd = yesterday.toISOString().split('T')[0];
      const fallbackKey = `${fallbackStart}_${fallbackEnd}`;
      
      data = await analyticsService.getCachedData(projectId, cacheKey, fallbackKey);
      
      if (data && Object.keys(data).length > 0) {
        // Mark that this is fallback data
        return { ...data, _isFallbackData: true, _fallbackPeriod: `${fallbackStart} to ${fallbackEnd}` };
      }
    }
    
    return data;
  };

  // Fetch Google Ads metrics
  if (project.googleAdsCustomerId) {
    try {
      const { data } = await analyticsService.getGoogleAdsCampaigns(projectId, project.gaPropertyId || '', startDate, endDate);
      if (data && data.length > 0) {
        const totalSpend = data.reduce((sum: number, camp: any) => sum + (camp.cost || 0), 0);
        const totalClicks = data.reduce((sum: number, camp: any) => sum + (camp.clicks || 0), 0);
        const totalImpressions = data.reduce((sum: number, camp: any) => sum + (camp.impressions || 0), 0);
        const totalConversions = data.reduce((sum: number, camp: any) => sum + (camp.conversions || 0), 0);
        
        metrics.googleAds = {
          spend: totalSpend,
          clicks: totalClicks,
          impressions: totalImpressions,
          conversions: totalConversions,
          cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
          ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        };
      }
    } catch (error) {
      console.log('[MetricsAggregator] Failed to fetch Google Ads metrics:', error);
    }
  }

  // Fetch Meta Ads metrics
  if (project.metaAdsAccountId) {
    try {
      const overviewData = await fetchWithFallback('metaAdsOverview', `${startDate}_${endDate}`);
      if (overviewData) {
        metrics.metaAds = {
          spend: parseFloat(overviewData.spend) || 0,
          clicks: parseInt(overviewData.clicks) || 0,
          impressions: parseInt(overviewData.impressions) || 0,
          conversions: parseInt(overviewData.conversions) || 0,
          cpc: parseFloat(overviewData.cpc) || 0,
          ctr: parseFloat(overviewData.ctr) || 0,
          _isFallbackData: overviewData._isFallbackData || false,
          _fallbackPeriod: overviewData._fallbackPeriod || '',
        };
      }
    } catch (error) {
      console.log('[MetricsAggregator] Failed to fetch Meta Ads metrics:', error);
    }
  }

  // Fetch Facebook metrics
  if (project.facebookPageId) {
    try {
      const fbData = await fetchWithFallback('facebookOverview', `${startDate}_${endDate}`);
      if (fbData) {
        metrics.facebook = {
          followers: fbData.pageFollowers || fbData.pageLikes || 0,
          engagement: fbData.pagePostEngagements || fbData.pageEngagedUsers || 0,
          reach: fbData.pageImpressions || fbData.pageReach || 0,
          posts: fbData.postsPublished || 0,
          _isFallbackData: fbData._isFallbackData || false,
          _fallbackPeriod: fbData._fallbackPeriod || '',
        };
      }
    } catch (error) {
      console.log('[MetricsAggregator] Failed to fetch Facebook metrics:', error);
    }
  }

  // Fetch Instagram metrics
  if (project.instagram?.igUserId) {
    try {
      const igData = await fetchWithFallback('instagramOverview', `${startDate}_${endDate}`);
      if (igData && igData.lifetime) {
        metrics.instagram = {
          followers: igData.lifetime.follower_count || igData.days_28?.follower_count || 0,
          engagement: igData.lifetime.total_interactions || igData.days_28?.total_interactions || 0,
          reach: igData.days_28?.reach || igData.lifetime?.reach || 0,
          posts: igData.postsCount || 0,
          _isFallbackData: igData._isFallbackData || false,
          _fallbackPeriod: igData._fallbackPeriod || '',
        };
      }
    } catch (error) {
      console.log('[MetricsAggregator] Failed to fetch Instagram metrics:', error);
    }
  }

  // Fetch Search Console metrics
  if (project.searchConsoleSiteUrl) {
    try {
      const data = await fetchWithFallback('gscOverview', `${startDate}_${endDate}`);
      if (data) {
        metrics.searchConsole = {
          clicks: data.clicks || 0,
          impressions: data.impressions || 0,
          ctr: data.ctr || 0,
          avgPosition: data.position || 0,
          _isFallbackData: data._isFallbackData || false,
          _fallbackPeriod: data._fallbackPeriod || '',
        };
      }
    } catch (error) {
      console.log('[MetricsAggregator] Failed to fetch Search Console metrics:', error);
    }
  }

  return metrics;
}

export default {
  getProjectMetrics,
};
