import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { ENV } from '../config/env';
import gaAuthService from './gaAuthService';
import { IGAConnection } from '../models/GAConnection';

export interface IGaDataService {
  initializeClient(accessToken: string): BetaAnalyticsDataClient;
  runReport(
    propertyId: string,
    accessToken: string,
    dimensions: string[],
    metrics: string[],
    dateRanges: { startDate: string; endDate: string }[]
  ): Promise<any>;
  getAccessToken(projectId: string): Promise<string>;
}

class GaDataService implements IGaDataService {
  private analyticsDataClient: BetaAnalyticsDataClient | null = null;

  /**
   * Creates a compatible auth client for BetaAnalyticsDataClient
   * Creates a wrapper around OAuth2Client that implements all required methods
   */
  private createAuthClient(accessToken: string): any {
    const oauth2Client = new OAuth2Client(
      ENV.GOOGLE_CLIENT_ID,
      ENV.GOOGLE_CLIENT_SECRET,
      ENV.GOOGLE_REDIRECT_URL
    );
    
    oauth2Client.setCredentials({ access_token: accessToken });
    
    // Create a wrapper object that delegates to OAuth2Client and adds missing methods
    // BetaAnalyticsDataClient expects methods like getUniverseDomain and getClient
    const authWrapper: any = {
      // Delegate all OAuth2Client methods
      getAccessToken: (options?: any) => oauth2Client.getAccessToken(options),
      getRequestHeaders: (url?: string) => oauth2Client.getRequestHeaders(url),
      request: (opts: any) => oauth2Client.request(opts),
      setCredentials: (credentials: any) => oauth2Client.setCredentials(credentials),
      getCredentials: () => oauth2Client.credentials,
      refreshAccessToken: () => oauth2Client.refreshAccessToken(),
      
      // Add missing methods that BetaAnalyticsDataClient expects
      getUniverseDomain: () => 'googleapis.com',
      
      getClient: async () => {
        // Ensure we have a valid access token
        try {
          await oauth2Client.getAccessToken();
        } catch (error) {
          // If token refresh fails, use the provided access token
          console.warn('Token refresh failed, using provided access token');
        }
        return oauth2Client;
      },
    };
    
    // Copy any other properties/methods that might be needed
    // Use Object.assign to copy properties
    Object.setPrototypeOf(authWrapper, Object.getPrototypeOf(oauth2Client));
    
    return authWrapper;
  }

  public initializeClient(accessToken: string): BetaAnalyticsDataClient {
    const authClient = this.createAuthClient(accessToken);
    
    // Initialize the BetaAnalyticsDataClient with the compatible auth client
    this.analyticsDataClient = new BetaAnalyticsDataClient({
      auth: authClient,
    });

    return this.analyticsDataClient;
  }

  public async getAccessToken(projectId: string): Promise<string> {
    // Get connection details
    const connection = await gaAuthService.getConnectionByProject(projectId);
    if (!connection) {
      throw new Error('GA connection not found for this project');
    }

    // Check if access token is still valid
    if (connection.accessToken && connection.expiresAt && new Date() < connection.expiresAt) {
      return connection.accessToken;
    }

    // Refresh access token
    if (connection.refreshToken) {
      const { accessToken, expiresAt } = await gaAuthService.refreshAccessToken(connection.refreshToken);
      
      // Update connection with new access token
      connection.accessToken = accessToken;
      connection.expiresAt = expiresAt || undefined;
      await connection.save();

      return accessToken;
    }

    throw new Error('Unable to obtain valid access token');
  }

  public async runReport(
    propertyId: string,
    accessToken: string,
    dimensions: string[],
    metrics: string[],
    dateRanges: { startDate: string; endDate: string }[],
    timezone?: string // Optional timezone parameter (e.g., 'Asia/Kolkata' for IST)
  ): Promise<any> {
    // Create a compatible auth client for each request
    const authClient = this.createAuthClient(accessToken);
    
    // Create a new client instance for each request
    const analyticsClient = new BetaAnalyticsDataClient({
      auth: authClient,
    });

    try {
      const requestParams: any = {
        property: `properties/${propertyId}`,
        metrics: metrics.map(metric => ({ name: metric })),
        dateRanges: dateRanges.map(range => ({
          startDate: range.startDate,
          endDate: range.endDate,
        })),
        // Keep empty rows to ensure accurate data representation
        keepEmptyRows: true,
        // Return property quota info
        returnPropertyQuota: true,
      };

      // Only add dimensions if provided
      if (dimensions.length > 0) {
        requestParams.dimensions = dimensions.map(dimension => ({ name: dimension }));
      }

      console.log('GA4 API Request:', {
        property: requestParams.property,
        metrics: requestParams.metrics.map((m: any) => m.name),
        dimensions: requestParams.dimensions?.map((d: any) => d.name) || [],
        dateRanges: requestParams.dateRanges,
        timezone: timezone || 'Property default',
      });

      const [response] = await analyticsClient.runReport(requestParams);

      console.log('GA4 API Response:', {
        rowCount: response.rows?.length || 0,
        hasData: (response.rows?.length || 0) > 0,
        propertyQuota: response.propertyQuota ? 'Present' : 'Not present',
      });

      return response;
    } catch (error: any) {
      // Log detailed error information
      console.error('GA4 API Error Details:', {
        propertyId,
        property: `properties/${propertyId}`,
        errorMessage: error.message,
        errorCode: error.code,
        errorStatus: error.status,
        errorDetails: JSON.stringify(error.details || error, null, 2),
        metrics,
        dimensions,
        dateRanges,
      });
      
      // Extract more specific error message
      let errorMsg = error.message || 'Unknown error';
      if (error.details && Array.isArray(error.details) && error.details.length > 0) {
        const detail = error.details[0];
        if (detail.message) {
          errorMsg = detail.message;
        }
      }
      
      throw new Error(`GA4 API Error: ${errorMsg}`);
    }
  }
}

export default new GaDataService();