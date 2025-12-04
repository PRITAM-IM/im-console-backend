import GoogleBusinessProfileConnection, { IGoogleBusinessProfileConnection } from '../models/GoogleBusinessProfileConnection';
import { googleBusinessProfileOauth2Client, getGoogleBusinessProfileAuthUrl } from '../config/googleBusinessProfile';
import { Types } from 'mongoose';

interface AccountsResponse {
  accounts?: Array<{
    name: string;
    [key: string]: any;
  }>;
}

interface LocationsResponse {
  locations?: Array<{
    name: string;
    title?: string;
    storefrontAddress?: {
      addressLines?: string[];
      locality?: string;
      administrativeArea?: string;
      postalCode?: string;
      regionCode?: string;
    };
    [key: string]: any;
  }>;
}

export interface GBPLocation {
  name: string; // Resource name (e.g., "locations/12345")
  locationId: string; // Extracted ID
  title: string; // Business name
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
}

export interface IGbpAuthService {
  generateAuthUrl(projectId?: string): string;
  handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }>;
  saveConnection(projectId: string, refreshToken: string, accessToken: string, expiresAt: Date | null): Promise<IGoogleBusinessProfileConnection>;
  getConnectionByProject(projectId: string): Promise<IGoogleBusinessProfileConnection | null>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }>;
  getLocations(accessToken: string): Promise<GBPLocation[]>;
}

class GbpAuthService implements IGbpAuthService {
  public generateAuthUrl(projectId?: string): string {
    return getGoogleBusinessProfileAuthUrl(projectId);
  }

  public async handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }> {
    const { tokens } = await googleBusinessProfileOauth2Client.getToken(code);
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
  ): Promise<IGoogleBusinessProfileConnection> {
    try {
      console.log(`[GBP Auth Service] Saving connection for project: ${projectId}`);
      console.log(`[GBP Auth Service] Has refresh token: ${!!refreshToken}, Has access token: ${!!accessToken}`);
      
      // Validate projectId format
      if (!Types.ObjectId.isValid(projectId)) {
        throw new Error(`Invalid project ID format: ${projectId}`);
      }

      const projectObjectId = new Types.ObjectId(projectId);
      
      // Remove existing connection if it exists
      const deleteResult = await GoogleBusinessProfileConnection.deleteMany({ projectId: projectObjectId });
      console.log(`[GBP Auth Service] Deleted ${deleteResult.deletedCount} existing connection(s)`);

      // Create new connection
      const connection = await GoogleBusinessProfileConnection.create({
        projectId: projectObjectId,
        refreshToken,
        accessToken,
        expiresAt,
      });

      console.log(`[GBP Auth Service] Connection created successfully - ID: ${connection._id}`);
      
      return connection;
    } catch (error: any) {
      console.error(`[GBP Auth Service] Error saving connection:`, error);
      throw error;
    }
  }

  public async getConnectionByProject(projectId: string): Promise<IGoogleBusinessProfileConnection | null> {
    return await GoogleBusinessProfileConnection.findOne({ projectId: new Types.ObjectId(projectId) });
  }

  public async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    googleBusinessProfileOauth2Client.setCredentials({ refresh_token: refreshToken });
    
    try {
      const { credentials } = await googleBusinessProfileOauth2Client.refreshAccessToken();
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
      console.error('[GBP Auth] Token refresh failed:', error.message);
      
      if (error.message?.includes('invalid_grant') || error.response?.data?.error === 'invalid_grant') {
        throw new Error('Refresh token expired or revoked. Please reconnect your Google Business Profile account.');
      }
      
      throw new Error(`Failed to refresh access token: ${error.message || 'Unknown error'}`);
    }
  }

  public async getLocations(accessToken: string): Promise<GBPLocation[]> {
    try {
      googleBusinessProfileOauth2Client.setCredentials({ access_token: accessToken });
      
      // First, get all accounts
      const accountsResponse = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!accountsResponse.ok) {
        throw new Error(`Failed to fetch accounts: ${accountsResponse.statusText}`);
      }

      const accountsData = await accountsResponse.json() as AccountsResponse;
      const accounts = accountsData.accounts || [];

      if (accounts.length === 0) {
        return [];
      }

      const locations: GBPLocation[] = [];

      // For each account, fetch locations
      for (const account of accounts) {
        try {
          const locationsResponse = await fetch(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (locationsResponse.ok) {
            const locationsData = await locationsResponse.json() as LocationsResponse;
            const accountLocations = locationsData.locations || [];

            for (const location of accountLocations) {
              // Extract location ID from name (format: "accounts/123/locations/456")
              const locationId = location.name?.split('/').pop() || '';
              
              locations.push({
                name: location.name,
                locationId,
                title: location.title || 'Unnamed Location',
                storefrontAddress: location.storefrontAddress,
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching locations for account ${account.name}:`, error);
        }
      }

      console.log(`Fetched ${locations.length} Google Business Profile locations`);
      return locations;
    } catch (error: any) {
      throw new Error(`Failed to fetch Google Business Profile locations: ${error.message}`);
    }
  }
}

export default new GbpAuthService();

