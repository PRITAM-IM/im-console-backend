import linkedinAuthService from './linkedinAuthService';
import { LINKEDIN_CONFIG } from '../config/linkedin';

export interface LinkedInOverviewMetrics {
  followers: number;
  connections?: number;
  profileViews?: number;
  postImpressions?: number;
  postEngagements?: number;
  uniqueVisitors?: number;
}

export interface LinkedInPostData {
  id: string;
  text: string;
  publishedAt: string;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  engagementRate: number;
}

export interface LinkedInFollowerDemographic {
  category: string;
  name: string;
  count: number;
  percentage: number;
}

export interface ILinkedInDataService {
  getAccessToken(projectId: string): Promise<string>;
  getOverviewMetrics(pageId: string, accessToken: string): Promise<LinkedInOverviewMetrics>;
  getRecentPosts(pageId: string, accessToken: string, limit?: number): Promise<LinkedInPostData[]>;
  getFollowerDemographics(pageId: string, accessToken: string): Promise<LinkedInFollowerDemographic[]>;
}

class LinkedInDataService implements ILinkedInDataService {
  public async getAccessToken(projectId: string): Promise<string> {
    const connection = await linkedinAuthService.getConnectionByProject(projectId);

    if (!connection) {
      throw new Error('LinkedIn connection not found for this project');
    }

    // Check if access token is still valid
    if (connection.accessToken && connection.expiresAt && connection.expiresAt > new Date()) {
      return connection.accessToken;
    }

    // Try to refresh access token if we have a refresh token
    if (connection.refreshToken) {
      try {
        const { accessToken, expiresAt } = await linkedinAuthService.refreshAccessToken(connection.refreshToken);

        // Update connection with new access token
        connection.accessToken = accessToken;
        connection.expiresAt = expiresAt || undefined;
        await connection.save();

        return accessToken;
      } catch (error) {
        console.error('[LinkedIn Data Service] Failed to refresh token:', error);
        // If refresh fails, try using existing token
        return connection.accessToken;
      }
    }

    return connection.accessToken;
  }

  public async getOverviewMetrics(pageId: string, accessToken: string): Promise<LinkedInOverviewMetrics> {
    try {
      console.log('[LinkedIn Data Service] Fetching overview metrics for:', pageId);

      // LinkedIn API v2 - Get basic profile stats
      // Note: Full organization statistics require r_organization_social permission
      // For personal profiles, we return basic info
      
      const profile = await linkedinAuthService.getLinkedInProfile(accessToken);
      
      // Return basic metrics
      // In a full implementation with organization access, you would fetch:
      // - organizationalEntityFollowerStatistics
      // - organizationalEntityShareStatistics
      return {
        followers: 0, // Requires organization access
        connections: 0,
        profileViews: 0,
        postImpressions: 0,
        postEngagements: 0,
        uniqueVisitors: 0,
      };
    } catch (error: any) {
      console.error('[LinkedIn Data Service] Error fetching overview metrics:', error);
      throw new Error(`Failed to fetch LinkedIn overview metrics: ${error.message}`);
    }
  }

  public async getRecentPosts(pageId: string, accessToken: string, limit: number = 10): Promise<LinkedInPostData[]> {
    try {
      console.log('[LinkedIn Data Service] Fetching recent posts for:', pageId);

      // LinkedIn API requires specific permissions for post data
      // r_organization_social for organization posts
      // For now, return empty array as this requires additional API access
      
      return [];
    } catch (error: any) {
      console.error('[LinkedIn Data Service] Error fetching posts:', error);
      throw new Error(`Failed to fetch LinkedIn posts: ${error.message}`);
    }
  }

  public async getFollowerDemographics(pageId: string, accessToken: string): Promise<LinkedInFollowerDemographic[]> {
    try {
      console.log('[LinkedIn Data Service] Fetching follower demographics for:', pageId);

      // LinkedIn follower demographics require organization admin access
      // organizationalEntityFollowerStatistics endpoint
      
      return [];
    } catch (error: any) {
      console.error('[LinkedIn Data Service] Error fetching demographics:', error);
      throw new Error(`Failed to fetch LinkedIn demographics: ${error.message}`);
    }
  }
}

export default new LinkedInDataService();

