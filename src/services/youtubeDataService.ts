import { google } from 'googleapis';
import youtubeAuthService from './youtubeAuthService';
import { youtubeOauth2Client } from '../config/youtube';

export interface YouTubeOverviewMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
  currentSubscribers: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
}

export interface YouTubeVideoData {
  videoId: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  subscribersGained: number;
}

export interface YouTubeTrafficSource {
  trafficSource: string;
  views: number;
  estimatedMinutesWatched: number;
}

export interface YouTubeDeviceType {
  deviceType: string;
  views: number;
  estimatedMinutesWatched: number;
}

export interface YouTubeGeography {
  country: string;
  views: number;
  estimatedMinutesWatched: number;
}

export interface YouTubeDemographics {
  ageGroup: string;
  gender: string;
  viewsPercentage: number;
}

export interface IYouTubeDataService {
  getAccessToken(projectId: string): Promise<string>;
  getOverviewMetrics(
    channelId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<YouTubeOverviewMetrics>;
  getTopVideos(
    channelId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<YouTubeVideoData[]>;
  getTrafficSources(
    channelId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<YouTubeTrafficSource[]>;
  getDeviceTypes(
    channelId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<YouTubeDeviceType[]>;
  getGeography(
    channelId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<YouTubeGeography[]>;
}

class YouTubeDataService implements IYouTubeDataService {
  public async getAccessToken(projectId: string): Promise<string> {
    const connection = await youtubeAuthService.getConnectionByProject(projectId);

    if (!connection) {
      throw new Error('YouTube connection not found for this project');
    }

    // Check if access token is still valid
    if (connection.accessToken && connection.expiresAt && connection.expiresAt > new Date()) {
      return connection.accessToken;
    }

    // Refresh access token
    const { accessToken, expiresAt } = await youtubeAuthService.refreshAccessToken(connection.refreshToken);

    // Update connection with new access token
    connection.accessToken = accessToken;
    connection.expiresAt = expiresAt || undefined;
    await connection.save();

    return accessToken;
  }

  public async getOverviewMetrics(
    channelId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<YouTubeOverviewMetrics> {
    try {
      console.log('[YouTube Data Service] Fetching overview metrics for channel:', channelId);
      console.log('[YouTube Data Service] Date range:', dateRange.startDate, 'to', dateRange.endDate);

      youtubeOauth2Client.setCredentials({ access_token: accessToken });
      const youtubeAnalytics = google.youtubeAnalytics('v2');
      const youtube = google.youtube('v3');

      // Fetch current subscriber count from YouTube Data API
      let currentSubscribers = 0;
      try {
        const channelResponse = await youtube.channels.list({
          auth: youtubeOauth2Client,
          part: ['statistics'],
          id: [channelId],
        });
        currentSubscribers = Number(channelResponse.data.items?.[0]?.statistics?.subscriberCount) || 0;
      } catch (err) {
        console.warn('[YouTube Data Service] Could not fetch current subscriber count', err);
      }

      const response = await youtubeAnalytics.reports.query({
        auth: youtubeOauth2Client,
        ids: `channel==${channelId}`,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        metrics: 'views,likes,comments,shares,subscribersGained,subscribersLost,estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
        dimensions: '',
      });

      const rows = response.data.rows || [];

      if (rows.length === 0) {
        return {
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          subscribersGained: 0,
          subscribersLost: 0,
          currentSubscribers,
          estimatedMinutesWatched: 0,
          averageViewDuration: 0,
          averageViewPercentage: 0,
        };
      }

      const row = rows[0] as number[];

      return {
        views: row[0] || 0,
        likes: row[1] || 0,
        comments: row[2] || 0,
        shares: row[3] || 0,
        subscribersGained: row[4] || 0,
        subscribersLost: row[5] || 0,
        currentSubscribers,
        estimatedMinutesWatched: row[6] || 0,
        averageViewDuration: row[7] || 0,
        averageViewPercentage: row[8] || 0,
      };
    } catch (error: any) {
      console.error('[YouTube Data Service] Error fetching overview metrics:', error);
      throw new Error(`Failed to fetch YouTube overview metrics: ${error.message}`);
    }
  }

  public async getTopVideos(
    channelId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<YouTubeVideoData[]> {
    try {
      console.log('[YouTube Data Service] Fetching top videos for channel:', channelId);

      youtubeOauth2Client.setCredentials({ access_token: accessToken });
      const youtubeAnalytics = google.youtubeAnalytics('v2');
      const youtube = google.youtube('v3');

      const response = await youtubeAnalytics.reports.query({
        auth: youtubeOauth2Client,
        ids: `channel==${channelId}`,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        metrics: 'views,likes,comments,shares,estimatedMinutesWatched,averageViewDuration,subscribersGained',
        dimensions: 'video',
        sort: '-views',
        maxResults: 10,
      });

      const rows = response.data.rows || [];
      const videos: YouTubeVideoData[] = [];

      // Fetch video details for each video
      for (const row of rows) {
        const videoId = String(row[0]);

        try {
          const videoDetails = await youtube.videos.list({
            auth: youtubeOauth2Client,
            part: ['snippet'],
            id: [videoId],
          });

          const title = videoDetails.data.items?.[0]?.snippet?.title || 'Unknown Title';

          videos.push({
            videoId,
            title,
            views: Number(row[1]) || 0,
            likes: Number(row[2]) || 0,
            comments: Number(row[3]) || 0,
            shares: Number(row[4]) || 0,
            estimatedMinutesWatched: Number(row[5]) || 0,
            averageViewDuration: Number(row[6]) || 0,
            subscribersGained: Number(row[7]) || 0,
          });
        } catch (err) {
          console.warn(`[YouTube Data Service] Could not fetch details for video ${videoId}`);
        }
      }

      return videos;
    } catch (error: any) {
      console.error('[YouTube Data Service] Error fetching top videos:', error);
      throw new Error(`Failed to fetch YouTube top videos: ${error.message}`);
    }
  }

  public async getTrafficSources(
    channelId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<YouTubeTrafficSource[]> {
    try {
      console.log('[YouTube Data Service] Fetching traffic sources for channel:', channelId);

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
      });

      const rows = response.data.rows || [];

      return rows.map((row: any) => ({
        trafficSource: String(row[0]),
        views: Number(row[1]) || 0,
        estimatedMinutesWatched: Number(row[2]) || 0,
      }));
    } catch (error: any) {
      console.error('[YouTube Data Service] Error fetching traffic sources:', error);
      throw new Error(`Failed to fetch YouTube traffic sources: ${error.message}`);
    }
  }

  public async getDeviceTypes(
    channelId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<YouTubeDeviceType[]> {
    try {
      console.log('[YouTube Data Service] Fetching device types for channel:', channelId);

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
      });

      const rows = response.data.rows || [];

      return rows.map((row: any) => ({
        deviceType: String(row[0]),
        views: Number(row[1]) || 0,
        estimatedMinutesWatched: Number(row[2]) || 0,
      }));
    } catch (error: any) {
      console.error('[YouTube Data Service] Error fetching device types:', error);
      throw new Error(`Failed to fetch YouTube device types: ${error.message}`);
    }
  }

  public async getGeography(
    channelId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<YouTubeGeography[]> {
    try {
      console.log('[YouTube Data Service] Fetching geography for channel:', channelId);

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
        maxResults: 25,
      });

      const rows = response.data.rows || [];

      return rows.map((row: any) => ({
        country: String(row[0]),
        views: Number(row[1]) || 0,
        estimatedMinutesWatched: Number(row[2]) || 0,
      }));
    } catch (error: any) {
      console.error('[YouTube Data Service] Error fetching geography:', error);
      throw new Error(`Failed to fetch YouTube geography: ${error.message}`);
    }
  }
}

export default new YouTubeDataService();
