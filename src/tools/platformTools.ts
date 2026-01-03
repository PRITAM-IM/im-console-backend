import { z } from 'zod';
import Project from '../models/Project';
import analyticsService from '../services/analyticsService';
import youtubeDataService from '../services/youtubeDataService';
import metaAdsDataService from '../services/metaAdsDataService';
import googleSearchConsoleDataService from '../services/googleSearchConsoleDataService';
import facebookDataService from '../services/facebookDataService';
import instagramService from '../services/instagramService';
import googlePlacesService from '../services/googlePlacesService';
import googleAdsDataService from '../services/googleAdsDataService';

/**
 * Platform Tools for Agentic RAG
 * 
 * These tools wrap the existing API integrations into LangChain DynamicStructuredTools.
 * Each tool is designed with a highly specific description to guide the Agent's decision-making.
 * 
 * NOTE: Tools are created lazily via factory function to prevent memory issues during initialization.
 */

// Common schema for date-based queries
const dateRangeSchema = z.object({
    projectId: z.string().describe('The MongoDB ObjectId of the project'),
    startDate: z.string().describe('Start date in YYYY-MM-DD format (ISO 8601)'),
    endDate: z.string().describe('End date in YYYY-MM-DD format (ISO 8601)'),
});

// Tool definitions (descriptions and functions)
const toolDefinitions = {
    google_analytics: {
        name: 'google_analytics_tool',
        description: `Use this tool ONLY for Google Analytics 4 (GA4) website traffic and user behavior data.
  
  **When to use:**
  - Questions about website sessions, users, pageviews
  - Bounce rate, session duration, engagement metrics
  - Traffic sources and channel breakdown (Organic, Direct, Referral, Social, Paid Search, etc.)
  - Website conversions and revenue (e-commerce)
  - User demographics and behavior flow
  
  **Do NOT use for:**
  - Paid advertising metrics (use google_ads_tool or meta_ads_tool instead)
  - Social media organic posts (use facebook_tool, instagram_tool, or youtube_tool)
  - SEO rankings (use search_console_tool)
  
  **Returns:** Traffic metrics, conversion data, channel breakdown, and top performing channels.`,
        func: async ({ projectId, startDate, endDate }: { projectId: string; startDate: string; endDate: string }) => {
            try {
                const project = await Project.findById(projectId);
                if (!project || !project.gaPropertyId) {
                    return JSON.stringify({ error: 'Google Analytics not connected for this project' });
                }

                const [overviewData, channelData] = await Promise.all([
                    analyticsService.getOverviewMetrics(projectId, project.gaPropertyId, startDate, endDate),
                    analyticsService.getSessionChannels(projectId, project.gaPropertyId, startDate, endDate),
                ]);

                return JSON.stringify({
                    platform: 'Google Analytics',
                    dateRange: { startDate, endDate },
                    overview: {
                        sessions: overviewData.sessions,
                        users: overviewData.totalUsers,
                        sessionsChange: overviewData.sessionsChange,
                        usersChange: overviewData.totalUsersChange,
                        bounceRate: overviewData.bounceRate,
                        avgSessionDuration: overviewData.averageSessionDuration,
                        conversions: overviewData.conversions,
                        revenue: overviewData.totalRevenue,
                    },
                    channels: channelData,
                }, null, 2);
            } catch (error: any) {
                return JSON.stringify({ error: `Failed to fetch Google Analytics data: ${error.message}` });
            }
        },
    },

    google_ads: {
        name: 'google_ads_tool',
        description: `Use this tool ONLY for Google Ads (formerly AdWords) paid search advertising metrics.
  
  **When to use:**
  - Questions about Google Ads spend, budget, or cost
  - Ad clicks, impressions, CTR (Click-Through Rate)
  - CPC (Cost Per Click), CPM (Cost Per Mille)
  - Google Ads conversions and conversion value
  - ROAS (Return on Ad Spend) for Google Ads
  - Campaign performance on Google Search, Display Network, Shopping, YouTube Ads
  
  **Do NOT use for:**
  - Organic Google search traffic (use search_console_tool)
  - Facebook/Instagram ads (use meta_ads_tool)
  - Website analytics (use google_analytics_tool)
  
  **Returns:** Campaign-level spend, clicks, impressions, conversions, CPC, CTR, and ROAS.`,
        func: async ({ projectId, startDate, endDate }: { projectId: string; startDate: string; endDate: string }) => {
            try {
                const project = await Project.findById(projectId);
                if (!project || !project.googleAdsCustomerId) {
                    return JSON.stringify({ error: 'Google Ads not connected for this project' });
                }

                // Get access token
                const accessToken = await googleAdsDataService.getAccessToken(projectId);

                // Fetch overview metrics and campaigns data
                const [overviewData, campaignsData] = await Promise.all([
                    googleAdsDataService.getOverviewMetrics(
                        project.googleAdsCustomerId,
                        accessToken,
                        { startDate, endDate }
                    ),
                    googleAdsDataService.getCampaigns(
                        project.googleAdsCustomerId,
                        accessToken,
                        { startDate, endDate }
                    )
                ]);

                if (!campaignsData || campaignsData.length === 0) {
                    return JSON.stringify({
                        platform: 'Google Ads',
                        dateRange: { startDate, endDate },
                        message: 'No campaign data available for this date range',
                        overview: overviewData || {},
                        campaigns: []
                    });
                }

                return JSON.stringify({
                    platform: 'Google Ads',
                    dateRange: { startDate, endDate },
                    overview: {
                        totalSpend: overviewData.cost || 0,
                        totalClicks: overviewData.clicks || 0,
                        totalImpressions: overviewData.impressions || 0,
                        totalConversions: overviewData.conversions || 0,
                        avgCPC: overviewData.averageCpc || 0,
                        avgCTR: overviewData.ctr || 0,
                        conversionRate: overviewData.conversionRate || 0,
                        costPerConversion: overviewData.costPerConversion || 0,
                    },
                    campaigns: campaignsData.map((c: any) => ({
                        name: c.name,
                        status: c.status,
                        spend: c.cost,
                        clicks: c.clicks,
                        impressions: c.impressions,
                        conversions: c.conversions,
                        cpc: c.averageCpc,
                        ctr: c.ctr,
                    })),
                }, null, 2);
            } catch (error: any) {
                return JSON.stringify({ error: `Failed to fetch Google Ads data: ${error.message}` });
            }
        },
    },

    meta_ads: {
        name: 'meta_ads_tool',
        description: `Use this tool ONLY for Meta Ads (Facebook Ads Manager) - paid advertising on Facebook and Instagram.
  
  **When to use:**
  - Questions about Facebook or Instagram AD spend (not organic posts)
  - Ad impressions, reach, clicks, and engagement from paid campaigns
  - Meta Ads conversions, ROAS, CPM, CPC
  - Campaign performance across Facebook Feed, Instagram Feed, Stories, Reels ads
  
  **Do NOT use for:**
  - Organic Facebook page posts (use facebook_tool)
  - Organic Instagram posts (use instagram_tool)
  - Google advertising (use google_ads_tool)
  
  **Returns:** Ad account spend, clicks, impressions, conversions, CPC, CTR, and campaign breakdown.`,
        func: async ({ projectId, startDate, endDate }: { projectId: string; startDate: string; endDate: string }) => {
            try {
                const project = await Project.findById(projectId);
                if (!project || !project.metaAdsAccountId) {
                    return JSON.stringify({ error: 'Meta Ads not connected for this project. Please connect Meta Ads in Project Settings.' });
                }

                // Get access token and fetch live data
                const accessToken = await metaAdsDataService.getAccessToken(projectId);
                const insights = await metaAdsDataService.getInsights(
                    project.metaAdsAccountId,
                    accessToken,
                    { startDate, endDate }
                );

                if (!insights || Object.keys(insights).length === 0) {
                    return JSON.stringify({
                        platform: 'Meta Ads',
                        dateRange: { startDate, endDate },
                        message: 'No Meta Ads data available for this date range. This may mean no campaigns were active during this period.',
                    });
                }

                return JSON.stringify({
                    platform: 'Meta Ads',
                    dateRange: { startDate, endDate },
                    summary: {
                        spend: insights.spend || 0,
                        clicks: insights.clicks || 0,
                        impressions: insights.impressions || 0,
                        conversions: insights.conversions || 0,
                        cpc: insights.cpc || 0,
                        ctr: insights.ctr || 0,
                        reach: insights.reach || 0,
                        frequency: insights.frequency || 0,
                        cpm: insights.cpm || 0,
                    },
                }, null, 2);
            } catch (error: any) {
                return JSON.stringify({ error: `Failed to fetch Meta Ads data: ${error.message}` });
            }
        },
    },

    search_console: {
        name: 'search_console_tool',
        description: `Use this tool ONLY for Google Search Console - organic (non-paid) search performance data.
  
  **When to use:**
  - Questions about organic Google search clicks and impressions
  - SEO performance, keyword rankings, average position
  - Search queries driving traffic
  - CTR (Click-Through Rate) for organic search results
  
  **Do NOT use for:**
  - Paid Google Ads (use google_ads_tool)
  - Overall website traffic (use google_analytics_tool)
  - Social media search (use platform-specific tools)
  
  **Returns:** Organic clicks, impressions, CTR, average position, and top queries.`,
        func: async ({ projectId, startDate, endDate }: { projectId: string; startDate: string; endDate: string }) => {
            try {
                const project = await Project.findById(projectId);
                if (!project || !project.searchConsoleSiteUrl) {
                    return JSON.stringify({ error: 'Search Console not connected for this project. Please connect Search Console in Project Settings.' });
                }

                // Get access token and fetch live data
                const accessToken = await googleSearchConsoleDataService.getAccessToken(projectId);
                const data = await googleSearchConsoleDataService.getSearchAnalytics(
                    project.searchConsoleSiteUrl,
                    accessToken,
                    { startDate, endDate }
                );

                if (!data || Object.keys(data).length === 0) {
                    return JSON.stringify({
                        platform: 'Search Console',
                        dateRange: { startDate, endDate },
                        message: 'No Search Console data available for this date range.',
                    });
                }

                return JSON.stringify({
                    platform: 'Search Console',
                    dateRange: { startDate, endDate },
                    summary: {
                        clicks: data.clicks || 0,
                        impressions: data.impressions || 0,
                        ctr: data.ctr || 0,
                        avgPosition: data.position || 0,
                    },
                }, null, 2);
            } catch (error: any) {
                return JSON.stringify({ error: `Failed to fetch Search Console data: ${error.message}` });
            }
        },
    },

    facebook: {
        name: 'facebook_tool',
        description: `Use this tool ONLY for organic Facebook Page metrics (NOT paid ads).
  
  **When to use:**
  - Questions about Facebook page followers, likes, or fans
  - Organic post engagement (likes, comments, shares) on Facebook
  - Facebook page reach and impressions (organic)
  - Number of posts published on Facebook
  
  **Do NOT use for:**
  - Facebook or Instagram PAID ads (use meta_ads_tool)
  - Instagram organic posts (use instagram_tool)
  
  **Returns:** Page followers, engagement, reach, and posts published.`,
        func: async ({ projectId, startDate, endDate }: { projectId: string; startDate: string; endDate: string }) => {
            try {
                const project = await Project.findById(projectId);
                if (!project || !project.facebookPageId) {
                    return JSON.stringify({ error: 'Facebook not connected for this project. Please connect Facebook in Project Settings.' });
                }

                // Get page access token and fetch live data
                const accessToken = await facebookDataService.getPageAccessToken(projectId);
                const fbData = await facebookDataService.getOverviewMetrics(
                    project.facebookPageId,
                    accessToken,
                    { startDate, endDate }
                );

                return JSON.stringify({
                    platform: 'Facebook',
                    dateRange: { startDate, endDate },
                    summary: {
                        pageViews: fbData.pageViews || 0,
                        reach: fbData.reach || 0,
                        followers: fbData.pageFollowers || 0,
                        likes: fbData.pageLikes || 0,
                        totalLikes: fbData.totalLikes || 0,
                        totalComments: fbData.totalComments || 0,
                        totalShares: fbData.totalShares || 0,
                        impressions: fbData.impressions || 0,
                        engagementRate: fbData.engagementRate || 0,
                    },
                }, null, 2);
            } catch (error: any) {
                return JSON.stringify({ error: `Failed to fetch Facebook data: ${error.message}` });
            }
        },
    },

    instagram: {
        name: 'instagram_tool',
        description: `Use this tool ONLY for organic Instagram profile and content metrics (NOT paid ads).
  
  **When to use:**
  - Questions about Instagram followers or follower growth
  - Organic post engagement (likes, comments, saves) on Instagram
  - Instagram reach and impressions (organic)
  - Number of posts published on Instagram
  
  **Do NOT use for:**
  - Instagram PAID ads (use meta_ads_tool)
  - Facebook organic posts (use facebook_tool)
  
  **Returns:** Follower count, engagement, reach, and posts published.`,
        func: async ({ projectId, startDate, endDate }: { projectId: string; startDate: string; endDate: string }) => {
            try {
                const project = await Project.findById(projectId);
                if (!project || !project.instagram?.igUserId) {
                    return JSON.stringify({ error: 'Instagram not connected for this project. Please connect Instagram in Project Settings.' });
                }

                // Get access token and fetch live data
                const accessToken = await instagramService.getAccessToken(projectId);
                const igData = await instagramService.getInsights(
                    project.instagram.igUserId,
                    accessToken
                );

                return JSON.stringify({
                    platform: 'Instagram',
                    dateRange: { startDate, endDate },
                    summary: {
                        followers: igData.lifetime?.follower_count || igData.days_28?.follower_count || 0,
                        reach: igData.days_28?.reach || igData.lifetime?.reach || 0,
                        profileViews: igData.days_28?.profile_views || igData.lifetime?.profile_views || 0,
                        totalInteractions: igData.days_28?.total_interactions || igData.lifetime?.total_interactions || 0,
                        likes: igData.days_28?.likes || igData.lifetime?.likes || 0,
                        comments: igData.days_28?.comments || igData.lifetime?.comments || 0,
                        shares: igData.days_28?.shares || igData.lifetime?.shares || 0,
                        saves: igData.days_28?.saves || igData.lifetime?.saves || 0,
                        websiteClicks: igData.days_28?.website_clicks || igData.lifetime?.website_clicks || 0,
                    },
                }, null, 2);
            } catch (error: any) {
                return JSON.stringify({ error: `Failed to fetch Instagram data: ${error.message}` });
            }
        },
    },

    youtube: {
        name: 'youtube_tool',
        description: `Use this tool ONLY for YouTube channel and video performance metrics.
  
  **When to use:**
  - Questions about YouTube views, watch time, or video performance
  - Subscriber count and subscriber growth
  - Video engagement (likes, comments, shares)
  - Top performing videos or playlists
  
  **Do NOT use for:**
  - YouTube Ads (use google_ads_tool with YouTube campaign filter)
  - Other social media platforms
  
  **Returns:** Views, watch time, subscribers gained, likes, comments, and shares.`,
        func: async ({ projectId, startDate, endDate }: { projectId: string; startDate: string; endDate: string }) => {
            try {
                const project = await Project.findById(projectId);
                if (!project || !project.youtubeChannelId) {
                    return JSON.stringify({ error: 'YouTube not connected for this project' });
                }

                const accessToken = await youtubeDataService.getAccessToken(projectId);
                const ytData = await youtubeDataService.getOverviewMetrics(
                    project.youtubeChannelId,
                    accessToken,
                    { startDate, endDate }
                );

                if (!ytData) {
                    return JSON.stringify({
                        platform: 'YouTube',
                        dateRange: { startDate, endDate },
                        message: 'No YouTube data available for this date range.',
                    });
                }

                return JSON.stringify({
                    platform: 'YouTube',
                    dateRange: { startDate, endDate },
                    summary: {
                        views: ytData.views || 0,
                        watchTimeMinutes: ytData.estimatedMinutesWatched || 0,
                        subscribersGained: ytData.subscribersGained || 0,
                        likes: ytData.likes || 0,
                        comments: ytData.comments || 0,
                        shares: ytData.shares || 0,
                    },
                }, null, 2);
            } catch (error: any) {
                return JSON.stringify({ error: `Failed to fetch YouTube data: ${error.message}` });
            }
        },
    },

    linkedin: {
        name: 'linkedin_tool',
        description: `Use this tool ONLY for LinkedIn company page metrics and professional network engagement.
  
  **When to use:**
  - Questions about LinkedIn page followers or company page metrics
  - LinkedIn post engagement and reach
  - Professional network growth
  
  **Do NOT use for:**
  - Other social media platforms
  - LinkedIn Ads (currently not integrated, suggest connecting if asked)
  
  **Returns:** LinkedIn page metrics including followers and engagement.`,
        func: async ({ projectId, startDate, endDate }: { projectId: string; startDate: string; endDate: string }) => {
            try {
                const project = await Project.findById(projectId);
                if (!project || !project.linkedinPageId) {
                    return JSON.stringify({ error: 'LinkedIn not connected for this project' });
                }

                return JSON.stringify({
                    platform: 'LinkedIn',
                    dateRange: { startDate, endDate },
                    message: 'LinkedIn integration is connected but data fetching is pending full implementation.',
                });
            } catch (error: any) {
                return JSON.stringify({ error: `Failed to fetch LinkedIn data: ${error.message}` });
            }
        },
    },

    google_places: {
        name: 'google_places_tool',
        description: `Use this tool ONLY for Google Places (Google My Business) local business/hotel information.
  
  **When to use:**
  - Questions about the connected hotel/business details
  - Hotel name, address, phone number
  - Current rating and number of reviews
  - Business website and opening hours
  - Customer reviews and feedback
  
  **Note:** This tool does NOT require date filters. It returns current business information.
  
  **Do NOT use for:**
  - Organic search rankings (use search_console_tool)
  - Paid local ads (use google_ads_tool)
  
  **Returns:** Hotel/business details including name, address, rating, reviews, and contact information.`,
        func: async ({ projectId }: { projectId: string; startDate: string; endDate: string }) => {
            try {
                const project = await Project.findById(projectId);
                if (!project || !project.googlePlacesId) {
                    return JSON.stringify({ error: 'Google Places not connected for this project. Please connect Google Places in Project Settings.' });
                }

                // Fetch fresh details from Google Places API
                const placeDetails = await googlePlacesService.getPlaceDetails(project.googlePlacesId);

                // Get recent reviews
                const reviews = await googlePlacesService.getPlaceReviews(project.googlePlacesId);

                return JSON.stringify({
                    platform: 'Google Places',
                    hotelDetails: {
                        name: placeDetails.displayName,
                        address: placeDetails.formattedAddress,
                        rating: placeDetails.rating || 'N/A',
                        totalReviews: placeDetails.userRatingCount || 0,
                        phone: placeDetails.internationalPhoneNumber || placeDetails.nationalPhoneNumber || 'N/A',
                        website: placeDetails.websiteUri || 'N/A',
                        priceLevel: placeDetails.priceLevel || 'N/A',
                    },
                    recentReviews: reviews.slice(0, 5).map((review: any) => ({
                        author: review.authorAttribution?.displayName || 'Anonymous',
                        rating: review.rating,
                        text: review.text?.text || review.originalText?.text || 'No text',
                        time: review.relativePublishTimeDescription || 'Unknown time',
                    })),
                    summary: {
                        averageRating: placeDetails.rating || 0,
                        totalReviews: placeDetails.userRatingCount || 0,
                        recentReviewsShown: Math.min(reviews.length, 5),
                    },
                }, null, 2);
            } catch (error: any) {
                return JSON.stringify({ error: `Failed to fetch Google Places data: ${error.message}` });
            }
        },
    },
};

// Cached tools - created lazily
let cachedTools: any[] | null = null;

/**
 * Factory function to create all platform tools
 * This is lazy-loaded to prevent memory issues during initialization
 */
export async function createPlatformTools(): Promise<any[]> {
    if (cachedTools) return cachedTools;

    console.log('[PlatformTools] 🔄 Creating platform tools...');

    // Dynamically import LangChain
    const { DynamicStructuredTool } = await import('@langchain/core/tools');

    const tools = Object.values(toolDefinitions).map(def =>
        new (DynamicStructuredTool as any)({
            name: def.name,
            description: def.description,
            schema: dateRangeSchema,
            func: def.func,
        })
    );

    cachedTools = tools;
    console.log('[PlatformTools] ✅ Created', tools.length, 'platform tools');

    return tools;
}

// Export tool definitions for reference (without LangChain dependency)
export { toolDefinitions, dateRangeSchema };
