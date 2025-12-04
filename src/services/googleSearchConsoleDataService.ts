import { ENV } from '../config/env';
import googleSearchConsoleAuthService from './googleSearchConsoleAuthService';
import { IGoogleSearchConsoleConnection } from '../models/GoogleSearchConsoleConnection';

// Google Search Console API - use webmasters/v3 endpoint
const SEARCH_CONSOLE_API_BASE = 'https://www.googleapis.com/webmasters/v3';

export interface IGoogleSearchConsoleDataService {
  getAccessToken(projectId: string): Promise<string>;
  getSearchAnalytics(
    siteUrl: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any>;
  getTopQueries(
    siteUrl: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any>;
  getTopPages(
    siteUrl: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any>;
  getCountries(
    siteUrl: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any>;
  getDevices(
    siteUrl: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any>;
}

// Helper to execute Search Analytics query
const executeSearchAnalyticsQuery = async (
  siteUrl: string,
  accessToken: string,
  requestBody: any
): Promise<any> => {
  // Encode the site URL properly for Google's API
  // For domain properties, use the format: sc-domain:example.com
  // For URL prefix properties, use the full URL
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const url = `${SEARCH_CONSOLE_API_BASE}/sites/${encodedSiteUrl}/searchAnalytics/query`;
  
  console.log(`[Search Console API] Querying: ${siteUrl}`);
  console.log(`[Search Console API] Request:`, JSON.stringify(requestBody, null, 2));
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Search Console API] Error response:`, errorText);
      throw new Error(`Search Console API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { rows?: any[]; responseAggregationType?: string };
    console.log(`[Search Console API] Retrieved ${data.rows?.length || 0} rows`);
    return data;
  } catch (error: any) {
    console.error(`[Search Console API] Request failed:`, error.message);
    throw error;
  }
};

// Country code to name mapping
const countryCodeToName: Record<string, string> = {
  'usa': 'United States',
  'gbr': 'United Kingdom',
  'can': 'Canada',
  'aus': 'Australia',
  'ind': 'India',
  'deu': 'Germany',
  'fra': 'France',
  'jpn': 'Japan',
  'bra': 'Brazil',
  'mex': 'Mexico',
  'esp': 'Spain',
  'ita': 'Italy',
  'nld': 'Netherlands',
  'rus': 'Russia',
  'chn': 'China',
  'kor': 'South Korea',
  'sgp': 'Singapore',
  'are': 'UAE',
  'sau': 'Saudi Arabia',
  'zaf': 'South Africa',
};

// Convert 3-letter to 2-letter country code
const countryCode3to2: Record<string, string> = {
  'usa': 'US',
  'gbr': 'GB',
  'can': 'CA',
  'aus': 'AU',
  'ind': 'IN',
  'deu': 'DE',
  'fra': 'FR',
  'jpn': 'JP',
  'bra': 'BR',
  'mex': 'MX',
  'esp': 'ES',
  'ita': 'IT',
  'nld': 'NL',
  'rus': 'RU',
  'chn': 'CN',
  'kor': 'KR',
  'sgp': 'SG',
  'are': 'AE',
  'sau': 'SA',
  'zaf': 'ZA',
};

class GoogleSearchConsoleDataService implements IGoogleSearchConsoleDataService {
  public async getAccessToken(projectId: string): Promise<string> {
    const connection = await googleSearchConsoleAuthService.getConnectionByProject(projectId);
    if (!connection) {
      throw new Error('Google Search Console connection not found for this project');
    }

    if (connection.accessToken && connection.expiresAt && new Date() < connection.expiresAt) {
      return connection.accessToken;
    }

    if (connection.refreshToken) {
      const { accessToken, expiresAt } = await googleSearchConsoleAuthService.refreshAccessToken(connection.refreshToken);
      connection.accessToken = accessToken;
      connection.expiresAt = expiresAt || undefined;
      await connection.save();
      return accessToken;
    }

    throw new Error('Unable to obtain valid access token');
  }

  public async getSearchAnalytics(
    siteUrl: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    console.log(`[Search Console Data Service] Fetching search analytics for: ${siteUrl}`);
    console.log(`[Search Console Data Service] Date range: ${dateRange.startDate} to ${dateRange.endDate}`);
    
    const requestBody = {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      dimensions: [], // No dimensions = aggregated totals
      rowLimit: 1,
      dataState: 'all', // Include fresh data (may be incomplete)
    };

    try {
      const data = await executeSearchAnalyticsQuery(siteUrl, accessToken, requestBody);
      
      if (!data.rows || data.rows.length === 0) {
        return {
          clicks: 0,
          impressions: 0,
          ctr: 0,
          position: 0,
        };
      }

      const row = data.rows[0];
      return {
        clicks: Math.round(row.clicks || 0),
        impressions: Math.round(row.impressions || 0),
        ctr: Number(((row.ctr || 0) * 100).toFixed(2)),
        position: Number((row.position || 0).toFixed(1)),
      };
    } catch (error: any) {
      console.error(`[Search Console Data Service] Error fetching analytics:`, error.message);
      throw new Error(`Failed to fetch Search Console analytics: ${error.message}`);
    }
  }

  public async getTopQueries(
    siteUrl: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    console.log(`[Search Console Data Service] Fetching top queries for: ${siteUrl}`);
    
    const requestBody = {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      dimensions: ['query'],
      rowLimit: 100, // Get top 100 queries
      dataState: 'all',
    };

    try {
      const data = await executeSearchAnalyticsQuery(siteUrl, accessToken, requestBody);
      
      if (!data.rows) {
        return [];
      }

      return data.rows.map((row: any) => ({
        query: row.keys?.[0] || 'Unknown',
        clicks: Math.round(row.clicks || 0),
        impressions: Math.round(row.impressions || 0),
        ctr: Number(((row.ctr || 0) * 100).toFixed(2)),
        position: Number((row.position || 0).toFixed(1)),
      }));
    } catch (error: any) {
      console.error(`[Search Console Data Service] Error fetching queries:`, error.message);
      throw new Error(`Failed to fetch Search Console queries: ${error.message}`);
    }
  }

  public async getTopPages(
    siteUrl: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    console.log(`[Search Console Data Service] Fetching top pages for: ${siteUrl}`);
    
    const requestBody = {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      dimensions: ['page'],
      rowLimit: 100, // Get top 100 pages
      dataState: 'all',
    };

    try {
      const data = await executeSearchAnalyticsQuery(siteUrl, accessToken, requestBody);
      
      if (!data.rows) {
        return [];
      }

      return data.rows.map((row: any) => {
        const fullUrl = row.keys?.[0] || '';
        // Extract path from full URL
        let page = fullUrl;
        try {
          const url = new URL(fullUrl);
          page = url.pathname || '/';
        } catch {
          // If URL parsing fails, use the original
        }
        
        return {
          page: page,
          fullUrl: fullUrl,
          clicks: Math.round(row.clicks || 0),
          impressions: Math.round(row.impressions || 0),
          ctr: Number(((row.ctr || 0) * 100).toFixed(2)),
          position: Number((row.position || 0).toFixed(1)),
        };
      });
    } catch (error: any) {
      console.error(`[Search Console Data Service] Error fetching pages:`, error.message);
      throw new Error(`Failed to fetch Search Console pages: ${error.message}`);
    }
  }

  public async getCountries(
    siteUrl: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    console.log(`[Search Console Data Service] Fetching countries for: ${siteUrl}`);
    
    const requestBody = {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      dimensions: ['country'],
      rowLimit: 50, // Get top 50 countries
      dataState: 'all',
    };

    try {
      const data = await executeSearchAnalyticsQuery(siteUrl, accessToken, requestBody);
      
      if (!data.rows) {
        return [];
      }

      return data.rows.map((row: any) => {
        const countryCode3 = (row.keys?.[0] || '').toLowerCase();
        return {
          country: countryCodeToName[countryCode3] || countryCode3.toUpperCase(),
          countryCode: countryCode3to2[countryCode3] || countryCode3.toUpperCase(),
          clicks: Math.round(row.clicks || 0),
          impressions: Math.round(row.impressions || 0),
          ctr: Number(((row.ctr || 0) * 100).toFixed(2)),
          position: Number((row.position || 0).toFixed(1)),
        };
      });
    } catch (error: any) {
      console.error(`[Search Console Data Service] Error fetching countries:`, error.message);
      throw new Error(`Failed to fetch Search Console countries: ${error.message}`);
    }
  }

  public async getDevices(
    siteUrl: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    console.log(`[Search Console Data Service] Fetching devices for: ${siteUrl}`);
    
    const requestBody = {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      dimensions: ['device'],
      rowLimit: 10,
      dataState: 'all',
    };

    try {
      const data = await executeSearchAnalyticsQuery(siteUrl, accessToken, requestBody);
      
      if (!data.rows) {
        return [];
      }

      const deviceNameMap: Record<string, string> = {
        'MOBILE': 'Mobile',
        'DESKTOP': 'Desktop',
        'TABLET': 'Tablet',
      };

      return data.rows.map((row: any) => {
        const device = (row.keys?.[0] || 'UNKNOWN').toUpperCase();
        return {
          device: deviceNameMap[device] || device,
          clicks: Math.round(row.clicks || 0),
          impressions: Math.round(row.impressions || 0),
          ctr: Number(((row.ctr || 0) * 100).toFixed(2)),
          position: Number((row.position || 0).toFixed(1)),
        };
      });
    } catch (error: any) {
      console.error(`[Search Console Data Service] Error fetching devices:`, error.message);
      throw new Error(`Failed to fetch Search Console devices: ${error.message}`);
    }
  }
}

export default new GoogleSearchConsoleDataService();
