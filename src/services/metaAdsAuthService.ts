import MetaAdsConnection, { IMetaAdsConnection } from '../models/MetaAdsConnection';
import { getMetaAdsAuthUrl, META_ADS_APP_ID, META_ADS_APP_SECRET, META_ADS_REDIRECT_URI, META_ADS_API_BASE_URL } from '../config/metaAds';
import { Types } from 'mongoose';

export interface MetaAdsAccount {
  account_id: string;
  id: string;
  name: string;
  currency: string;
  timezone_name?: string;
  account_status?: number;
}

export interface IMetaAdsAuthService {
  generateAuthUrl(state?: string): string;
  handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }>;
  saveConnection(projectId: string, refreshToken: string, accessToken: string, expiresAt: Date | null): Promise<IMetaAdsConnection>;
  getConnectionByProject(projectId: string): Promise<IMetaAdsConnection | null>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }>;
  getAdAccounts(accessToken: string): Promise<MetaAdsAccount[]>;
}

class MetaAdsAuthService implements IMetaAdsAuthService {
  public generateAuthUrl(state?: string): string {
    return getMetaAdsAuthUrl(state);
  }

  public async handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }> {
    try {
      // Exchange authorization code for short-lived access token
      const tokenUrl = `${META_ADS_API_BASE_URL}/oauth/access_token`;
      const params = new URLSearchParams({
        client_id: META_ADS_APP_ID,
        client_secret: META_ADS_APP_SECRET,
        redirect_uri: META_ADS_REDIRECT_URI,
        code,
      });

      const response = await fetch(`${tokenUrl}?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to exchange code for token: ${response.statusText} - ${errorText}`);
      }

      const tokenData = await response.json() as {
        access_token: string;
        token_type?: string;
        expires_in?: number;
      };

      if (!tokenData.access_token) {
        throw new Error('Failed to obtain access token');
      }

      // Exchange short-lived token for long-lived token (60 days)
      const longLivedToken = await this.exchangeForLongLivedToken(tokenData.access_token);

      // Facebook tokens typically expire in 60 days for long-lived tokens
      const expiresIn = 5184000; // 60 days in seconds
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      // Use long-lived token as refresh token
      const refreshToken = longLivedToken;

      return {
        accessToken: longLivedToken,
        refreshToken,
        expiresAt,
      };
    } catch (error: any) {
      console.error('[Meta Ads Auth Service] Error handling callback:', error);
      throw error;
    }
  }

  private async exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
    try {
      const exchangeUrl = `${META_ADS_API_BASE_URL}/oauth/access_token`;
      const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: META_ADS_APP_ID,
        client_secret: META_ADS_APP_SECRET,
        fb_exchange_token: shortLivedToken,
      });

      const response = await fetch(`${exchangeUrl}?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to exchange for long-lived token: ${response.statusText} - ${errorText}`);
      }

      const tokenData = await response.json() as {
        access_token: string;
        token_type?: string;
        expires_in?: number;
      };

      if (!tokenData.access_token) {
        throw new Error('Failed to obtain long-lived access token');
      }

      return tokenData.access_token;
    } catch (error: any) {
      console.error('[Meta Ads Auth Service] Error exchanging for long-lived token:', error);
      throw error;
    }
  }

  public async saveConnection(
    projectId: string,
    refreshToken: string,
    accessToken: string,
    expiresAt: Date | null
  ): Promise<IMetaAdsConnection> {
    try {
      console.log(`[Meta Ads Auth Service] Saving connection for project: ${projectId}`);
      console.log(`[Meta Ads Auth Service] Has refresh token: ${!!refreshToken}, Has access token: ${!!accessToken}`);
      
      // Validate projectId format
      if (!Types.ObjectId.isValid(projectId)) {
        throw new Error(`Invalid project ID format: ${projectId}`);
      }

      const projectObjectId = new Types.ObjectId(projectId);
      
      // Remove existing connection if it exists
      const deleteResult = await MetaAdsConnection.deleteMany({ projectId: projectObjectId });
      console.log(`[Meta Ads Auth Service] Deleted ${deleteResult.deletedCount} existing connection(s)`);

      // Create new connection
      const connection = await MetaAdsConnection.create({
        projectId: projectObjectId,
        refreshToken,
        accessToken,
        expiresAt,
      });

      console.log(`[Meta Ads Auth Service] Connection created successfully - ID: ${connection._id}`);
      
      return connection;
    } catch (error: any) {
      console.error(`[Meta Ads Auth Service] Error saving connection:`, error);
      throw error;
    }
  }

  public async getConnectionByProject(projectId: string): Promise<IMetaAdsConnection | null> {
    return await MetaAdsConnection.findOne({ projectId: new Types.ObjectId(projectId) });
  }

  public async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    try {
      // Exchange long-lived token for new long-lived token (refresh)
      const exchangeUrl = `${META_ADS_API_BASE_URL}/oauth/access_token`;
      const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: META_ADS_APP_ID,
        client_secret: META_ADS_APP_SECRET,
        fb_exchange_token: refreshToken,
      });

      const response = await fetch(`${exchangeUrl}?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh access token: ${response.statusText} - ${errorText}`);
      }

      const tokenData = await response.json() as {
        access_token: string;
        token_type?: string;
        expires_in?: number;
      };

      if (!tokenData.access_token) {
        throw new Error('Failed to refresh access token');
      }

      const expiresIn = tokenData.expires_in || 5184000; // Default to 60 days
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return {
        accessToken: tokenData.access_token,
        expiresAt,
      };
    } catch (error: any) {
      console.error('[Meta Ads Auth Service] Error refreshing token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  public async getAdAccounts(accessToken: string): Promise<MetaAdsAccount[]> {
    try {
      console.log('[Meta Ads Auth Service] Fetching ALL ad accounts with pagination...');
      
      const accounts: MetaAdsAccount[] = [];
      const seenIds = new Set<string>();
      let nextUrl: string | null = null;
      let hasMore = true;
      let pageCount = 0;

      while (hasMore) {
        pageCount++;
        
        if (!nextUrl) {
          // First page - Get user's ad accounts from /me/adaccounts
          const accountsUrl = `${META_ADS_API_BASE_URL}/me/adaccounts`;
          const params = new URLSearchParams({
            access_token: accessToken,
            fields: 'account_id,id,name,currency,timezone_name,account_status',
            limit: '100', // Maximum per request (Meta Ads API supports up to 100)
          });
          nextUrl = `${accountsUrl}?${params.toString()}`;
        }

        const response = await fetch(nextUrl, {
          method: 'GET',
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Meta Ads Auth Service] Failed to fetch ad accounts:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            page: pageCount,
          });
          throw new Error(`Failed to fetch Meta Ads accounts: ${response.statusText}`);
        }

        const data = await response.json() as {
          data?: MetaAdsAccount[];
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
          };
        };

        if (data.error) {
          throw new Error(`Meta Ads API Error: ${data.error.message}`);
        }

        if (data.data) {
          for (const account of data.data) {
            // Skip duplicates by account_id
            if (seenIds.has(account.account_id)) {
              continue;
            }
            seenIds.add(account.account_id);
            accounts.push(account);
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

      console.log(`[Meta Ads Auth Service] Fetched ${pageCount} page(s), found ${accounts.length} ad account(s)`);
      
      return accounts;
    } catch (error: any) {
      console.error('[Meta Ads Auth Service] Error fetching ad accounts:', error.message);
      throw error;
    }
  }
}

export default new MetaAdsAuthService();

