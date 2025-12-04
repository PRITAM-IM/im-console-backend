import { google } from 'googleapis';
import GAConnection, { IGAConnection } from '../models/GAConnection';
import { oauth2Client, getAuthUrl } from '../config/google';
import { Types } from 'mongoose';

export interface GA4Property {
  propertyId: string;
  displayName: string;
  propertyType: string;
}

export interface IGaAuthService {
  generateAuthUrl(state?: string): string;
  handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }>;
  saveConnection(projectId: string, refreshToken: string, accessToken: string, expiresAt: Date | null): Promise<IGAConnection>;
  getConnectionByProject(projectId: string): Promise<IGAConnection | null>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }>;
  getGA4Properties(accessToken: string): Promise<GA4Property[]>;
}

class GaAuthService implements IGaAuthService {
  public generateAuthUrl(state?: string): string {
    return getAuthUrl(state);
  }

  public async handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }> {
    const { tokens } = await oauth2Client.getToken(code);
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
  ): Promise<IGAConnection> {
    try {
      console.log(`[GA Auth Service] Saving connection for project: ${projectId}`);
      console.log(`[GA Auth Service] Has refresh token: ${!!refreshToken}, Has access token: ${!!accessToken}`);
      
      // Validate projectId format
      if (!Types.ObjectId.isValid(projectId)) {
        throw new Error(`Invalid project ID format: ${projectId}`);
      }

      const projectObjectId = new Types.ObjectId(projectId);
      
      // Remove existing connection if it exists
      const deleteResult = await GAConnection.deleteMany({ projectId: projectObjectId });
      console.log(`[GA Auth Service] Deleted ${deleteResult.deletedCount} existing connection(s)`);

      // Create new connection
      const connection = await GAConnection.create({
        projectId: projectObjectId,
        refreshToken,
        accessToken,
        expiresAt,
      });

      console.log(`[GA Auth Service] Connection created successfully - ID: ${connection._id}`);
      
      return connection;
    } catch (error: any) {
      console.error(`[GA Auth Service] Error saving connection:`, error);
      console.error(`[GA Auth Service] Error details:`, {
        projectId,
        hasRefreshToken: !!refreshToken,
        hasAccessToken: !!accessToken,
        errorMessage: error.message,
        errorName: error.name,
      });
      throw error;
    }
  }

  public async getConnectionByProject(projectId: string): Promise<IGAConnection | null> {
    return await GAConnection.findOne({ projectId: new Types.ObjectId(projectId) });
  }

  public async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      const { access_token, expiry_date } = credentials;

      if (!access_token) {
        throw new Error('Failed to refresh access token - no access token returned');
      }

      const expiresAt = expiry_date ? new Date(expiry_date) : null;

      return {
        accessToken: access_token,
        expiresAt,
      };
    } catch (error: any) {
      console.error('[GA Auth] Token refresh failed:', {
        error: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
      });
      
      // Check if it's an invalid_grant error (refresh token expired/revoked)
      if (error.message?.includes('invalid_grant') || error.response?.data?.error === 'invalid_grant') {
        throw new Error('Refresh token expired or revoked. Please reconnect your Google Analytics account.');
      }
      
      throw new Error(`Failed to refresh access token: ${error.message || 'Unknown error'}`);
    }
  }

  public async getGA4Properties(accessToken: string): Promise<GA4Property[]> {
    try {
      oauth2Client.setCredentials({ access_token: accessToken });
      const analyticsAdmin = google.analyticsadmin('v1beta');

      // List all accounts with pagination support
      const accounts: any[] = [];
      let accountsPageToken: string | undefined = undefined;
      
      do {
        const accountsResponse: any = await analyticsAdmin.accounts.list({
          auth: oauth2Client,
          pageToken: accountsPageToken,
          pageSize: 200, // Maximum page size
        });

        if (accountsResponse.data.accounts) {
          accounts.push(...accountsResponse.data.accounts);
        }

        accountsPageToken = accountsResponse.data.nextPageToken || undefined;
      } while (accountsPageToken);

      if (accounts.length === 0) {
        return [];
      }

      const properties: GA4Property[] = [];

      // For each account, list properties with pagination support
      for (const account of accounts) {
        if (!account.name) continue;

        try {
          let propertiesPageToken: string | undefined = undefined;
          
          do {
            const propertiesResponse: any = await analyticsAdmin.properties.list({
              auth: oauth2Client,
              filter: `parent:${account.name}`,
              pageToken: propertiesPageToken,
              pageSize: 200, // Maximum page size
            });

            if (propertiesResponse.data.properties) {
              for (const property of propertiesResponse.data.properties) {
                if (property.name && property.displayName) {
                  // Extract property ID from name (format: properties/123456789)
                  const propertyId = property.name.split('/')[1];
                  if (propertyId) {
                    properties.push({
                      propertyId,
                      displayName: property.displayName,
                      propertyType: property.propertyType || 'PROPERTY_TYPE_UNSPECIFIED',
                    });
                  }
                }
              }
            }

            propertiesPageToken = propertiesResponse.data.nextPageToken || undefined;
          } while (propertiesPageToken);
        } catch (error) {
          // Skip accounts where we can't list properties
          console.error(`Error listing properties for account ${account.name}:`, error);
        }
      }

      console.log(`Fetched ${properties.length} GA4 properties across ${accounts.length} accounts`);
      return properties;
    } catch (error: any) {
      throw new Error(`Failed to fetch GA4 properties: ${error.message}`);
    }
  }
}

export default new GaAuthService();