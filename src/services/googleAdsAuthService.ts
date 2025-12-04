import { google } from 'googleapis';
import GoogleAdsConnection, { IGoogleAdsConnection } from '../models/GoogleAdsConnection';
import { googleAdsOauth2Client, getGoogleAdsAuthUrl } from '../config/googleAds';
import { ENV } from '../config/env';
import { Types } from 'mongoose';

export interface GoogleAdsCustomer {
  customerId: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
}

interface ListAccessibleCustomersResponse {
  resourceNames?: string[];
}

interface CustomerSearchResult {
  customer?: {
    id?: string;
    descriptiveName?: string;
    descriptive_name?: string; // API returns snake_case
    currencyCode?: string;
    currency_code?: string; // API returns snake_case
    timeZone?: string;
    time_zone?: string; // API returns snake_case
  };
}

interface CustomerSearchResponse {
  results?: CustomerSearchResult[];
}

export interface IGoogleAdsAuthService {
  generateAuthUrl(state?: string): string;
  handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }>;
  saveConnection(projectId: string, refreshToken: string, accessToken: string, expiresAt: Date | null): Promise<IGoogleAdsConnection>;
  getConnectionByProject(projectId: string): Promise<IGoogleAdsConnection | null>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }>;
  getGoogleAdsCustomers(accessToken: string): Promise<GoogleAdsCustomer[]>;
}

class GoogleAdsAuthService implements IGoogleAdsAuthService {
  public generateAuthUrl(state?: string): string {
    return getGoogleAdsAuthUrl(state);
  }

  public async handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }> {
    const { tokens } = await googleAdsOauth2Client.getToken(code);
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
  ): Promise<IGoogleAdsConnection> {
    try {
      console.log(`[Google Ads Auth Service] Saving connection for project: ${projectId}`);
      console.log(`[Google Ads Auth Service] Has refresh token: ${!!refreshToken}, Has access token: ${!!accessToken}`);
      
      // Validate projectId format
      if (!Types.ObjectId.isValid(projectId)) {
        throw new Error(`Invalid project ID format: ${projectId}`);
      }

      const projectObjectId = new Types.ObjectId(projectId);
      
      // Remove existing connection if it exists
      const deleteResult = await GoogleAdsConnection.deleteMany({ projectId: projectObjectId });
      console.log(`[Google Ads Auth Service] Deleted ${deleteResult.deletedCount} existing connection(s)`);

      // Create new connection
      const connection = await GoogleAdsConnection.create({
        projectId: projectObjectId,
        refreshToken,
        accessToken,
        expiresAt,
      });

      console.log(`[Google Ads Auth Service] Connection created successfully - ID: ${connection._id}`);
      
      return connection;
    } catch (error: any) {
      console.error(`[Google Ads Auth Service] Error saving connection:`, error);
      console.error(`[Google Ads Auth Service] Error details:`, {
        projectId,
        hasRefreshToken: !!refreshToken,
        hasAccessToken: !!accessToken,
        errorMessage: error.message,
        errorName: error.name,
      });
      throw error;
    }
  }

  public async getConnectionByProject(projectId: string): Promise<IGoogleAdsConnection | null> {
    return await GoogleAdsConnection.findOne({ projectId: new Types.ObjectId(projectId) });
  }

  public async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    googleAdsOauth2Client.setCredentials({ refresh_token: refreshToken });
    
    try {
      const { credentials } = await googleAdsOauth2Client.refreshAccessToken();
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

  public async getGoogleAdsCustomers(accessToken: string): Promise<GoogleAdsCustomer[]> {
    try {
      console.log('[Google Ads Auth Service] Fetching accessible customers...');
      
      if (!ENV.GOOGLE_ADS_DEVELOPER_TOKEN) {
        console.warn('[Google Ads Auth Service] Developer token not configured');
        return [];
      }

      // Step 1: List accessible customers using Google Ads API REST endpoint
      const listCustomersUrl = 'https://googleads.googleapis.com/v16/customers:listAccessibleCustomers';
      
      const listResponse = await fetch(listCustomersUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': ENV.GOOGLE_ADS_DEVELOPER_TOKEN,
          'Content-Type': 'application/json',
        },
      });

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error('[Google Ads Auth Service] Failed to list accessible customers:', {
          status: listResponse.status,
          statusText: listResponse.statusText,
          error: errorText,
        });
        throw new Error(`Failed to list accessible customers: ${listResponse.statusText}`);
      }

      const listData = await listResponse.json() as ListAccessibleCustomersResponse;
      const customerResourceNames = listData.resourceNames || [];
      
      console.log(`[Google Ads Auth Service] Found ${customerResourceNames.length} accessible customer(s)`);

      if (customerResourceNames.length === 0) {
        return [];
      }

      // Step 2: Fetch details for each customer
      const customers: GoogleAdsCustomer[] = [];

      for (const resourceName of customerResourceNames) {
        try {
          // Extract customer ID from resource name (format: "customers/1234567890")
          const customerId = resourceName.replace('customers/', '');
          
          // Query customer details using Google Ads API search endpoint
          const searchUrl = `https://googleads.googleapis.com/v16/${resourceName}/googleAds:search`;
          
          const query = `
            SELECT
              customer.id,
              customer.descriptive_name,
              customer.currency_code,
              customer.time_zone
            FROM customer
            LIMIT 1
          `;

          const searchResponse = await fetch(searchUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'developer-token': ENV.GOOGLE_ADS_DEVELOPER_TOKEN,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: query.trim(),
            }),
          });

          if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            console.warn(`[Google Ads Auth Service] Failed to fetch details for customer ${customerId}:`, {
              status: searchResponse.status,
              error: errorText,
            });
            // Continue with other customers even if one fails
            continue;
          }

          const searchData = await searchResponse.json() as CustomerSearchResponse;
          
          if (searchData.results && searchData.results.length > 0) {
            const customerData = searchData.results[0].customer;
            customers.push({
              customerId: customerData?.id || customerId,
              descriptiveName: customerData?.descriptiveName || customerData?.descriptive_name || `Customer ${customerId}`,
              currencyCode: customerData?.currencyCode || customerData?.currency_code || 'USD',
              timeZone: customerData?.timeZone || customerData?.time_zone || 'America/New_York',
            });
          } else {
            // Fallback: add customer with minimal info if query returns no results
            customers.push({
              customerId,
              descriptiveName: `Customer ${customerId}`,
              currencyCode: 'USD',
              timeZone: 'America/New_York',
            });
          }
        } catch (error: any) {
          console.warn(`[Google Ads Auth Service] Error fetching customer details:`, error.message);
          // Continue with other customers
        }
      }

      console.log(`[Google Ads Auth Service] Successfully fetched ${customers.length} customer(s)`);
      return customers;
    } catch (error: any) {
      // Log error but don't throw - allow manual entry instead
      console.error('[Google Ads Auth Service] Error fetching customers:', error.message);
      console.log('[Google Ads Auth Service] Manual customer ID entry is available');
      return [];
    }
  }
}

export default new GoogleAdsAuthService();

