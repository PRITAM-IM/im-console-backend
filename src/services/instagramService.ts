import FacebookConnection from '../models/FacebookConnection';
import { FACEBOOK_API_BASE_URL } from '../config/facebook';
import { Types } from 'mongoose';

export interface InstagramBusinessAccount {
  igUserId: string;
  igUsername: string;
  pageId: string;
  pageName: string;
}

export interface InstagramInsights {
  lifetime?: {
    reach?: number;
    profile_views?: number;
    follower_count?: number;
    website_clicks?: number;
    accounts_engaged?: number;
    total_interactions?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    profile_links_taps?: number;
  };
  days_28?: {
    reach?: number;
    profile_views?: number;
    follower_count?: number;
    website_clicks?: number;
    accounts_engaged?: number;
    total_interactions?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    profile_links_taps?: number;
  };
  audience?: {
    demographics?: Array<{ value: string; count: number }>;
    reached?: Array<{ value: string; count: number }>;
  };
  timeSeries?: Array<{
    date: string;
    reach?: number;
    profile_views?: number;
    follower_count?: number;
    website_clicks?: number;
    accounts_engaged?: number;
    total_interactions?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    profile_links_taps?: number;
  }>;
}

export interface InstagramMedia {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS' | 'STORIES';
  media_url?: string;
  permalink?: string;
  timestamp: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  insights?: {
    reach?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    replies?: number;
  };
}

interface GraphAPIResponse<T> {
  data?: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

interface InsightsAPIResponse {
  data?: Array<{
    name: string;
    period: string;
    values: Array<{
      value: number | string;
      end_time?: string;
      breakdown?: Array<{
        dimension_keys?: Record<string, string>;
        value: number;
      }>;
    }>;
  }>;
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

/**
 * Helper function to handle rate limits with exponential backoff retry
 * Returns the response if successful, throws error if all retries exhausted
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  delayMs = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Check for rate limit (HTTP 429)
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        const waitTime = retryAfter * 1000 || delayMs * Math.pow(2, attempt);
        
        if (attempt < maxRetries) {
          console.log(`[Instagram Service] Rate limit hit (HTTP 429), retrying after ${waitTime}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }

      // Check for rate limit in response body (error codes 4 or 17)
      if (response.ok) {
        const responseText = await response.text();
        try {
          const data = JSON.parse(responseText);
          if (data.error && (data.error.code === 4 || data.error.code === 17)) {
            const waitTime = delayMs * Math.pow(2, attempt);
            if (attempt < maxRetries) {
              console.log(`[Instagram Service] Rate limit error (code ${data.error.code}), retrying after ${waitTime}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          }
          // Return a new Response with the parsed data
          return new Response(responseText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch (e) {
          // Not JSON, return original response
          return new Response(responseText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }
      }

      return response;
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        const waitTime = delayMs * Math.pow(2, attempt);
        console.log(`[Instagram Service] Request failed, retrying after ${waitTime}ms (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error('Failed to fetch after retries');
}

/**
 * Helper function to make Graph API request with error handling
 */
async function makeGraphAPIRequest<T>(
  endpoint: string,
  params: URLSearchParams,
  accessToken: string
): Promise<T> {
  const url = `${FACEBOOK_API_BASE_URL}/${endpoint}?${params.toString()}`;
  
  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph API request failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json() as T;
  
  // Check for API-level errors
  if ((data as any).error) {
    const error = (data as any).error;
    throw new Error(`Graph API Error (${error.code}): ${error.message}`);
  }

  return data;
}

class InstagramService {
  /**
   * Get Page Access Token for Instagram Insights API
   * Instagram Insights requires Page Access Token, not User Access Token
   */
  public async getPageAccessToken(projectId: string, pageId: string): Promise<string> {
    // First get user access token
    const connection = await FacebookConnection.findOne({ projectId: new Types.ObjectId(projectId) });

    if (!connection) {
      throw new Error('Facebook connection not found for this project');
    }

    if (!connection.accessToken) {
      throw new Error('Access token not found in Facebook connection');
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expiresAt = connection.expiresAt || new Date(0);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    let userAccessToken = connection.accessToken;
    
    if (expiresAt < fiveMinutesFromNow) {
      // Token expired, refresh it
      const facebookAuthService = await import('./facebookAuthService');
      const { accessToken, expiresAt: newExpiresAt } = await facebookAuthService.default.refreshAccessToken(connection.refreshToken);
      
      connection.accessToken = accessToken;
      connection.expiresAt = newExpiresAt ?? undefined;
      await connection.save();

      userAccessToken = accessToken;
    }

    // Fetch Page Access Token from the specific page
    try {
      const pageUrl = `${FACEBOOK_API_BASE_URL}/${pageId}`;
      const params = new URLSearchParams({
        access_token: userAccessToken,
        fields: 'access_token',
      });

      const response = await fetch(`${pageUrl}?${params.toString()}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Instagram Service] Failed to fetch page access token, using user token: ${response.statusText}`);
        // Fallback to user token if page token fetch fails
        return userAccessToken;
      }

      const pageData = await response.json() as {
        access_token?: string;
        error?: {
          message: string;
          code: number;
        };
      };

      if (pageData.error) {
        console.warn(`[Instagram Service] Error fetching page access token: ${pageData.error.message}, using user token`);
        return userAccessToken;
      }

      if (pageData.access_token) {
        console.log('[Instagram Service] Using Page Access Token for Instagram Insights');
        return pageData.access_token;
      }

      // Fallback to user token
      return userAccessToken;
    } catch (error: any) {
      console.warn('[Instagram Service] Error fetching page access token, using user token:', error.message);
      return userAccessToken;
    }
  }

