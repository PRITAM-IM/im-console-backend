import FacebookConnection from '../models/FacebookConnection';
import facebookAuthService from './facebookAuthService';
import { FACEBOOK_API_BASE_URL } from '../config/facebook';
import { Types } from 'mongoose';

export interface FacebookOverviewMetrics {
  pageViews: number;
  reach: number;
  organicReach: number;
  paidReach: number;
  contentInteractions: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  linkClicks: number;
  pageFollowers: number;
  pageLikes: number;
  newFollowers: number;
  unfollowers: number;
  impressions: number;
  organicImpressions: number;
  paidImpressions: number;
  engagementRate: number;
}

export interface FacebookTimeSeriesData {
  date: string;
  engagement: number;
  followers: number;
  reach: number;
  organicImpressions: number;
  pageViews: number;
}

export interface FacebookFollowData {
  date: string;
  followers: number;
  unfollowers: number;
}

export interface FacebookPost {
  id: string;
  message: string;
  createdTime: string;
  type: string;
  permalink: string;
  thumbnailUrl?: string;
  reactions: number;
  comments: number;
  shares: number;
  reach?: number;
  impressions?: number;
  engagements?: number;
  videoViews?: number;
  avgWatchTime?: number;
  linkClicks?: number;
}

export interface IFacebookDataService {
  getAccessToken(projectId: string): Promise<string>;
  getPageAccessToken(projectId: string): Promise<string>;
  getOverviewMetrics(pageId: string, accessToken: string, dateRange: { startDate: string; endDate: string }): Promise<FacebookOverviewMetrics>;
  getTimeSeriesData(pageId: string, accessToken: string, dateRange: { startDate: string; endDate: string }): Promise<FacebookTimeSeriesData[]>;
  getFollowData(pageId: string, accessToken: string, dateRange: { startDate: string; endDate: string }): Promise<FacebookFollowData[]>;
  getPosts(pageId: string, accessToken: string, dateRange: { startDate: string; endDate: string }): Promise<FacebookPost[]>;
}

// Convert date string to Unix timestamp
const dateToUnix = (dateStr: string): number => {
  return Math.floor(new Date(dateStr).getTime() / 1000);
};

class FacebookDataService implements IFacebookDataService {
  /**
   * Get the user access token (for fetching pages list, etc.)
   */
  public async getAccessToken(projectId: string): Promise<string> {
    const connection = await FacebookConnection.findOne({ projectId: new Types.ObjectId(projectId) });

    if (!connection) {
      throw new Error('Facebook connection not found for this project');
    }

    const now = new Date();
    const expiresAt = connection.expiresAt || new Date(0);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (!connection.accessToken || expiresAt < fiveMinutesFromNow) {
      console.log('[Facebook Data Service] Access token expired or missing, refreshing...');
      const { accessToken, expiresAt: newExpiresAt } = await facebookAuthService.refreshAccessToken(connection.refreshToken);
      
      connection.accessToken = accessToken;
      connection.expiresAt = newExpiresAt ?? undefined;
      await connection.save();

      return accessToken;
    }

    return connection.accessToken;
  }

  /**
   * Get the PAGE access token (required for Page Insights API)
   * Falls back to user token if page token not available
   */
  public async getPageAccessToken(projectId: string): Promise<string> {
    const connection = await FacebookConnection.findOne({ projectId: new Types.ObjectId(projectId) });

    if (!connection) {
      throw new Error('Facebook connection not found for this project');
    }

    // If we have a page access token, use it (page tokens don't expire)
    if (connection.pageAccessToken) {
      console.log('[Facebook Data Service] Using stored page access token');
      return connection.pageAccessToken;
    }

    // Fall back to user access token (may not work for page insights)
    console.warn('[Facebook Data Service] No page access token found, falling back to user token. Please re-select your Facebook page.');
    return this.getAccessToken(projectId);
  }

