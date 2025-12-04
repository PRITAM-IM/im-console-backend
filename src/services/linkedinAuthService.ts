import LinkedInConnection, { ILinkedInConnection } from '../models/LinkedInConnection';
import { getLinkedInAuthUrl, exchangeCodeForTokens, refreshAccessToken as refreshToken, LINKEDIN_CONFIG } from '../config/linkedin';
import { Types } from 'mongoose';

export interface LinkedInProfile {
  id: string;
  localizedFirstName?: string;
  localizedLastName?: string;
  profilePicture?: string;
}

export interface LinkedInOrganization {
  id: string;
  name: string;
  vanityName?: string;
  logoUrl?: string;
  followerCount?: number;
}

export interface ILinkedInAuthService {
  generateAuthUrl(projectId: string): string;
  handleCallback(code: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date | null }>;
  saveConnection(projectId: string, accessToken: string, refreshToken?: string, expiresAt?: Date | null): Promise<ILinkedInConnection>;
  getConnectionByProject(projectId: string): Promise<ILinkedInConnection | null>;
  refreshAccessToken(existingRefreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }>;
  getLinkedInProfile(accessToken: string): Promise<LinkedInProfile | null>;
  getOrganizations(accessToken: string): Promise<LinkedInOrganization[]>;
}

class LinkedInAuthService implements ILinkedInAuthService {
  public generateAuthUrl(projectId: string): string {
    return getLinkedInAuthUrl(projectId);
  }

  public async handleCallback(code: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date | null }> {
    const tokens = await exchangeCodeForTokens(code);
    
    const expiresAt = tokens.expiresIn 
      ? new Date(Date.now() + tokens.expiresIn * 1000) 
      : null;

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
    };
  }

  public async saveConnection(
    projectId: string,
    accessToken: string,
    refreshToken?: string,
    expiresAt?: Date | null
  ): Promise<ILinkedInConnection> {
    try {
      console.log(`[LinkedIn Auth Service] Saving connection for project: ${projectId}`);
      
      if (!Types.ObjectId.isValid(projectId)) {
        throw new Error(`Invalid project ID format: ${projectId}`);
      }

      const projectObjectId = new Types.ObjectId(projectId);
      
      // Remove existing connection if it exists
      const deleteResult = await LinkedInConnection.deleteMany({ projectId: projectObjectId });
      console.log(`[LinkedIn Auth Service] Deleted ${deleteResult.deletedCount} existing connection(s)`);

      // Create new connection
      const connection = await LinkedInConnection.create({
        projectId: projectObjectId,
        accessToken,
        refreshToken,
        expiresAt,
      });

      console.log(`[LinkedIn Auth Service] Connection created successfully - ID: ${connection._id}`);
      
      return connection;
    } catch (error: any) {
      console.error(`[LinkedIn Auth Service] Error saving connection:`, error);
      throw error;
    }
  }

  public async getConnectionByProject(projectId: string): Promise<ILinkedInConnection | null> {
    return await LinkedInConnection.findOne({ projectId: new Types.ObjectId(projectId) });
  }

  public async refreshAccessToken(existingRefreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    try {
      const tokens = await refreshToken(existingRefreshToken);
      
      const expiresAt = tokens.expiresIn 
        ? new Date(Date.now() + tokens.expiresIn * 1000) 
        : null;

      return {
        accessToken: tokens.accessToken,
        expiresAt,
      };
    } catch (error) {
      throw new Error('Failed to refresh LinkedIn access token');
    }
  }

  public async getLinkedInProfile(accessToken: string): Promise<LinkedInProfile | null> {
    try {
      console.log('[LinkedIn Auth Service] Fetching user profile...');
      
      const response = await fetch(`${LINKEDIN_CONFIG.apiBaseUrl}/userinfo`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[LinkedIn Auth Service] Profile fetch error:', errorText);
        return null;
      }

      const data = await response.json() as {
        sub?: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
      };
      
      return {
        id: data.sub || '',
        localizedFirstName: data.given_name,
        localizedLastName: data.family_name,
        profilePicture: data.picture,
      };
    } catch (error: any) {
      console.error('[LinkedIn Auth Service] Error fetching profile:', error.message);
      return null;
    }
  }

  public async getOrganizations(accessToken: string): Promise<LinkedInOrganization[]> {
    try {
      console.log('[LinkedIn Auth Service] Fetching organizations...');
      
      // First get the user profile to get their URN
      const profile = await this.getLinkedInProfile(accessToken);
      
      if (!profile) {
        console.log('[LinkedIn Auth Service] Could not fetch profile, returning empty organizations');
        return [];
      }

      // For now, return the user's profile as a "page" since organization access requires special permissions
      // In a full implementation, you would fetch organizations the user administers
      return [{
        id: profile.id,
        name: `${profile.localizedFirstName || ''} ${profile.localizedLastName || ''}`.trim() || 'LinkedIn Profile',
        vanityName: undefined,
        logoUrl: profile.profilePicture,
        followerCount: undefined,
      }];
    } catch (error: any) {
      console.error('[LinkedIn Auth Service] Error fetching organizations:', error.message);
      return [];
    }
  }
}

export default new LinkedInAuthService();

