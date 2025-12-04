import { google } from 'googleapis';
import GoogleSearchConsoleConnection, { IGoogleSearchConsoleConnection } from '../models/GoogleSearchConsoleConnection';
import { googleSearchConsoleOauth2Client, getGoogleSearchConsoleAuthUrl } from '../config/googleSearchConsole';
import { Types } from 'mongoose';

export interface GoogleSearchConsoleSite {
  siteUrl: string;
  permissionLevel: string;
}

export interface IGoogleSearchConsoleAuthService {
  generateAuthUrl(state?: string): string;
  handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }>;
  saveConnection(projectId: string, refreshToken: string, accessToken: string, expiresAt: Date | null): Promise<IGoogleSearchConsoleConnection>;
  getConnectionByProject(projectId: string): Promise<IGoogleSearchConsoleConnection | null>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }>;
  getSearchConsoleSites(accessToken: string): Promise<GoogleSearchConsoleSite[]>;
}

class GoogleSearchConsoleAuthService implements IGoogleSearchConsoleAuthService {
  public generateAuthUrl(state?: string): string {
    return getGoogleSearchConsoleAuthUrl(state);
  }

  public async handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }> {
    const { tokens } = await googleSearchConsoleOauth2Client.getToken(code);
    const { access_token, refresh_token, expiry_date } = tokens;

    if (!access_token) {
      throw new Error('Failed to obtain access token');
    }

    const expiresAt = expiry_date ? new Date(expiry_date) : null;

    return {
      accessToken: access_token,
      refreshToken: refresh_token || '',
      expiresAt,
    };
  }

  public async saveConnection(
    projectId: string,
    refreshToken: string,
    accessToken: string,
    expiresAt: Date | null
  ): Promise<IGoogleSearchConsoleConnection> {
    try {
      console.log(`[Google Search Console Auth Service] Saving connection for project: ${projectId}`);
      console.log(`[Google Search Console Auth Service] Has refresh token: ${!!refreshToken}, Has access token: ${!!accessToken}`);
      
      // Validate projectId format
      if (!Types.ObjectId.isValid(projectId)) {
        throw new Error(`Invalid project ID format: ${projectId}`);
      }

      const projectObjectId = new Types.ObjectId(projectId);
      
      // Remove existing connection if it exists
      const deleteResult = await GoogleSearchConsoleConnection.deleteMany({ projectId: projectObjectId });
      console.log(`[Google Search Console Auth Service] Deleted ${deleteResult.deletedCount} existing connection(s)`);

      // Create new connection
      const connection = await GoogleSearchConsoleConnection.create({
        projectId: projectObjectId,
        refreshToken,
        accessToken,
        expiresAt,
      });

      console.log(`[Google Search Console Auth Service] Connection created successfully - ID: ${connection._id}`);
      
      return connection;
    } catch (error: any) {
      console.error(`[Google Search Console Auth Service] Error saving connection:`, error);
      console.error(`[Google Search Console Auth Service] Error details:`, {
        projectId,
        hasRefreshToken: !!refreshToken,
        hasAccessToken: !!accessToken,
        errorMessage: error.message,
        errorName: error.name,
      });
      throw error;
    }
  }

  public async getConnectionByProject(projectId: string): Promise<IGoogleSearchConsoleConnection | null> {
    return await GoogleSearchConsoleConnection.findOne({ projectId: new Types.ObjectId(projectId) });
  }

  public async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    googleSearchConsoleOauth2Client.setCredentials({ refresh_token: refreshToken });
    
    try {
      const { credentials } = await googleSearchConsoleOauth2Client.refreshAccessToken();
      const { access_token, expiry_date } = credentials;

      if (!access_token) {
        throw new Error('Failed to refresh access token');
      }

      const expiresAt = expiry_date ? new Date(expiry_date) : null;

      return {
        accessToken: access_token,
        expiresAt,
      };
    } catch (error) {
      throw new Error('Failed to refresh access token');
    }
  }

  public async getSearchConsoleSites(accessToken: string): Promise<GoogleSearchConsoleSite[]> {
    try {
      googleSearchConsoleOauth2Client.setCredentials({ access_token: accessToken });
      const searchConsole = google.webmasters('v3');
      
      // Fetch sites from Google Search Console
      const response = await searchConsole.sites.list({
        auth: googleSearchConsoleOauth2Client,
      });

      if (!response.data.siteEntry) {
        return [];
      }

      return response.data.siteEntry.map((site: any) => ({
        siteUrl: site.siteUrl || '',
        permissionLevel: site.permissionLevel || 'UNKNOWN',
      }));
    } catch (error: any) {
      // Don't throw error - allow manual entry instead
      console.warn('[Google Search Console Auth Service] Could not fetch sites automatically:', error.message);
      console.log('[Google Search Console Auth Service] Manual site URL entry is available');
      return [];
    }
  }
}

export default new GoogleSearchConsoleAuthService();


