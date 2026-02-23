import { google } from 'googleapis';
import youtubeAuthService from './youtubeAuthService';
import { youtubeOauth2Client } from '../config/youtube';

interface DateRange {
  startDate: string;
  endDate: string;
}

interface IYouTubeDataService {
  getAccessToken(projectId: string): Promise<string>;
  getOverviewMetrics(channelId: string, accessToken: string, dateRange: DateRange): Promise<any>;
  getTopVideos(channelId: string, accessToken: string, dateRange: DateRange): Promise<any[]>;
  getTrafficSources(channelId: string, accessToken: string, dateRange: DateRange): Promise<any[]>;
  getDeviceTypes(channelId: string, accessToken: string, dateRange: DateRange): Promise<any[]>;
  getGeography(channelId: string, accessToken: string, dateRange: DateRange): Promise<any[]>;
}

const n = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

class YouTubeDataService implements IYouTubeDataService {
  public async getAccessToken(projectId: string): Promise<string> {
    const connection = await youtubeAuthService.getConnectionByProject(projectId);
    if (!connection) {
      throw new Error('YouTube connection not found for this project');
    }

    const now = Date.now();
    const expiryBufferMs = 5 * 60 * 1000;
    const expiresAtMs = connection.expiresAt ? new Date(connection.expiresAt).getTime() : 0;

    if (connection.accessToken && expiresAtMs - now > expiryBufferMs) {
      return connection.accessToken;
    }

    if (connection.refreshToken) {
      const { accessToken, expiresAt } = await youtubeAuthService.refreshAccessToken(connection.refreshToken);
      connection.accessToken = accessToken;
      connection.expiresAt = expiresAt || undefined;
      await connection.save();
      return accessToken;
    }

    throw new Error('Unable to obtain valid YouTube access token');
  }

  public async getOverviewMetrics(channelId: string, accessToken: string, dateRange: DateRange): Promise<any> {
    try {
      youtubeOauth2Client.setCredentials({ access_token: accessToken });
      const youtubeAnalytics = google.youtubeAnalytics('v2');

      const response = await youtubeAnalytics.reports.query({
        auth: youtubeOauth2Client,
        ids: `channel==${channelId}`,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        metrics: 'views,estimatedMinutesWatched,subscribersGained,likes,comments,shares',
      });

      const row = response.data.rows?.[0] || [];

      return {
        views: n(row[0]),
        estimatedMinutesWatched: n(row[1]),
        subscribersGained: n(row[2]),
        likes: n(row[3]),
        comments: n(row[4]),
        shares: n(row[5]),
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch YouTube overview metrics: ${error.message}`);
    }
  }

  public async getTopVideos(channelId: string, accessToken: string, dateRange: DateRange): Promise<any[]> {
    try {
      youtubeOauth2Client.setCredentials({ access_token: accessToken });
      const youtubeAnalytics = google.youtubeAnalytics('v2');
      const youtube = google.youtube('v3');

      const analyticsResponse = await youtubeAnalytics.reports.query({
        auth: youtubeOauth2Client,
        ids: `channel==${channelId}`,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        metrics: 'views,estimatedMinutesWatched,likes,comments,shares',
        dimensions: 'video',
        sort: '-views',
        maxResults: 20,
      });

      const rows = analyticsResponse.data.rows || [];
      if (rows.length === 0) {
        return [];
      }

      const ids = rows.map((r: any) => String(r[0]));
      const detailResponse = await youtube.videos.list({
        auth: youtubeOauth2Client,
        part: ['snippet', 'statistics'],
        id: ids,
      });

      const details = new Map<string, any>(
        (detailResponse.data.items || []).map((item: any) => [String(item.id), item])
      );

      return rows.map((row: any) => {
        const videoId = String(row[0]);
        const detail = details.get(videoId);
        return {
          videoId,
          title: detail?.snippet?.title || 'Unknown Video',
          publishedAt: detail?.snippet?.publishedAt || null,
          thumbnail:
            detail?.snippet?.thumbnails?.high?.url ||
            detail?.snippet?.thumbnails?.medium?.url ||
            detail?.snippet?.thumbnails?.default?.url ||
            null,
          views: n(row[1]),
          estimatedMinutesWatched: n(row[2]),
          likes: n(row[3]),
          comments: n(row[4]),
          shares: n(row[5]),
        };
      });
    } catch (error: any) {
      throw new Error(`Failed to fetch YouTube top videos: ${error.message}`);
    }
  }

  public async getTrafficSources(channelId: string, accessToken: string, dateRange: DateRange): Promise<any[]> {
    try {
      youtubeOauth2Client.setCredentials({ access_token: accessToken });
      const youtubeAnalytics = google.youtubeAnalytics('v2');

      const response = await youtubeAnalytics.reports.query({
        auth: youtubeOauth2Client,
        ids: `channel==${channelId}`,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        metrics: 'views,estimatedMinutesWatched',
        dimensions: 'insightTrafficSourceType',
        sort: '-views',
        maxResults: 20,
      });

      return (response.data.rows || []).map((row: any) => ({
        source: String(row[0] || 'UNKNOWN'),
        views: n(row[1]),
        estimatedMinutesWatched: n(row[2]),
      }));
    } catch (error: any) {
      throw new Error(`Failed to fetch YouTube traffic sources: ${error.message}`);
    }
  }

  public async getDeviceTypes(channelId: string, accessToken: string, dateRange: DateRange): Promise<any[]> {
    try {
      youtubeOauth2Client.setCredentials({ access_token: accessToken });
      const youtubeAnalytics = google.youtubeAnalytics('v2');

      const response = await youtubeAnalytics.reports.query({
        auth: youtubeOauth2Client,
        ids: `channel==${channelId}`,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        metrics: 'views,estimatedMinutesWatched',
        dimensions: 'deviceType',
        sort: '-views',
        maxResults: 20,
      });

      return (response.data.rows || []).map((row: any) => ({
        deviceType: String(row[0] || 'UNKNOWN'),
        views: n(row[1]),
        estimatedMinutesWatched: n(row[2]),
      }));
    } catch (error: any) {
      throw new Error(`Failed to fetch YouTube device types: ${error.message}`);
    }
  }

  public async getGeography(channelId: string, accessToken: string, dateRange: DateRange): Promise<any[]> {
    try {
      youtubeOauth2Client.setCredentials({ access_token: accessToken });
      const youtubeAnalytics = google.youtubeAnalytics('v2');

      const response = await youtubeAnalytics.reports.query({
        auth: youtubeOauth2Client,
        ids: `channel==${channelId}`,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        metrics: 'views,estimatedMinutesWatched',
        dimensions: 'country',
        sort: '-views',
        maxResults: 50,
      });

      return (response.data.rows || []).map((row: any) => ({
        country: String(row[0] || 'UNKNOWN'),
        views: n(row[1]),
        estimatedMinutesWatched: n(row[2]),
      }));
    } catch (error: any) {
      throw new Error(`Failed to fetch YouTube geography data: ${error.message}`);
    }
  }
}

export default new YouTubeDataService();

