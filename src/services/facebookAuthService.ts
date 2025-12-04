import FacebookConnection, { IFacebookConnection } from '../models/FacebookConnection';
import { getFacebookAuthUrl, FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_REDIRECT_URI, FACEBOOK_API_BASE_URL } from '../config/facebook';
import { Types } from 'mongoose';

export interface FacebookPage {
  id: string;
  name: string;
  category: string;
  access_token?: string;
}

export interface IFacebookAuthService {
  generateAuthUrl(state?: string): string;
  handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }>;
  saveConnection(projectId: string, refreshToken: string, accessToken: string, expiresAt: Date | null): Promise<IFacebookConnection>;
  getConnectionByProject(projectId: string): Promise<IFacebookConnection | null>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }>;
  getFacebookPages(accessToken: string): Promise<FacebookPage[]>;
}

class FacebookAuthService implements IFacebookAuthService {
  public generateAuthUrl(state?: string): string {
    return getFacebookAuthUrl(state);
  }

  public async handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }> {
    try {
      // Exchange authorization code for access token
      const tokenUrl = `${FACEBOOK_API_BASE_URL}/oauth/access_token`;
      const params = new URLSearchParams({
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri: FACEBOOK_REDIRECT_URI,
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

      // Facebook tokens typically expire in 1-2 hours (expires_in is in seconds)
      const expiresIn = tokenData.expires_in || 3600; // Default to 1 hour
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      // For Facebook, we use the access token as refresh token initially
      // Long-lived tokens can be obtained by exchanging short-lived tokens
      const refreshToken = tokenData.access_token;

      return {
        accessToken: tokenData.access_token,
        refreshToken,
        expiresAt,
      };
    } catch (error: any) {
      console.error('[Facebook Auth Service] Error handling callback:', error);
      throw error;
    }
  }

  public async saveConnection(
    projectId: string,
    refreshToken: string,
    accessToken: string,
    expiresAt: Date | null
  ): Promise<IFacebookConnection> {
    try {
      console.log(`[Facebook Auth Service] Saving connection for project: ${projectId}`);
      console.log(`[Facebook Auth Service] Has refresh token: ${!!refreshToken}, Has access token: ${!!accessToken}`);
      
      // Validate projectId format
      if (!Types.ObjectId.isValid(projectId)) {
        throw new Error(`Invalid project ID format: ${projectId}`);
      }

      const projectObjectId = new Types.ObjectId(projectId);
      
      // Remove existing connection if it exists
      const deleteResult = await FacebookConnection.deleteMany({ projectId: projectObjectId });
      console.log(`[Facebook Auth Service] Deleted ${deleteResult.deletedCount} existing connection(s)`);

      // Create new connection
      const connection = await FacebookConnection.create({
        projectId: projectObjectId,
        refreshToken,
        accessToken,
        expiresAt,
      });

      console.log(`[Facebook Auth Service] Connection created successfully - ID: ${connection._id}`);
      
      return connection;
    } catch (error: any) {
      console.error(`[Facebook Auth Service] Error saving connection:`, error);
      throw error;
    }
  }

  public async getConnectionByProject(projectId: string): Promise<IFacebookConnection | null> {
    return await FacebookConnection.findOne({ projectId: new Types.ObjectId(projectId) });
  }

  public async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    try {
      // Exchange short-lived token for long-lived token
      // Facebook long-lived tokens last 60 days
      const exchangeUrl = `${FACEBOOK_API_BASE_URL}/oauth/access_token`;
      const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
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
      console.error('[Facebook Auth Service] Error refreshing token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  public async getFacebookPages(accessToken: string): Promise<FacebookPage[]> {
    try {
      console.log('[Facebook Auth Service] Fetching Facebook pages with pagination...');
      
      const allPages: FacebookPage[] = [];
      let nextUrl: string | null = `${FACEBOOK_API_BASE_URL}/me/accounts`;
      const baseParams = new URLSearchParams({
        access_token: accessToken,
        fields: 'id,name,category,access_token',
        limit: '100', // Request maximum allowed per page
      });

      // Paginate through all results
      while (nextUrl) {
        const url = nextUrl.includes('?') ? nextUrl : `${nextUrl}?${baseParams.toString()}`;
        
        const response = await fetch(url, {
          method: 'GET',
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Facebook Auth Service] Failed to fetch pages:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
          });
          throw new Error(`Failed to fetch Facebook pages: ${response.statusText}`);
        }

        const data = await response.json() as {
          data?: FacebookPage[];
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
          throw new Error(`Facebook API Error: ${data.error.message}`);
        }

        const pages = data.data || [];
        allPages.push(...pages);
        console.log(`[Facebook Auth Service] Fetched ${pages.length} page(s), total so far: ${allPages.length}`);
        
        // Check if there's a next page
        nextUrl = data.paging?.next || null;
      }

      console.log(`[Facebook Auth Service] Found ${allPages.length} total page(s)`);
      
      return allPages;
    } catch (error: any) {
      console.error('[Facebook Auth Service] Error fetching pages:', error.message);
      // Don't throw error - allow manual entry instead
      return [];
    }
  }
}

export default new FacebookAuthService();

