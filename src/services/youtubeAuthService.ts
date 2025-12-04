import { google } from 'googleapis';
import YouTubeConnection, { IYouTubeConnection } from '../models/YouTubeConnection';
import { youtubeOauth2Client, getYouTubeAuthUrl } from '../config/youtube';
import { Types } from 'mongoose';

export interface YouTubeChannel {
  channelId: string;
  title: string;
  description: string;
  customUrl?: string;
  subscriberCount: string;
  viewCount: string;
  videoCount: string;
}

export interface IYouTubeAuthService {
  generateAuthUrl(state?: string): string;
  handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }>;
  saveConnection(projectId: string, refreshToken: string, accessToken: string, expiresAt: Date | null): Promise<IYouTubeConnection>;
  getConnectionByProject(projectId: string): Promise<IYouTubeConnection | null>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }>;
  getYouTubeChannels(accessToken: string): Promise<YouTubeChannel[]>;
}

class YouTubeAuthService implements IYouTubeAuthService {
  public generateAuthUrl(state?: string): string {
    return getYouTubeAuthUrl(state);
  }

  public async handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }> {
    const { tokens } = await youtubeOauth2Client.getToken(code);
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
  ): Promise<IYouTubeConnection> {
    try {
      console.log(`[YouTube Auth Service] Saving connection for project: ${projectId}`);
      console.log(`[YouTube Auth Service] Has refresh token: ${!!refreshToken}, Has access token: ${!!accessToken}`);
      
      // Validate projectId format
      if (!Types.ObjectId.isValid(projectId)) {
        throw new Error(`Invalid project ID format: ${projectId}`);
      }

      const projectObjectId = new Types.ObjectId(projectId);
      
      // Remove existing connection if it exists
      const deleteResult = await YouTubeConnection.deleteMany({ projectId: projectObjectId });
      console.log(`[YouTube Auth Service] Deleted ${deleteResult.deletedCount} existing connection(s)`);

      // Create new connection
      const connection = await YouTubeConnection.create({
        projectId: projectObjectId,
        refreshToken,
        accessToken,
        expiresAt,
      });

      console.log(`[YouTube Auth Service] Connection created successfully - ID: ${connection._id}`);
      
      return connection;
    } catch (error: any) {
      console.error(`[YouTube Auth Service] Error saving connection:`, error);
      console.error(`[YouTube Auth Service] Error details:`, {
        projectId,
        hasRefreshToken: !!refreshToken,
        hasAccessToken: !!accessToken,
        errorMessage: error.message,
        errorName: error.name,
      });
      throw error;
    }
  }

  public async getConnectionByProject(projectId: string): Promise<IYouTubeConnection | null> {
    return await YouTubeConnection.findOne({ projectId: new Types.ObjectId(projectId) });
  }

  public async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    youtubeOauth2Client.setCredentials({ refresh_token: refreshToken });
    
    try {
      const { credentials } = await youtubeOauth2Client.refreshAccessToken();
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

  public async getYouTubeChannels(accessToken: string): Promise<YouTubeChannel[]> {
    try {
      console.log('[YouTube Auth Service] Fetching user channels...');
      
      const youtube = google.youtube('v3');
      
      // Set the credentials for this request
      youtubeOauth2Client.setCredentials({ access_token: accessToken });
      
      const response = await youtube.channels.list({
        auth: youtubeOauth2Client,
        part: ['snippet', 'statistics', 'contentDetails'],
        mine: true,
      });

      const channels: YouTubeChannel[] = [];

      if (response.data.items) {
        for (const item of response.data.items) {
          channels.push({
            channelId: item.id || '',
            title: item.snippet?.title || '',
            description: item.snippet?.description || '',
            customUrl: item.snippet?.customUrl || undefined,
            subscriberCount: item.statistics?.subscriberCount || '0',
            viewCount: item.statistics?.viewCount || '0',
            videoCount: item.statistics?.videoCount || '0',
          });
        }
      }

      console.log(`[YouTube Auth Service] Found ${channels.length} channel(s)`);
      return channels;
    } catch (error: any) {
      console.error('[YouTube Auth Service] Error fetching channels:', error.message);
      console.log('[YouTube Auth Service] Manual channel ID entry is available');
      return [];
    }
  }
}

export default new YouTubeAuthService();