  /**
   * Get access token from Facebook connection (reuse long-lived token)
   * @deprecated Use getPageAccessToken for Instagram Insights API calls
   */
  public async getAccessToken(projectId: string): Promise<string> {
    const connection = await FacebookConnection.findOne({ projectId: new Types.ObjectId(projectId) });

    if (!connection) {
      throw new Error('Facebook connection not found for this project');
    }

    if (!connection.accessToken) {
      throw new Error('Access token not found in Facebook connection');
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expiresAt = connection.expiresAt || new Date(0);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt < fiveMinutesFromNow) {
      // Token expired, refresh it
      const facebookAuthService = await import('./facebookAuthService');
      const { accessToken, expiresAt: newExpiresAt } = await facebookAuthService.default.refreshAccessToken(connection.refreshToken);
      
      connection.accessToken = accessToken;
      connection.expiresAt = newExpiresAt ?? undefined;
      await connection.save();

      return accessToken;
    }

    return connection.accessToken;
  }

  /**
   * Get Instagram Business Accounts linked to user's Facebook Pages
   * Fetches ALL pages with pagination support
   */
  public async getInstagramAccounts(accessToken: string): Promise<InstagramBusinessAccount[]> {
    try {
      console.log('[Instagram Service] Fetching ALL Instagram Business Accounts with pagination...');
      
      const accounts: InstagramBusinessAccount[] = [];
      const seenIds = new Set<string>();
      let nextUrl: string | null = null;
      let hasMore = true;
      let pageCount = 0;

      while (hasMore) {
        pageCount++;
        
        if (!nextUrl) {
          // First page
          const params = new URLSearchParams({
            access_token: accessToken,
            fields: 'id,name,instagram_business_account{id,username}',
            limit: '100', // Maximum per request
          });
          nextUrl = `${FACEBOOK_API_BASE_URL}/me/accounts?${params.toString()}`;
        }

        const response = await fetchWithRetry(nextUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch accounts: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json() as GraphAPIResponse<{
          id: string;
          name: string;
          instagram_business_account?: {
            id: string;
            username: string;
          };
        }>;

        if (data.error) {
          throw new Error(`Graph API Error: ${data.error.message}`);
        }

        if (data.data) {
          for (const page of data.data) {
            // Skip duplicates
            if (seenIds.has(page.id)) {
              continue;
            }
            seenIds.add(page.id);

            if (page.instagram_business_account) {
              accounts.push({
                igUserId: page.instagram_business_account.id,
                igUsername: page.instagram_business_account.username,
                pageId: page.id,
                pageName: page.name,
              });
            }
          }
        }

        // Check for next page
        hasMore = !!data.paging?.next;
        nextUrl = data.paging?.next || null;

        // Small delay to avoid rate limits
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`[Instagram Service] Fetched ${pageCount} page(s), found ${accounts.length} Instagram Business Account(s)`);
      
      return accounts;
    } catch (error: any) {
      console.error('[Instagram Service] Error fetching Instagram accounts:', error.message);
      throw error;
    }
  }

  /**
   * Fetch ALL user-level insights for a date range using time-based pagination (28-day chunks)
   * Handles pagination automatically to fetch everything
   */
  public async fetchAllUserInsights(
    igUserId: string,
    accessToken: string,
    startDate: Date,
    endDate: Date
  ): Promise<InstagramInsights> {
    try {
      console.log(`[Instagram Service] Fetching ALL user insights for ${igUserId} from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

      const insights: InstagramInsights = {
        timeSeries: [],
      };

      // Metrics to fetch (using only valid Instagram Insights API metrics)
      const metrics = [
        'reach',
        'profile_views',
        'follower_count',
        'website_clicks',
        'accounts_engaged',
        'total_interactions',
        'likes',
        'comments',
        'shares',
        'saves',
        'profile_links_taps',
      ].join(',');

      // Calculate date range in days
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Fetch insights in 28-day chunks (Instagram API limit)
      const chunkSize = 28;
      const chunks: Array<{ since: Date; until: Date }> = [];

      for (let i = 0; i < daysDiff; i += chunkSize) {
        const since = new Date(startDate);
        since.setDate(since.getDate() + i);
        
        const until = new Date(since);
        until.setDate(until.getDate() + chunkSize - 1);
        if (until > endDate) {
          until.setTime(endDate.getTime());
        }

        chunks.push({ since, until });
      }

      console.log(`[Instagram Service] Fetching ${chunks.length} time chunks`);

      // Fetch insights for each chunk
      for (const chunk of chunks) {
        try {
          const params = new URLSearchParams({
            access_token: accessToken,
            metric: metrics,
            period: 'day', // Use day period for time-series data
            metric_type: 'total_value', // Required for these metrics
            since: Math.floor(chunk.since.getTime() / 1000).toString(),
            until: Math.floor(chunk.until.getTime() / 1000).toString(),
          });

          let nextUrl: string | null = null;
          let hasMore = true;

          while (hasMore) {
            const url = nextUrl || `${FACEBOOK_API_BASE_URL}/${igUserId}/insights?${params.toString()}`;
            
            const response = await fetchWithRetry(url, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.warn(`[Instagram Service] Failed to fetch insights chunk ${chunk.since.toISOString().split('T')[0]}: ${response.statusText}`);
              break;
            }

            const chunkData = await response.json() as InsightsAPIResponse;

            if (chunkData.error) {
              console.warn(`[Instagram Service] API error for chunk ${chunk.since.toISOString().split('T')[0]}: ${chunkData.error.message} (code: ${chunkData.error.code})`);
              // Continue to next chunk - we'll return empty time series with defaults
              break;
            }

            if (chunkData.data) {
              // Process metrics and aggregate into time series
              const metricsMap = new Map<string, Map<string, number>>();

              for (const metric of chunkData.data) {
                for (const value of metric.values) {
                  const date = value.end_time ? value.end_time.split('T')[0] : chunk.since.toISOString().split('T')[0];
                  
                  if (!metricsMap.has(date)) {
                    metricsMap.set(date, new Map());
                  }

                  const dateMetrics = metricsMap.get(date)!;
                  const numValue = typeof value.value === 'number' ? value.value : 0;
                  dateMetrics.set(metric.name, numValue);
                }
              }

              // Convert to time series array with default 0 values for missing metrics
              const allMetrics = ['reach', 'profile_views', 'follower_count', 'website_clicks', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'profile_links_taps'];
              
              for (const [date, dateMetrics] of metricsMap.entries()) {
                const existing = insights.timeSeries?.find(ts => ts.date === date);
                if (existing) {
                  // Merge metrics and ensure all metrics have values (default to 0)
                  for (const metricName of allMetrics) {
                    if (dateMetrics.has(metricName)) {
                      (existing as any)[metricName] = dateMetrics.get(metricName);
                    } else if ((existing as any)[metricName] === undefined) {
                      (existing as any)[metricName] = 0;
                    }
                  }
                } else {
                  // Create new entry with all metrics (default to 0 if missing)
                  const timeSeriesEntry: any = { date };
                  for (const metricName of allMetrics) {
                    timeSeriesEntry[metricName] = dateMetrics.get(metricName) || 0;
                  }
                  insights.timeSeries!.push(timeSeriesEntry);
                }
              }
            }

            // Check for pagination
            hasMore = !!chunkData.paging?.next;
            nextUrl = chunkData.paging?.next || null;
          }
        } catch (error: any) {
          console.warn(`[Instagram Service] Error fetching chunk ${chunk.since.toISOString().split('T')[0]}:`, error.message);
        }
      }

      // Sort time series by date and ensure all metrics have default 0 values
      if (insights.timeSeries) {
        insights.timeSeries.sort((a, b) => a.date.localeCompare(b.date));
        
        // Ensure all time series entries have all metrics with default 0 (using valid metrics only)
        const allMetrics = ['reach', 'profile_views', 'follower_count', 'website_clicks', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares', 'saves', 'profile_links_taps'];
        for (const entry of insights.timeSeries) {
          for (const metric of allMetrics) {
            if ((entry as any)[metric] === undefined) {
              (entry as any)[metric] = 0;
            }
          }
        }
      } else {
        // Initialize empty time series array if none exists
        insights.timeSeries = [];
      }

      // Fetch lifetime summary (single value, no pagination needed)
      try {
        const lifetimeParams = new URLSearchParams({
          access_token: accessToken,
          metric: metrics,
          period: 'lifetime',
          metric_type: 'total_value', // Required for these metrics
        });

        const lifetimeData = await makeGraphAPIRequest<InsightsAPIResponse>(
          `${igUserId}/insights`,
          lifetimeParams,
          accessToken
        );

        if (lifetimeData.data) {
          // Initialize all metrics with default 0 values (using valid metrics only)
          insights.lifetime = {
            reach: 0,
            profile_views: 0,
            follower_count: 0,
            website_clicks: 0,
            accounts_engaged: 0,
            total_interactions: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            profile_links_taps: 0,
          };
          
          // Update with actual values from API
          for (const metric of lifetimeData.data) {
            const value = metric.values?.[0]?.value;
            if (typeof value === 'number' && value !== undefined) {
              (insights.lifetime as any)[metric.name] = value;
            }
          }
        } else {
          // Ensure lifetime object exists even if no data (using valid metrics only)
          insights.lifetime = {
            reach: 0,
            profile_views: 0,
            follower_count: 0,
            website_clicks: 0,
            accounts_engaged: 0,
            total_interactions: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            profile_links_taps: 0,
          };
        }
      } catch (error: any) {
        console.warn('[Instagram Service] Failed to fetch lifetime insights:', error.message);
      }
      
      // ALWAYS ensure lifetime object exists with default 0 values (even on error) - using valid metrics only
      insights.lifetime = {
        reach: insights.lifetime?.reach ?? 0,
        profile_views: insights.lifetime?.profile_views ?? 0,
        follower_count: insights.lifetime?.follower_count ?? 0,
        website_clicks: insights.lifetime?.website_clicks ?? 0,
        accounts_engaged: insights.lifetime?.accounts_engaged ?? 0,
        total_interactions: insights.lifetime?.total_interactions ?? 0,
        likes: insights.lifetime?.likes ?? 0,
        comments: insights.lifetime?.comments ?? 0,
        shares: insights.lifetime?.shares ?? 0,
        saves: insights.lifetime?.saves ?? 0,
        profile_links_taps: insights.lifetime?.profile_links_taps ?? 0,
      };

      // Fetch audience insights using valid metrics
      // Valid audience metrics: follower_demographics, reached_audience_demographics, engaged_audience_demographics
      try {
        const audienceMetrics = [
          'follower_demographics', // Age, gender, location breakdown
          'reached_audience_demographics', // Demographics of reached audience
        ];

        insights.audience = {};

        for (const metric of audienceMetrics) {
          try {
            const audienceParams = new URLSearchParams({
              access_token: accessToken,
              metric: metric,
              period: 'lifetime',
              metric_type: 'total_value', // Required for demographics metrics
            });

            const audienceData = await makeGraphAPIRequest<InsightsAPIResponse>(
              `${igUserId}/insights`,
              audienceParams,
              accessToken
            );

            if (audienceData.data && audienceData.data.length > 0) {
              const metricData = audienceData.data[0];
              // Map follower_demographics to audience data structure
              const key = metric === 'follower_demographics' ? 'demographics' : metric.replace('_demographics', '');

              if (metricData.values && metricData.values.length > 0) {
                const breakdown = metricData.values[0].breakdown;
                if (breakdown) {
                  (insights.audience as any)[key] = breakdown.map((item: any) => ({
                    value: Object.values(item.dimension_keys || {})[0] || item.value || 'unknown',
                    count: item.value || 0,
                  }));
                } else {
                  (insights.audience as any)[key] = metricData.values.map((v: any) => ({
                    value: v.value || 'unknown',
                    count: 1,
                  }));
                }
              }
            }
          } catch (error: any) {
            console.warn(`[Instagram Service] Failed to fetch ${metric}:`, error.message);
          }
        }
      } catch (error: any) {
        console.warn('[Instagram Service] Failed to fetch audience insights:', error.message);
        // Ensure audience object exists even on error
        if (!insights.audience) {
          insights.audience = {};
        }
      }
      
      // Ensure audience always exists (fallback)
      if (!insights.audience) {
        insights.audience = {};
      }

      console.log(`[Instagram Service] Fetched ${insights.timeSeries?.length || 0} time series data points`);
      
      // Final guarantee: ensure all required fields exist with defaults
      if (!insights.timeSeries) {
        insights.timeSeries = [];
      }
      
      // Final guarantee: lifetime always has all metrics with defaults (using valid metrics only)
      insights.lifetime = {
        reach: insights.lifetime?.reach ?? 0,
        profile_views: insights.lifetime?.profile_views ?? 0,
        follower_count: insights.lifetime?.follower_count ?? 0,
        website_clicks: insights.lifetime?.website_clicks ?? 0,
        accounts_engaged: insights.lifetime?.accounts_engaged ?? 0,
        total_interactions: insights.lifetime?.total_interactions ?? 0,
        likes: insights.lifetime?.likes ?? 0,
        comments: insights.lifetime?.comments ?? 0,
        shares: insights.lifetime?.shares ?? 0,
        saves: insights.lifetime?.saves ?? 0,
        profile_links_taps: insights.lifetime?.profile_links_taps ?? 0,
      };
      
      return insights;
    } catch (error: any) {
      console.error('[Instagram Service] Error fetching all user insights:', error.message);
      throw error;
    }
  }

  /**
   * Fetch ALL media (posts/reels/stories) with cursor-based pagination
   * Returns all media objects with their individual insights
   */
  public async fetchAllMedia(
    igUserId: string,
    accessToken: string,
    limit: number | 'all' = 100
  ): Promise<InstagramMedia[]> {
    try {
      console.log(`[Instagram Service] Fetching media for ${igUserId} (limit: ${limit === 'all' ? 'all' : limit})`);

      const allMedia: InstagramMedia[] = new Array();
      const seenIds = new Set<string>();

      // Fetch media with pagination
      let nextUrl: string | null = null;
      let hasMore = true;
      let fetchedCount = 0;

      while (hasMore) {
        // Build initial URL or use next page URL
        if (!nextUrl) {
          const params = new URLSearchParams({
            access_token: accessToken,
            fields: 'id,media_type,media_url,permalink,timestamp,caption,like_count,comments_count',
            limit: '100', // Maximum per request
          });
          nextUrl = `${FACEBOOK_API_BASE_URL}/${igUserId}/media?${params.toString()}`;
        }

        const response = await fetchWithRetry(nextUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch media: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json() as GraphAPIResponse<InstagramMedia>;

        if (data.error) {
          throw new Error(`Graph API Error: ${data.error.message}`);
        }

        if (data.data) {
          for (const media of data.data) {
            // Skip duplicates
            if (seenIds.has(media.id)) {
              continue;
            }
            seenIds.add(media.id);

            // Fetch insights for this media item
            try {
              // Use valid media insights metrics
              const insightsParams = new URLSearchParams({
                access_token: accessToken,
                metric: 'reach,likes,comments,shares,saves,replies', // Valid media metrics
              });

              const insightsData = await makeGraphAPIRequest<InsightsAPIResponse>(
                `${media.id}/insights`,
                insightsParams,
                accessToken
              );

              if (insightsData.data) {
                media.insights = {};
                for (const metric of insightsData.data) {
                  const value = metric.values?.[0]?.value;
                  if (typeof value === 'number') {
                    (media.insights as any)[metric.name] = value;
                  }
                }
              }
            } catch (error: any) {
              console.warn(`[Instagram Service] Failed to fetch insights for media ${media.id}:`, error.message);
            }

            allMedia.push(media);
            fetchedCount++;

            // Check limit
            if (limit !== 'all' && fetchedCount >= limit) {
              hasMore = false;
              break;
            }
          }
        }

        // Check for next page
        hasMore = hasMore && !!data.paging?.next;
        nextUrl = data.paging?.next || null;

        // Small delay to avoid rate limits
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`[Instagram Service] Fetched ${allMedia.length} media items`);

      return allMedia;
    } catch (error: any) {
      console.error('[Instagram Service] Error fetching all media:', error.message);
      throw error;
    }
  }

  /**
   * Legacy method - Fetch basic insights (backward compatibility)
   * Use fetchAllUserInsights for date ranges
   * Also populates days_28 summary for backward compatibility
   */
  public async getInsights(
    igUserId: string,
    accessToken: string
  ): Promise<InstagramInsights> {
    // Default to last 28 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 28);

    const insights = await this.fetchAllUserInsights(igUserId, accessToken, startDate, endDate);

    // Calculate days_28 summary from time series (sum of last 28 days)
    if (insights.timeSeries && insights.timeSeries.length > 0) {
      const last28Days = insights.timeSeries.slice(-28);
      insights.days_28 = {
        reach: 0,
        profile_views: 0,
        follower_count: 0,
        website_clicks: 0,
        accounts_engaged: 0,
        total_interactions: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        profile_links_taps: 0,
      };

      for (const day of last28Days) {
        insights.days_28.reach = (insights.days_28.reach || 0) + (day.reach || 0);
        insights.days_28.profile_views = (insights.days_28.profile_views || 0) + (day.profile_views || 0);
        insights.days_28.follower_count = Math.max(insights.days_28.follower_count || 0, day.follower_count || 0); // Use max for follower_count
        insights.days_28.website_clicks = (insights.days_28.website_clicks || 0) + (day.website_clicks || 0);
        insights.days_28.accounts_engaged = (insights.days_28.accounts_engaged || 0) + (day.accounts_engaged || 0);
        insights.days_28.total_interactions = (insights.days_28.total_interactions || 0) + (day.total_interactions || 0);
        insights.days_28.likes = (insights.days_28.likes || 0) + (day.likes || 0);
        insights.days_28.comments = (insights.days_28.comments || 0) + (day.comments || 0);
        insights.days_28.shares = (insights.days_28.shares || 0) + (day.shares || 0);
        insights.days_28.saves = (insights.days_28.saves || 0) + (day.saves || 0);
        insights.days_28.profile_links_taps = (insights.days_28.profile_links_taps || 0) + (day.profile_links_taps || 0);
      }
    } else {
      // Ensure days_28 exists with default 0 values (using valid metrics only)
      insights.days_28 = {
        reach: 0,
        profile_views: 0,
        follower_count: 0,
        website_clicks: 0,
        accounts_engaged: 0,
        total_interactions: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        profile_links_taps: 0,
      };
    }

    return insights;
  }

  /**
   * Fetch ALL Instagram media insights aggregated from individual posts
   * Returns real numbers from media-level insights API matching DM Cockpit format
   */
  public async fetchAllInstagramMediaInsights(
    igUserId: string,
    accessToken: string,
    days: number = 90
  ): Promise<{
    success: boolean;
    lastUpdated: string;
    periodDays: number;
    totalPostsProcessed: number;
    insights: {
      totalImpressions: number;
      totalReach: number;
      totalEngagement: number;
      totalSaves: number;
      totalVideoViews: number;
      avgEngagementRate: number;
      topPosts: Array<{
        id: string;
        thumbnail_url?: string;
        caption?: string;
        permalink?: string;
        metrics: {
          impressions: number;
          reach: number;
          engagement: number;
          saved: number;
          video_views?: number;
        };
      }>;
    };
  }> {
    const API_BASE = 'https://graph.facebook.com/v20.0';
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

    // Aggregate totals
    let totalImpressions = 0;
    let totalReach = 0;
    let totalEngagement = 0;
    let totalSaves = 0;
    let totalVideoViews = 0;
    const allPosts: Array<{
      id: string;
      timestamp: number;
      thumbnail_url?: string;
      caption?: string;
      permalink?: string;
      metrics: {
        impressions: number;
        reach: number;
        engagement: number;
        saved: number;
        video_views?: number;
      };
    }> = [];

    // Fetch ALL media with cursor-based pagination
    let nextUrl: string | null = null;
    let hasMore = true;
    let fetchedCount = 0;

    while (hasMore) {
      if (!nextUrl) {
        const params = new URLSearchParams({
          access_token: accessToken,
          fields: 'id,media_type,timestamp,permalink,thumbnail_url,caption',
          limit: '100',
        });
        nextUrl = `${API_BASE}/${igUserId}/media?${params.toString()}`;
      }

      const response = await fetchWithRetry(nextUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch media: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as GraphAPIResponse<{
        id: string;
        caption?: string;
        media_type: string;
        thumbnail_url?: string;
        permalink?: string;
        timestamp: string;
      }>;

      if (data.error) {
        throw new Error(`Graph API Error: ${data.error.message}`);
      }

      if (data.data) {
        for (const media of data.data) {
          const timestamp = parseInt(media.timestamp || '0', 10);
          
          // Filter by date (only last N days)
          if (timestamp < cutoffTimestamp) {
            continue; // Skip old posts but continue pagination
          }

          // Fetch insights for this media item
          try {
            // Use only metrics that are guaranteed to be available for all media types
            // Based on Instagram API docs, these are the safest metrics:
            // - impressions, reach, likes, comments are available for all media types
            // - video_views is only available for VIDEO and REELS
            // - saved and shares may not be available for all media types, so we skip them
            const mediaType = media.media_type || 'IMAGE';
            const isVideo = mediaType === 'VIDEO' || mediaType === 'REELS';
            
            // Core metrics available for all media types
            const coreMetrics = 'impressions,reach,likes,comments';
            // Only add video_views for videos/reels
            const metrics = isVideo 
              ? `${coreMetrics},video_views`
              : coreMetrics;
            
            const insightsParams = new URLSearchParams({
              access_token: accessToken,
              metric: metrics,
              period: 'lifetime',
            });

            const insightsUrl = `${API_BASE}/${media.id}/insights?${insightsParams.toString()}`;
            const insightsResponse = await fetch(insightsUrl);

            if (!insightsResponse.ok) {
              try {
                const errorData = await insightsResponse.json() as { error?: { code?: number; message?: string } };
                // Skip if error 10 (permission) or other errors
                if (errorData?.error?.code === 10) {
                  continue;
                }
              } catch {
                // Skip if JSON parse fails
              }
              // Skip if no insights available
              continue;
            }

            const insightsData = await insightsResponse.json() as InsightsAPIResponse;

            if (insightsData.error) {
              // Skip if error 10 (permission) or other errors
              if (insightsData.error.code === 10) {
                continue;
              }
              continue;
            }

            // Extract metrics - skip if no data
            if (!insightsData.data || insightsData.data.length === 0) {
              continue;
            }

            let impressions = 0;
            let reach = 0;
            let likes = 0;
            let comments = 0;
            let shares = 0;
            let saved = 0;
            let videoViews = 0;

            for (const metric of insightsData.data) {
              const value = metric.values?.[0]?.value;
              if (typeof value === 'number') {
                if (metric.name === 'impressions') impressions = value;
                else if (metric.name === 'reach') reach = value;
                else if (metric.name === 'likes') likes = value;
                else if (metric.name === 'comments') comments = value;
                else if (metric.name === 'shares') shares = value;
                else if (metric.name === 'saved') saved = value;
                else if (metric.name === 'video_views') videoViews = value;
              }
            }

            // Calculate engagement as sum of likes, comments, shares
            const engagement = likes + comments + shares;

            // Only include posts with valid insights
            if (reach > 0 || impressions > 0) {
              // Aggregate totals
              totalImpressions += impressions;
              totalReach += reach;
              totalEngagement += engagement;
              totalSaves += saved;
              totalVideoViews += videoViews;

              // Store post data
              allPosts.push({
                id: media.id,
                timestamp,
                thumbnail_url: media.thumbnail_url,
                caption: media.caption || undefined,
                permalink: media.permalink,
                metrics: {
                  impressions,
                  reach,
                  engagement,
                  saved,
                  video_views: videoViews > 0 ? videoViews : undefined,
                },
              });

              fetchedCount++;
            }

            // Rate limit delay between individual media insights calls
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error: any) {
            // Skip media item if insights fetch fails
            continue;
          }
        }
      }

      // Check for next page
      if (hasMore) {
        hasMore = !!data.paging?.next;
        nextUrl = data.paging?.next || null;

        // Small delay to avoid rate limits
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    // Sort posts by reach descending and get top 10
    const topPosts = allPosts
      .sort((a, b) => b.metrics.reach - a.metrics.reach)
      .slice(0, 10)
      .map(post => ({
        id: post.id,
        thumbnail_url: post.thumbnail_url,
        caption: post.caption,
        permalink: post.permalink,
        metrics: post.metrics,
      }));

    // Calculate average engagement rate
    const avgEngagementRate = totalReach > 0 ? (totalEngagement / totalReach) * 100 : 0;

    console.log(`Aggregated ${fetchedCount} posts → total reach ${totalReach.toLocaleString()}`);

    return {
      success: true,
      lastUpdated: new Date().toISOString(),
      periodDays: days,
      totalPostsProcessed: fetchedCount,
      insights: {
        totalImpressions,
        totalReach,
        totalEngagement,
        totalSaves,
        totalVideoViews,
        avgEngagementRate: Math.round(avgEngagementRate * 100) / 100,
        topPosts,
      },
    };
  }
}

export default new InstagramService();
