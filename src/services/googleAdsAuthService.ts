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
      const existingConnection = await GoogleAdsConnection.findOne({ projectId: projectObjectId });
      const effectiveRefreshToken = refreshToken || existingConnection?.refreshToken;

      if (!effectiveRefreshToken) {
        throw new Error('Refresh token is missing. Please reconnect Google Ads with consent.');
      }

      let connection: IGoogleAdsConnection;
      if (existingConnection) {
        existingConnection.refreshToken = effectiveRefreshToken;
        existingConnection.accessToken = accessToken;
        existingConnection.expiresAt = expiresAt ?? undefined;
        connection = await existingConnection.save();
      } else {
        connection = await GoogleAdsConnection.create({
          projectId: projectObjectId,
          refreshToken: effectiveRefreshToken,
          accessToken,
          expiresAt,
        });
      }

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
      // Per Google Ads API docs: login-customer-id is NOT required for this endpoint
      const listCustomersUrl = 'https://googleads.googleapis.com/v23/customers:listAccessibleCustomers';

      console.log('[Google Ads Auth Service] Calling listAccessibleCustomers...');
      console.log('[Google Ads Auth Service] Developer token (masked):', ENV.GOOGLE_ADS_DEVELOPER_TOKEN.substring(0, 8) + '...');

      const listResponse = await fetch(listCustomersUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': ENV.GOOGLE_ADS_DEVELOPER_TOKEN,
          // Note: login-customer-id is NOT used for listAccessibleCustomers per Google docs
        },
      });

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error('[Google Ads Auth Service] Failed to list accessible customers:', {
          status: listResponse.status,
          statusText: listResponse.statusText,
          error: errorText,
        });

        // Provide helpful error message
        throw new Error(`Failed to list accessible customers (${listResponse.status}): ${errorText.substring(0, 300)}`);
      }

      const listData = await listResponse.json() as ListAccessibleCustomersResponse;
      const customerResourceNames = listData.resourceNames || [];

      console.log(`[Google Ads Auth Service] Found ${customerResourceNames.length} accessible customer(s):`, customerResourceNames);

      if (customerResourceNames.length === 0) {
        console.warn('[Google Ads Auth Service] No accessible customers found.');
        return [];
      }

      const customers: GoogleAdsCustomer[] = [];
      const processedCustomerIds = new Set<string>();

      // Step 2: For each accessible customer, first get their details, then check if it's a manager and get sub-accounts
      for (const resourceName of customerResourceNames) {
        const customerId = resourceName.replace('customers/', '');

        if (processedCustomerIds.has(customerId)) continue;
        processedCustomerIds.add(customerId);

        try {
          console.log(`[Google Ads Auth Service] Processing customer ${customerId}...`);

          // Query customer details - for direct access, login-customer-id should be the same as customer being queried
          const searchUrl = `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:search`;

          const customerQuery = `
            SELECT
              customer.id,
              customer.descriptive_name,
              customer.currency_code,
              customer.time_zone,
              customer.manager
            FROM customer
            LIMIT 1
          `;

          const searchResponse = await fetch(searchUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'developer-token': ENV.GOOGLE_ADS_DEVELOPER_TOKEN,
              'login-customer-id': customerId, // Use the same customer ID for direct access
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: customerQuery.trim() }),
          });

          if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            console.warn(`[Google Ads Auth Service] Failed to fetch customer ${customerId}:`, errorText.substring(0, 200));
            continue;
          }

          const searchData = await searchResponse.json() as CustomerSearchResponse;

          if (searchData.results && searchData.results.length > 0) {
            const customerData = searchData.results[0].customer;
            const isManager = (customerData as any)?.manager || false;

            // Add the customer itself
            customers.push({
              customerId: customerData?.id || customerId,
              descriptiveName: customerData?.descriptiveName || customerData?.descriptive_name || `Customer ${customerId}`,
              currencyCode: customerData?.currencyCode || customerData?.currency_code || 'USD',
              timeZone: customerData?.timeZone || customerData?.time_zone || 'America/New_York',
            });

            console.log(`[Google Ads Auth Service] Customer ${customerId}: ${isManager ? 'MANAGER ACCOUNT (MCC)' : 'Regular Account'}`);

            // Step 3: If this is a manager account, fetch all client accounts under it
            if (isManager) {
              console.log(`[Google Ads Auth Service] Fetching sub-accounts for manager ${customerId}...`);

              const clientQuery = `
                SELECT
                  customer_client.id,
                  customer_client.descriptive_name,
                  customer_client.currency_code,
                  customer_client.time_zone,
                  customer_client.manager,
                  customer_client.level,
                  customer_client.hidden
                FROM customer_client
                WHERE customer_client.hidden = FALSE
                  AND customer_client.level = 1
              `;

              try {
                const clientResponse = await fetch(searchUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'developer-token': ENV.GOOGLE_ADS_DEVELOPER_TOKEN,
                    'login-customer-id': customerId, // Manager account ID
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ query: clientQuery.trim() }),
                });

                if (clientResponse.ok) {
                  const clientData = await clientResponse.json() as { results?: any[] };
                  const clientResults = clientData.results || [];

                  console.log(`[Google Ads Auth Service] Found ${clientResults.length} sub-accounts`);

                  for (const result of clientResults) {
                    const client = result.customerClient || result.customer_client;
                    if (client) {
                      const clientId = String(client.id || '');
                      if (clientId && !processedCustomerIds.has(clientId)) {
                        processedCustomerIds.add(clientId);
                        customers.push({
                          customerId: clientId,
                          descriptiveName: client.descriptiveName || client.descriptive_name || `Client ${clientId}`,
                          currencyCode: client.currencyCode || client.currency_code || 'USD',
                          timeZone: client.timeZone || client.time_zone || 'America/New_York',
                        });
                      }
                    }
                  }
                } else {
                  const errorText = await clientResponse.text();
                  console.warn(`[Google Ads Auth Service] Failed to fetch sub-accounts for manager ${customerId}:`, errorText.substring(0, 200));
                }
              } catch (err: any) {
                console.warn(`[Google Ads Auth Service] Error fetching sub-accounts:`, err.message);
              }
            }
          }
        } catch (error: any) {
          console.warn(`[Google Ads Auth Service] Error processing customer ${customerId}:`, error.message);
        }
      }

      console.log(`[Google Ads Auth Service] Successfully fetched ${customers.length} total customer(s)`);
      return customers;
    } catch (error: any) {
      console.error('[Google Ads Auth Service] Error fetching customers:', error.message);
      // Return empty array and allow manual entry
      return [];
    }
  }
}

export default new GoogleAdsAuthService();
