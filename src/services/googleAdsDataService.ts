import { ENV } from '../config/env';
import googleAdsAuthService from './googleAdsAuthService';
import { IGoogleAdsConnection } from '../models/GoogleAdsConnection';

// Google Ads API v18 (current stable version)
const GOOGLE_ADS_API_VERSION = 'v18';
const GOOGLE_ADS_API_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

export interface IGoogleAdsDataService {
  getAccessToken(projectId: string): Promise<string>;
  getOverviewMetrics(
    customerId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any>;
  getLocationData(
    customerId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any>;
  getDeviceData(
    customerId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any>;
  getCampaigns(
    customerId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any>;
  getKeywords(
    customerId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any>;
}

// Helper to format customer ID (remove dashes)
const formatCustomerId = (customerId: string): string => {
  return customerId.replace(/-/g, '');
};

// Helper to execute GAQL query using the search endpoint
const executeGaqlQuery = async (
  customerId: string,
  accessToken: string,
  query: string
): Promise<any[]> => {
  const formattedCustomerId = formatCustomerId(customerId);
  // Use 'search' endpoint (not searchStream) for standard REST API calls
  const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${formattedCustomerId}/googleAds:search`;
  
  console.log(`[Google Ads API] Executing query for customer: ${formattedCustomerId}`);
  console.log(`[Google Ads API] URL: ${url}`);
  console.log(`[Google Ads API] Query: ${query.substring(0, 200)}...`);
  
  // Check for developer token
  if (!ENV.GOOGLE_ADS_DEVELOPER_TOKEN) {
    console.error(`[Google Ads API] Missing developer token!`);
    throw new Error('Google Ads Developer Token is not configured. Please add GOOGLE_ADS_DEVELOPER_TOKEN to your .env file.');
  }
  
  console.log(`[Google Ads API] Developer token configured: ${ENV.GOOGLE_ADS_DEVELOPER_TOKEN.substring(0, 4)}...${ENV.GOOGLE_ADS_DEVELOPER_TOKEN.substring(ENV.GOOGLE_ADS_DEVELOPER_TOKEN.length - 4)}`);
  console.log(`[Google Ads API] Developer token length: ${ENV.GOOGLE_ADS_DEVELOPER_TOKEN.length} characters`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': ENV.GOOGLE_ADS_DEVELOPER_TOKEN,
        'login-customer-id': formattedCustomerId,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Google Ads API] Error response (${response.status}):`, errorText);
      
      // Parse error for better messaging
      try {
        const errorJson = JSON.parse(errorText);
        const errorMessage = errorJson.error?.message || errorText;
        throw new Error(`Google Ads API error: ${errorMessage}`);
      } catch {
        throw new Error(`Google Ads API error: ${response.status} - ${errorText.substring(0, 200)}`);
      }
    }

    const data = await response.json() as { results?: any[]; nextPageToken?: string };
    
    // search endpoint returns { results: [...], nextPageToken?: string }
    const results: any[] = data.results || [];
    
    console.log(`[Google Ads API] Retrieved ${results.length} results`);
    return results;
  } catch (error: any) {
    console.error(`[Google Ads API] Request failed:`, error.message);
    throw error;
  }
};

// Convert micros to actual value (Google Ads stores costs in micros)
const microsToValue = (micros: string | number): number => {
  return Number(micros) / 1000000;
};

class GoogleAdsDataService implements IGoogleAdsDataService {
  public async getAccessToken(projectId: string): Promise<string> {
    const connection = await googleAdsAuthService.getConnectionByProject(projectId);
    if (!connection) {
      throw new Error('Google Ads connection not found for this project');
    }

    if (connection.accessToken && connection.expiresAt && new Date() < connection.expiresAt) {
      return connection.accessToken;
    }

    if (connection.refreshToken) {
      const { accessToken, expiresAt } = await googleAdsAuthService.refreshAccessToken(connection.refreshToken);
      connection.accessToken = accessToken;
      connection.expiresAt = expiresAt || undefined;
      await connection.save();
      return accessToken;
    }

    throw new Error('Unable to obtain valid access token');
  }

  public async getOverviewMetrics(
    customerId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    console.log(`[Google Ads Data Service] Fetching overview metrics for customer: ${customerId}`);
    console.log(`[Google Ads Data Service] Date range: ${dateRange.startDate} to ${dateRange.endDate}`);
    
    const query = `
      SELECT
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_per_conversion,
        metrics.average_cpm,
        metrics.conversions_from_interactions_rate,
        metrics.interactions,
        metrics.interaction_rate
      FROM customer
      WHERE segments.date BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'
    `;

    try {
      const results = await executeGaqlQuery(customerId, accessToken, query);
      
      if (results.length === 0) {
        return {
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
          ctr: 0,
          averageCpc: 0,
          costPerConversion: 0,
          averageCpm: 0,
          conversionRate: 0,
          interactions: 0,
          interactionRate: 0,
        };
      }

      // Aggregate metrics across all results
      let totalImpressions = 0;
      let totalClicks = 0;
      let totalCostMicros = 0;
      let totalConversions = 0;
      let totalInteractions = 0;

      for (const result of results) {
        const metrics = result.metrics || {};
        totalImpressions += Number(metrics.impressions || 0);
        totalClicks += Number(metrics.clicks || 0);
        totalCostMicros += Number(metrics.costMicros || 0);
        totalConversions += Number(metrics.conversions || 0);
        totalInteractions += Number(metrics.interactions || 0);
      }

      const totalCost = microsToValue(totalCostMicros);
      
      return {
        impressions: totalImpressions,
        clicks: totalClicks,
        cost: totalCost,
        conversions: totalConversions,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        averageCpc: totalClicks > 0 ? totalCost / totalClicks : 0,
        costPerConversion: totalConversions > 0 ? totalCost / totalConversions : 0,
        averageCpm: totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : 0,
        conversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
        interactions: totalInteractions,
        interactionRate: totalImpressions > 0 ? (totalInteractions / totalImpressions) * 100 : 0,
      };
    } catch (error: any) {
      console.error(`[Google Ads Data Service] Error fetching overview:`, error.message);
      console.error(`[Google Ads Data Service] Full error:`, error);
      
      // Check for common API errors and provide helpful messages
      if (error.message.includes('UNIMPLEMENTED') || error.message.includes('Test Account mode')) {
        throw new Error(
          'Google Ads API Error: Developer token in Test Mode can only access TEST accounts. ' +
          '\n\nTo fix this:\n' +
          '1. Create a TEST Manager Account at: https://ads.google.com/aw/overview (use a separate Google account)\n' +
          '2. When creating, you\'ll see a blue button "Create a test manager account"\n' +
          '3. Create test client accounts under this test manager\n' +
          '4. Use the TEST client customer ID (will show "Test account" label in red)\n' +
          '5. OR apply for Standard Access at: https://ads.google.com/aw/apicenter'
        );
      }
      if (error.message.includes('PERMISSION_DENIED') || error.message.includes('permission')) {
        throw new Error('Permission denied. Verify: 1) Your Google Ads account has access to this customer ID, 2) Developer token is approved, 3) OAuth credentials are correct.');
      }
      if (error.message.includes('INVALID_CUSTOMER_ID') || error.message.includes('customer')) {
        throw new Error('Invalid Customer ID. Format should be: 1234567890 (10 digits, no dashes). Find it in your Google Ads account under "Customer ID".');
      }
      if (error.message.includes('INVALID_DEVELOPER_TOKEN') || error.message.includes('developer_token') || error.message.includes('developer-token')) {
        throw new Error('Invalid Developer Token. Please verify GOOGLE_ADS_DEVELOPER_TOKEN in your .env file. Get it from: https://ads.google.com/aw/apicenter');
      }
      if (error.message.includes('DEVELOPER_TOKEN_NOT_APPROVED') || error.message.includes('not approved')) {
        throw new Error(
          'Developer token not approved for this account type. ' +
          '\n\nTest tokens only work with TEST accounts. ' +
          '\nCreate a test manager account or apply for Standard Access.'
        );
      }
      
      throw new Error(`Failed to fetch Google Ads overview: ${error.message}`);
    }
  }

  public async getLocationData(
    customerId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    console.log(`[Google Ads Data Service] Fetching location data for customer: ${customerId}`);
    
    const query = `
      SELECT
        geographic_view.country_criterion_id,
        geographic_view.location_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
      FROM geographic_view
      WHERE segments.date BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'
        AND geographic_view.location_type = 'LOCATION_OF_PRESENCE'
      ORDER BY metrics.clicks DESC
      LIMIT 20
    `;

    try {
      const results = await executeGaqlQuery(customerId, accessToken, query);
      
      // Country code mapping (common ones)
      const countryCodeMap: Record<string, { name: string; code: string }> = {
        '2840': { name: 'United States', code: 'US' },
        '2826': { name: 'United Kingdom', code: 'GB' },
        '2124': { name: 'Canada', code: 'CA' },
        '2036': { name: 'Australia', code: 'AU' },
        '2356': { name: 'India', code: 'IN' },
        '2276': { name: 'Germany', code: 'DE' },
        '2250': { name: 'France', code: 'FR' },
        '2392': { name: 'Japan', code: 'JP' },
        '2076': { name: 'Brazil', code: 'BR' },
        '2484': { name: 'Mexico', code: 'MX' },
      };

      return results.map((result: any) => {
        const metrics = result.metrics || {};
        const geoView = result.geographicView || {};
        const countryId = geoView.countryCriterionId || '0';
        const countryInfo = countryCodeMap[countryId] || { name: `Country ${countryId}`, code: 'XX' };
        
        return {
          country: countryInfo.name,
          countryCode: countryInfo.code,
          impressions: Number(metrics.impressions || 0),
          clicks: Number(metrics.clicks || 0),
          cost: microsToValue(metrics.costMicros || 0),
          conversions: Number(metrics.conversions || 0),
          ctr: Number(metrics.ctr || 0) * 100,
          averageCpc: microsToValue(metrics.averageCpc || 0),
        };
      });
    } catch (error: any) {
      console.error(`[Google Ads Data Service] Error fetching locations:`, error.message);
      throw new Error(`Failed to fetch Google Ads location data: ${error.message}`);
    }
  }

  public async getDeviceData(
    customerId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    console.log(`[Google Ads Data Service] Fetching device data for customer: ${customerId}`);
    
    const query = `
      SELECT
        segments.device,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
      FROM campaign
      WHERE segments.date BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'
    `;

    try {
      const results = await executeGaqlQuery(customerId, accessToken, query);
      
      // Aggregate by device
      const deviceMap: Record<string, any> = {};
      
      for (const result of results) {
        const metrics = result.metrics || {};
        const segments = result.segments || {};
        const device = segments.device || 'UNKNOWN';
        
        if (!deviceMap[device]) {
          deviceMap[device] = {
            device: device,
            impressions: 0,
            clicks: 0,
            costMicros: 0,
            conversions: 0,
          };
        }
        
        deviceMap[device].impressions += Number(metrics.impressions || 0);
        deviceMap[device].clicks += Number(metrics.clicks || 0);
        deviceMap[device].costMicros += Number(metrics.costMicros || 0);
        deviceMap[device].conversions += Number(metrics.conversions || 0);
      }

      const deviceNameMap: Record<string, string> = {
        'MOBILE': 'Mobile',
        'DESKTOP': 'Desktop',
        'TABLET': 'Tablet',
        'CONNECTED_TV': 'Connected TV',
        'OTHER': 'Other',
        'UNKNOWN': 'Unknown',
      };

      return Object.values(deviceMap).map((d: any) => ({
        device: deviceNameMap[d.device] || d.device,
        impressions: d.impressions,
        clicks: d.clicks,
        cost: microsToValue(d.costMicros),
        conversions: d.conversions,
        ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
        averageCpc: d.clicks > 0 ? microsToValue(d.costMicros) / d.clicks : 0,
      }));
    } catch (error: any) {
      console.error(`[Google Ads Data Service] Error fetching devices:`, error.message);
      throw new Error(`Failed to fetch Google Ads device data: ${error.message}`);
    }
  }

  public async getCampaigns(
    customerId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    console.log(`[Google Ads Data Service] Fetching campaigns for customer: ${customerId}`);
    
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions_from_interactions_rate,
        metrics.cost_per_conversion
      FROM campaign
      WHERE segments.date BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'
      ORDER BY metrics.clicks DESC
      LIMIT 50
    `;

    try {
      const results = await executeGaqlQuery(customerId, accessToken, query);
      
      // Aggregate by campaign
      const campaignMap: Record<string, any> = {};
      
      for (const result of results) {
        const campaign = result.campaign || {};
        const metrics = result.metrics || {};
        const campaignId = campaign.id || '0';
        
        if (!campaignMap[campaignId]) {
          campaignMap[campaignId] = {
            id: campaignId,
            name: campaign.name || 'Unknown Campaign',
            status: campaign.status || 'UNKNOWN',
            impressions: 0,
            clicks: 0,
            costMicros: 0,
            conversions: 0,
          };
        }
        
        campaignMap[campaignId].impressions += Number(metrics.impressions || 0);
        campaignMap[campaignId].clicks += Number(metrics.clicks || 0);
        campaignMap[campaignId].costMicros += Number(metrics.costMicros || 0);
        campaignMap[campaignId].conversions += Number(metrics.conversions || 0);
      }

      return Object.values(campaignMap).map((c: any) => {
        const cost = microsToValue(c.costMicros);
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          impressions: c.impressions,
          clicks: c.clicks,
          cost: cost,
          conversions: c.conversions,
          ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
          averageCpc: c.clicks > 0 ? cost / c.clicks : 0,
          conversionRate: c.clicks > 0 ? (c.conversions / c.clicks) * 100 : 0,
          costPerConversion: c.conversions > 0 ? cost / c.conversions : 0,
        };
      });
    } catch (error: any) {
      console.error(`[Google Ads Data Service] Error fetching campaigns:`, error.message);
      throw new Error(`Failed to fetch Google Ads campaigns: ${error.message}`);
    }
  }

  public async getKeywords(
    customerId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    console.log(`[Google Ads Data Service] Fetching keywords for customer: ${customerId}`);
    
    const query = `
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.quality_info.quality_score,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions_from_interactions_rate,
        metrics.cost_per_conversion
      FROM keyword_view
      WHERE segments.date BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'
        AND ad_group_criterion.status != 'REMOVED'
      ORDER BY metrics.clicks DESC
      LIMIT 100
    `;

    try {
      const results = await executeGaqlQuery(customerId, accessToken, query);
      
      return results.map((result: any) => {
        const criterion = result.adGroupCriterion || {};
        const keyword = criterion.keyword || {};
        const qualityInfo = criterion.qualityInfo || {};
        const metrics = result.metrics || {};
        const cost = microsToValue(metrics.costMicros || 0);
        const clicks = Number(metrics.clicks || 0);
        const conversions = Number(metrics.conversions || 0);
        
        return {
          id: criterion.criterionId || '0',
          keyword: keyword.text || 'Unknown',
          matchType: keyword.matchType || 'UNKNOWN',
          impressions: Number(metrics.impressions || 0),
          clicks: clicks,
          cost: cost,
          conversions: conversions,
          ctr: Number(metrics.ctr || 0) * 100,
          averageCpc: microsToValue(metrics.averageCpc || 0),
          conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
          costPerConversion: conversions > 0 ? cost / conversions : 0,
          qualityScore: qualityInfo.qualityScore || null,
        };
      });
    } catch (error: any) {
      console.error(`[Google Ads Data Service] Error fetching keywords:`, error.message);
      throw new Error(`Failed to fetch Google Ads keywords: ${error.message}`);
    }
  }
}

export default new GoogleAdsDataService();