  public async getOverviewMetrics(
    pageId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<FacebookOverviewMetrics> {
    console.log(`[Facebook Data Service] Fetching overview metrics for page: ${pageId}`);
    console.log(`[Facebook Data Service] Date range: ${dateRange.startDate} to ${dateRange.endDate}`);
    
    const since = dateToUnix(dateRange.startDate);
    const until = dateToUnix(dateRange.endDate) + 86400;
    
    const result: FacebookOverviewMetrics = {
      pageViews: 0,
      reach: 0,
      organicReach: 0,
      paidReach: 0,
      contentInteractions: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      linkClicks: 0,
      pageFollowers: 0,
      pageLikes: 0,
      newFollowers: 0,
      unfollowers: 0,
      impressions: 0,
      organicImpressions: 0,
      paidImpressions: 0,
      engagementRate: 0,
    };

    try {
      // Fetch basic page info
      const pageUrl = `${FACEBOOK_API_BASE_URL}/${pageId}?fields=followers_count,fan_count,name&access_token=${accessToken}`;
      console.log(`[Facebook Data Service] Fetching page info from: ${pageUrl.substring(0, 80)}...`);
      
      const pageResponse = await fetch(pageUrl);
      if (pageResponse.ok) {
        const pageData = await pageResponse.json() as any;
        result.pageFollowers = pageData.followers_count || 0;
        result.pageLikes = pageData.fan_count || 0;
        console.log(`[Facebook Data Service] Page info: followers=${result.pageFollowers}, likes=${result.pageLikes}`);
      } else {
        const errorText = await pageResponse.text();
        console.error(`[Facebook Data Service] Page info API error (${pageResponse.status}):`, errorText);
      }

      // Fetch page insights - using valid metrics for API v20.0
      // Facebook Page Insights has specific requirements:
      // - Some metrics only work with specific periods (day, week, days_28)
      // - Some metrics need "total_over_range" period
      
      // Method 1: Try fetching insights with period=total_over_range (aggregated)
      const aggregatedMetrics = [
        'page_impressions',
        'page_impressions_unique', // Reach
        'page_impressions_organic_unique',
        'page_impressions_paid_unique',
        'page_post_engagements',
        'page_engaged_users',
      ].join(',');
      
      const aggregatedUrl = `${FACEBOOK_API_BASE_URL}/${pageId}/insights?metric=${aggregatedMetrics}&period=total_over_range&since=${since}&until=${until}&access_token=${accessToken}`;
      
      console.log(`[Facebook Data Service] Fetching aggregated insights...`);
      try {
        const aggResponse = await fetch(aggregatedUrl);
        if (aggResponse.ok) {
          const aggData = await aggResponse.json() as { data?: any[] };
          if (aggData.data) {
            for (const metric of aggData.data) {
              const value = metric.values?.[0]?.value || 0;
              switch (metric.name) {
                case 'page_impressions':
                  result.impressions = Number(value);
                  break;
                case 'page_impressions_unique':
                  result.reach = Number(value);
                  break;
                case 'page_impressions_organic_unique':
                  result.organicReach = Number(value);
                  break;
                case 'page_impressions_paid_unique':
                  result.paidReach = Number(value);
                  break;
                case 'page_post_engagements':
                  result.contentInteractions = Number(value);
                  break;
              }
            }
          }
          console.log(`[Facebook Data Service] Aggregated metrics: reach=${result.reach}, impressions=${result.impressions}, contentInteractions=${result.contentInteractions}`);
        } else {
          const errorText = await aggResponse.text();
          console.log(`[Facebook Data Service] Aggregated metrics not available, trying day period...`);
          
          // Fallback: Try with day period and sum values
          const dayUrl = `${FACEBOOK_API_BASE_URL}/${pageId}/insights?metric=${aggregatedMetrics}&period=day&since=${since}&until=${until}&access_token=${accessToken}`;
          const dayResponse = await fetch(dayUrl);
          if (dayResponse.ok) {
            const dayData = await dayResponse.json() as { data?: any[] };
            if (dayData.data) {
              for (const metric of dayData.data) {
                const values = metric.values || [];
                const total = values.reduce((sum: number, v: any) => sum + (Number(v.value) || 0), 0);
                switch (metric.name) {
                  case 'page_impressions':
                    result.impressions = total;
                    break;
                  case 'page_impressions_unique':
                    result.reach = total;
                    break;
                  case 'page_impressions_organic_unique':
                    result.organicReach = total;
                    break;
                  case 'page_impressions_paid_unique':
                    result.paidReach = total;
                    break;
                  case 'page_post_engagements':
                    result.contentInteractions = total;
                    break;
                }
              }
              console.log(`[Facebook Data Service] Day metrics: reach=${result.reach}, impressions=${result.impressions}`);
            }
          } else {
            console.error(`[Facebook Data Service] Day metrics also failed`);
          }
        }
      } catch (err: any) {
        console.error(`[Facebook Data Service] Aggregated fetch error:`, err.message);
      }

      // Method 2: Fetch fan changes with day period (these only work with day/week/days_28)
      const fanMetrics = 'page_fan_adds,page_fan_removes';
      const fanUrl = `${FACEBOOK_API_BASE_URL}/${pageId}/insights?metric=${fanMetrics}&period=day&since=${since}&until=${until}&access_token=${accessToken}`;
      
      console.log(`[Facebook Data Service] Fetching fan metrics...`);
      try {
        const fanResponse = await fetch(fanUrl);
        if (fanResponse.ok) {
          const fanData = await fanResponse.json() as { data?: any[] };
          if (fanData.data) {
            for (const metric of fanData.data) {
              const values = metric.values || [];
              const total = values.reduce((sum: number, v: any) => sum + (Number(v.value) || 0), 0);
              if (metric.name === 'page_fan_adds') {
                result.newFollowers = total;
              } else if (metric.name === 'page_fan_removes') {
                result.unfollowers = total;
              }
            }
          }
          console.log(`[Facebook Data Service] Fan metrics: newFollowers=${result.newFollowers}, unfollowers=${result.unfollowers}`);
        } else {
          console.log(`[Facebook Data Service] Fan metrics not available`);
        }
      } catch (err: any) {
        console.error(`[Facebook Data Service] Fan fetch error:`, err.message);
      }

      // Method 3: Fetch page views (works with day period)
      const viewUrl = `${FACEBOOK_API_BASE_URL}/${pageId}/insights?metric=page_views_total&period=day&since=${since}&until=${until}&access_token=${accessToken}`;
      
      console.log(`[Facebook Data Service] Fetching view metrics...`);
      try {
        const viewResponse = await fetch(viewUrl);
        if (viewResponse.ok) {
          const viewData = await viewResponse.json() as { data?: any[] };
          if (viewData.data && viewData.data.length > 0) {
            for (const metric of viewData.data) {
              const values = metric.values || [];
              const total = values.reduce((sum: number, v: any) => sum + (Number(v.value) || 0), 0);
              if (metric.name === 'page_views_total') {
                result.pageViews = total;
              }
            }
            console.log(`[Facebook Data Service] View metrics: pageViews=${result.pageViews}`);
          } else {
            console.log(`[Facebook Data Service] View metrics returned empty data`);
          }
        } else {
          const errorText = await viewResponse.text();
          console.error(`[Facebook Data Service] View metrics API error (${viewResponse.status}):`, errorText.substring(0, 200));
        }
      } catch (err: any) {
        console.error(`[Facebook Data Service] View fetch error:`, err.message);
      }

      // Method 4: Calculate reach from posts if page insights fail
      if (result.reach === 0) {
        console.log(`[Facebook Data Service] Trying to get reach from posts...`);
        const postsReachUrl = `${FACEBOOK_API_BASE_URL}/${pageId}/posts?fields=insights.metric(post_impressions_unique)&since=${since}&until=${until}&limit=100&access_token=${accessToken}`;
        try {
          const postsReachResponse = await fetch(postsReachUrl);
          if (postsReachResponse.ok) {
            const postsReachData = await postsReachResponse.json() as { data?: any[] };
            if (postsReachData.data) {
              let totalReach = 0;
              for (const post of postsReachData.data) {
                if (post.insights?.data) {
                  for (const insight of post.insights.data) {
                    if (insight.name === 'post_impressions_unique') {
                      totalReach += insight.values?.[0]?.value || 0;
                    }
                  }
                }
              }
              if (totalReach > 0) {
                result.reach = totalReach;
                console.log(`[Facebook Data Service] Calculated reach from posts: ${totalReach}`);
              }
            }
          }
        } catch (err: any) {
          console.log(`[Facebook Data Service] Posts reach calculation failed`);
        }
      }

      // Fetch posts to calculate likes, comments, shares
      console.log(`[Facebook Data Service] Fetching posts for engagement totals...`);
      const postsUrl = `${FACEBOOK_API_BASE_URL}/${pageId}/posts?fields=likes.summary(true),comments.summary(true),shares,created_time&since=${since}&until=${until}&limit=100&access_token=${accessToken}`;
      try {
        const postsResponse = await fetch(postsUrl);
        if (postsResponse.ok) {
          const postsData = await postsResponse.json() as { data?: any[] };
          if (postsData.data && postsData.data.length > 0) {
            console.log(`[Facebook Data Service] Found ${postsData.data.length} posts for totals`);
            for (const post of postsData.data) {
              result.totalLikes += post.likes?.summary?.total_count || 0;
              result.totalComments += post.comments?.summary?.total_count || 0;
              result.totalShares += post.shares?.count || 0;
            }
            console.log(`[Facebook Data Service] Posts totals: likes=${result.totalLikes}, comments=${result.totalComments}, shares=${result.totalShares}`);
          } else {
            console.log(`[Facebook Data Service] No posts found in date range`);
          }
        } else {
          const errorText = await postsResponse.text();
          console.error(`[Facebook Data Service] Posts API error (${postsResponse.status}):`, errorText.substring(0, 200));
        }
      } catch (err: any) {
        console.error(`[Facebook Data Service] Posts fetch error:`, err.message);
      }

      // Calculate engagement rate
      if (result.reach > 0) {
        result.engagementRate = ((result.contentInteractions / result.reach) * 100);
      }

      console.log(`[Facebook Data Service] Overview metrics:`, result);
      return result;
    } catch (error: any) {
      console.error(`[Facebook Data Service] Error:`, error.message);
      throw new Error(`Failed to fetch Facebook insights: ${error.message}`);
    }
  }

  public async getTimeSeriesData(
    pageId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<FacebookTimeSeriesData[]> {
    console.log(`[Facebook Data Service] Fetching time series data`);
    
    const since = dateToUnix(dateRange.startDate);
    const until = dateToUnix(dateRange.endDate) + 86400;
    
    const result: FacebookTimeSeriesData[] = [];
    const dateMap: Record<string, FacebookTimeSeriesData> = {};

    try {
      const metrics = [
        'page_post_engagements',
        'page_fans',
        'page_impressions_unique',
        'page_impressions_organic',
        'page_views_total',
      ].join(',');

      const url = `${FACEBOOK_API_BASE_URL}/${pageId}/insights?metric=${metrics}&period=day&since=${since}&until=${until}&access_token=${accessToken}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json() as { data?: any[] };
        
        if (data.data) {
          for (const metric of data.data) {
            for (const value of metric.values || []) {
              const date = value.end_time?.split('T')[0] || '';
              if (!date) continue;
              
              if (!dateMap[date]) {
                dateMap[date] = {
                  date,
                  engagement: 0,
                  followers: 0,
                  reach: 0,
                  organicImpressions: 0,
                  pageViews: 0,
                };
              }
              
              switch (metric.name) {
                case 'page_post_engagements':
                  dateMap[date].engagement = Number(value.value) || 0;
                  break;
                case 'page_fans':
                  dateMap[date].followers = Number(value.value) || 0;
                  break;
                case 'page_impressions_unique':
                  dateMap[date].reach = Number(value.value) || 0;
                  break;
                case 'page_impressions_organic':
                  dateMap[date].organicImpressions = Number(value.value) || 0;
                  break;
                case 'page_views_total':
                  dateMap[date].pageViews = Number(value.value) || 0;
                  break;
              }
            }
          }
        }
      }

      // Convert map to array and sort by date
      return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
    } catch (error: any) {
      console.error(`[Facebook Data Service] Error fetching time series:`, error.message);
      return [];
    }
  }

  public async getFollowData(
    pageId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<FacebookFollowData[]> {
    console.log(`[Facebook Data Service] Fetching follow/unfollow data`);
    
    const since = dateToUnix(dateRange.startDate);
    const until = dateToUnix(dateRange.endDate) + 86400;
    
    const dateMap: Record<string, FacebookFollowData> = {};

    try {
      const metrics = ['page_fan_adds', 'page_fan_removes'].join(',');
      const url = `${FACEBOOK_API_BASE_URL}/${pageId}/insights?metric=${metrics}&period=day&since=${since}&until=${until}&access_token=${accessToken}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json() as { data?: any[] };
        
        if (data.data) {
          for (const metric of data.data) {
            for (const value of metric.values || []) {
              const date = value.end_time?.split('T')[0] || '';
              if (!date) continue;
              
              if (!dateMap[date]) {
                dateMap[date] = { date, followers: 0, unfollowers: 0 };
              }
              
              if (metric.name === 'page_fan_adds') {
                dateMap[date].followers = Number(value.value) || 0;
              } else if (metric.name === 'page_fan_removes') {
                dateMap[date].unfollowers = Number(value.value) || 0;
              }
            }
          }
        }
      }

      return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
    } catch (error: any) {
      console.error(`[Facebook Data Service] Error fetching follow data:`, error.message);
      return [];
    }
  }

  public async getPosts(
    pageId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<FacebookPost[]> {
    console.log(`[Facebook Data Service] Fetching posts`);
    
    const since = dateToUnix(dateRange.startDate);
    const until = dateToUnix(dateRange.endDate) + 86400;
    
    const posts: FacebookPost[] = [];

    try {
      // Fetch posts with all available metrics
      const fields = [
        'id',
        'message',
        'created_time',
        'permalink_url',
        'full_picture',
        'type',
        'status_type',
        'likes.summary(true)',
        'comments.summary(true)',
        'shares',
        'reactions.summary(true)',
      ].join(',');

      const url = `${FACEBOOK_API_BASE_URL}/${pageId}/posts?fields=${fields}&since=${since}&until=${until}&limit=50&access_token=${accessToken}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json() as { data?: any[] };
        
        if (data.data) {
          for (const post of data.data) {
            const postData: FacebookPost = {
              id: post.id,
              message: post.message || '',
              createdTime: post.created_time,
              type: post.status_type || post.type || 'status',
              permalink: post.permalink_url || '',
              thumbnailUrl: post.full_picture,
              reactions: post.reactions?.summary?.total_count || post.likes?.summary?.total_count || 0,
              comments: post.comments?.summary?.total_count || 0,
              shares: post.shares?.count || 0,
            };

            // Try to fetch post insights for additional metrics
            try {
              const postInsightsUrl = `${FACEBOOK_API_BASE_URL}/${post.id}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users,post_clicks&access_token=${accessToken}`;
              const insightsResponse = await fetch(postInsightsUrl);
              
              if (insightsResponse.ok) {
                const insightsData = await insightsResponse.json() as { data?: any[] };
                if (insightsData.data) {
                  for (const insight of insightsData.data) {
                    const value = insight.values?.[0]?.value || 0;
                    switch (insight.name) {
                      case 'post_impressions':
                        postData.impressions = value;
                        break;
                      case 'post_impressions_unique':
                        postData.reach = value;
                        break;
                      case 'post_engaged_users':
                        postData.engagements = value;
                        break;
                      case 'post_clicks':
                        postData.linkClicks = value;
                        break;
                    }
                  }
                }
              }
            } catch (insightError) {
              // Post insights may not be available for all posts
            }

            // For video posts, try to get video metrics
            if (post.type === 'video' || post.status_type === 'added_video') {
              try {
                const videoUrl = `${FACEBOOK_API_BASE_URL}/${post.id}?fields=video_insights&access_token=${accessToken}`;
                const videoResponse = await fetch(videoUrl);
                
                if (videoResponse.ok) {
                  const videoData = await videoResponse.json() as any;
                  if (videoData.video_insights?.data) {
                    for (const insight of videoData.video_insights.data) {
                      if (insight.name === 'total_video_views') {
                        postData.videoViews = insight.values?.[0]?.value || 0;
                      }
                      if (insight.name === 'total_video_avg_time_watched') {
                        postData.avgWatchTime = (insight.values?.[0]?.value || 0) / 1000; // Convert to seconds
                      }
                    }
                  }
                }
              } catch (videoError) {
                // Video insights may not be available
              }
            }

            posts.push(postData);
          }
        }
      }

      return posts;
    } catch (error: any) {
      console.error(`[Facebook Data Service] Error fetching posts:`, error.message);
      return [];
    }
  }

  // Legacy method for backward compatibility
  public async getPageInsights(
    pageId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    return this.getTimeSeriesData(pageId, accessToken, dateRange);
  }
}

export default new FacebookDataService();
