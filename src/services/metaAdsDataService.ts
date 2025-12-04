import MetaAdsConnection from '../models/MetaAdsConnection';
import metaAdsAuthService from './metaAdsAuthService';
import { META_ADS_API_BASE_URL } from '../config/metaAds';
import { Types } from 'mongoose';

export interface IMetaAdsDataService {
  getAccessToken(projectId: string): Promise<string>;
  getInsights(accountId: string, accessToken: string, dateRange: { startDate: string; endDate: string }): Promise<any>;
  getCampaigns(accountId: string, accessToken: string, dateRange: { startDate: string; endDate: string }): Promise<any[]>;
  getAgeGenderBreakdown(accountId: string, accessToken: string, dateRange: { startDate: string; endDate: string }): Promise<any[]>;
  getPlatformBreakdown(accountId: string, accessToken: string, dateRange: { startDate: string; endDate: string }): Promise<any[]>;
  getDailyBreakdown(accountId: string, accessToken: string, dateRange: { startDate: string; endDate: string }): Promise<any[]>;
}

class MetaAdsDataService implements IMetaAdsDataService {
  public async getAccessToken(projectId: string): Promise<string> {
    const connection = await MetaAdsConnection.findOne({ projectId: new Types.ObjectId(projectId) });

    if (!connection) {
      throw new Error('Meta Ads connection not found for this project');
    }

    // Check if access token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expiresAt = connection.expiresAt || new Date(0);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (!connection.accessToken || expiresAt < fiveMinutesFromNow) {
      console.log('[Meta Ads Data Service] Access token expired or missing, refreshing...');
      const { accessToken, expiresAt: newExpiresAt } = await metaAdsAuthService.refreshAccessToken(connection.refreshToken);
      
      // Update connection with new token
      connection.accessToken = accessToken;
      connection.expiresAt = newExpiresAt ?? undefined;
      await connection.save();

      return accessToken;
    }

    return connection.accessToken;
  }

  public async getInsights(
    accountId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any> {
    console.log(`[Meta Ads Data Service] Fetching insights for account: ${accountId}`);
    console.log(`[Meta Ads Data Service] Date range: ${dateRange.startDate} to ${dateRange.endDate}`);
    
    // Format account ID - ensure it has act_ prefix
    const formattedAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    
    // Fields to request from Meta Ads API
    const fields = [
      'impressions',
      'clicks',
      'spend',
      'reach',
      'actions',
      'ctr',
      'cpc',
      'cpm',
      'conversions',
      'cost_per_action_type',
      'frequency',
    ].join(',');

    try {
      // Fetch account insights with date range
      const url = `${META_ADS_API_BASE_URL}/${formattedAccountId}/insights?` +
        `fields=${fields}&` +
        `time_range={"since":"${dateRange.startDate}","until":"${dateRange.endDate}"}&` +
        `level=account&` +
        `access_token=${accessToken}`;

      console.log(`[Meta Ads Data Service] Fetching from URL: ${url.substring(0, 100)}...`);

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Meta Ads Data Service] Error response:`, errorText);
        
        // Try to parse error for better message
        try {
          const errorJson = JSON.parse(errorText);
          const errorCode = errorJson.error?.code;
          const errorMessage = errorJson.error?.message || errorText;
          
          // Handle rate limiting
          if (errorCode === 4 || errorCode === 17 || errorMessage.includes('request limit')) {
            throw new Error('Meta Ads API rate limit reached. Please wait a few minutes and try again.');
          }
          
          // Handle permission errors
          if (errorCode === 200 || errorCode === 190) {
            throw new Error('Meta Ads permission error. Please reconnect your Meta Ads account.');
          }
          
          throw new Error(`Meta Ads API error: ${errorMessage}`);
        } catch (parseError: any) {
          if (parseError.message.includes('Meta Ads')) {
            throw parseError;
          }
          throw new Error(`Meta Ads API error: ${response.status} - ${errorText.substring(0, 200)}`);
        }
      }

      const data = await response.json() as { data?: any[] };
      
      // Process the insights data
      const result = {
        impressions: 0,
        clicks: 0,
        spend: 0,
        reach: 0,
        actions: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        conversions: 0,
        conversionRate: 0,
        costPerConversion: 0,
        frequency: 0,
      };

      if (data.data && data.data.length > 0) {
        const insight = data.data[0];
        
        result.impressions = parseInt(insight.impressions || '0', 10);
        result.clicks = parseInt(insight.clicks || '0', 10);
        result.spend = parseFloat(insight.spend || '0');
        result.reach = parseInt(insight.reach || '0', 10);
        result.ctr = parseFloat(insight.ctr || '0');
        result.cpc = parseFloat(insight.cpc || '0');
        result.cpm = parseFloat(insight.cpm || '0');
        result.frequency = parseFloat(insight.frequency || '0');
        
        // Process actions to get conversions
        if (insight.actions && Array.isArray(insight.actions)) {
          // Find conversion-related actions
          const conversionActions = insight.actions.filter((a: any) => 
            a.action_type === 'purchase' || 
            a.action_type === 'lead' || 
            a.action_type === 'complete_registration' ||
            a.action_type === 'omni_purchase' ||
            a.action_type === 'onsite_conversion.purchase'
          );
          
          result.conversions = conversionActions.reduce((sum: number, a: any) => 
            sum + parseInt(a.value || '0', 10), 0
          );
          
          // If no specific conversions, use total actions
          if (result.conversions === 0) {
            result.actions = insight.actions.reduce((sum: number, a: any) => 
              sum + parseInt(a.value || '0', 10), 0
            );
          }
        }

        // Process cost per action for conversions
        if (insight.cost_per_action_type && Array.isArray(insight.cost_per_action_type)) {
          const costPerConversion = insight.cost_per_action_type.find((c: any) => 
            c.action_type === 'purchase' || 
            c.action_type === 'lead' || 
            c.action_type === 'omni_purchase'
          );
          
          if (costPerConversion) {
            result.costPerConversion = parseFloat(costPerConversion.value || '0');
          }
        }

        // Calculate conversion rate
        if (result.clicks > 0 && result.conversions > 0) {
          result.conversionRate = (result.conversions / result.clicks) * 100;
        }
        
        // Calculate cost per conversion if not provided
        if (result.costPerConversion === 0 && result.conversions > 0 && result.spend > 0) {
          result.costPerConversion = result.spend / result.conversions;
        }
      }

      console.log(`[Meta Ads Data Service] Processed insights:`, result);
      return result;
    } catch (error: any) {
      console.error(`[Meta Ads Data Service] Error:`, error.message);
      throw new Error(`Failed to fetch Meta Ads insights: ${error.message}`);
    }
  }

  /**
   * Get campaign-level insights
   */
  public async getCampaigns(
    accountId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any[]> {
    console.log(`[Meta Ads Data Service] Fetching campaigns for account: ${accountId}`);
    
    const formattedAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    
    try {
      // First, get campaign list with status
      const campaignsUrl = `${META_ADS_API_BASE_URL}/${formattedAccountId}/campaigns?` +
        `fields=id,name,objective,status,effective_status&` +
        `limit=50&` +
        `access_token=${accessToken}`;

      const campaignsResponse = await fetch(campaignsUrl);
      let campaignMap: Record<string, any> = {};
      
      if (campaignsResponse.ok) {
        const campaignsData = await campaignsResponse.json() as { data?: any[] };
        if (campaignsData.data) {
          for (const c of campaignsData.data) {
            campaignMap[c.id] = {
              objective: c.objective || '',
              status: c.effective_status || c.status || 'UNKNOWN',
            };
          }
        }
      }

      // Now get insights at campaign level
      const insightsFields = [
        'campaign_name',
        'campaign_id',
        'impressions',
        'clicks',
        'spend',
        'reach',
        'ctr',
        'cpc',
        'cpm',
        'actions',
      ].join(',');

      const insightsUrl = `${META_ADS_API_BASE_URL}/${formattedAccountId}/insights?` +
        `fields=${insightsFields}&` +
        `time_range={"since":"${dateRange.startDate}","until":"${dateRange.endDate}"}&` +
        `level=campaign&` +
        `limit=50&` +
        `access_token=${accessToken}`;

      const response = await fetch(insightsUrl);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Meta Ads Data Service] Campaign insights error:`, errorText);
        return [];
      }

      const data = await response.json() as { data?: any[] };
      
      const campaigns = (data.data || []).map((c: any) => {
        // Calculate conversions from actions
        let conversions = 0;
        if (c.actions && Array.isArray(c.actions)) {
          const conversionActions = c.actions.filter((a: any) => 
            a.action_type === 'purchase' || 
            a.action_type === 'lead' || 
            a.action_type === 'omni_purchase'
          );
          conversions = conversionActions.reduce((sum: number, a: any) => 
            sum + parseInt(a.value || '0', 10), 0
          );
        }

        // Get campaign details from map
        const campaignDetails = campaignMap[c.campaign_id] || {};

        return {
          id: c.campaign_id,
          name: c.campaign_name || 'Unknown Campaign',
          objective: campaignDetails.objective || '',
          status: campaignDetails.status || 'ACTIVE',
          impressions: parseInt(c.impressions || '0', 10),
          clicks: parseInt(c.clicks || '0', 10),
          spend: parseFloat(c.spend || '0'),
          reach: parseInt(c.reach || '0', 10),
          ctr: parseFloat(c.ctr || '0'),
          cpc: parseFloat(c.cpc || '0'),
          cpm: parseFloat(c.cpm || '0'),
          conversions,
        };
      });

      console.log(`[Meta Ads Data Service] Found ${campaigns.length} campaigns with insights`);
      return campaigns;
    } catch (error: any) {
      console.error(`[Meta Ads Data Service] Campaigns error:`, error.message);
      return [];
    }
  }

  /**
   * Get age and gender breakdown
   */
  public async getAgeGenderBreakdown(
    accountId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any[]> {
    console.log(`[Meta Ads Data Service] Fetching age/gender breakdown`);
    
    const formattedAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    
    try {
      const url = `${META_ADS_API_BASE_URL}/${formattedAccountId}/insights?` +
        `fields=impressions,clicks,spend,reach&` +
        `time_range={"since":"${dateRange.startDate}","until":"${dateRange.endDate}"}&` +
        `breakdowns=age,gender&` +
        `level=account&` +
        `access_token=${accessToken}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Meta Ads Data Service] Age/Gender error:`, errorText);
        return [];
      }

      const data = await response.json() as { data?: any[] };
      
      const breakdown = (data.data || []).map((item: any) => ({
        age: item.age || 'Unknown',
        gender: item.gender || 'Unknown',
        impressions: parseInt(item.impressions || '0', 10),
        clicks: parseInt(item.clicks || '0', 10),
        spend: parseFloat(item.spend || '0'),
        reach: parseInt(item.reach || '0', 10),
      }));

      console.log(`[Meta Ads Data Service] Age/Gender breakdown: ${breakdown.length} entries`);
      return breakdown;
    } catch (error: any) {
      console.error(`[Meta Ads Data Service] Age/Gender error:`, error.message);
      return [];
    }
  }

  /**
   * Get platform breakdown (Facebook, Instagram, Audience Network)
   */
  public async getPlatformBreakdown(
    accountId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any[]> {
    console.log(`[Meta Ads Data Service] Fetching platform breakdown`);
    
    const formattedAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    
    try {
      const url = `${META_ADS_API_BASE_URL}/${formattedAccountId}/insights?` +
        `fields=impressions,clicks,spend,reach,ctr,cpc&` +
        `time_range={"since":"${dateRange.startDate}","until":"${dateRange.endDate}"}&` +
        `breakdowns=publisher_platform&` +
        `level=account&` +
        `access_token=${accessToken}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Meta Ads Data Service] Platform error:`, errorText);
        return [];
      }

      const data = await response.json() as { data?: any[] };
      
      const platformNames: Record<string, string> = {
        'facebook': 'Facebook',
        'instagram': 'Instagram',
        'audience_network': 'Audience Network',
        'messenger': 'Messenger',
      };

      const breakdown = (data.data || []).map((item: any) => ({
        platform: platformNames[item.publisher_platform] || item.publisher_platform || 'Unknown',
        impressions: parseInt(item.impressions || '0', 10),
        clicks: parseInt(item.clicks || '0', 10),
        spend: parseFloat(item.spend || '0'),
        reach: parseInt(item.reach || '0', 10),
        ctr: parseFloat(item.ctr || '0'),
        cpc: parseFloat(item.cpc || '0'),
      }));

      console.log(`[Meta Ads Data Service] Platform breakdown: ${breakdown.length} entries`);
      return breakdown;
    } catch (error: any) {
      console.error(`[Meta Ads Data Service] Platform error:`, error.message);
      return [];
    }
  }

  /**
   * Get daily breakdown for charts
   */
  public async getDailyBreakdown(
    accountId: string,
    accessToken: string,
    dateRange: { startDate: string; endDate: string }
  ): Promise<any[]> {
    console.log(`[Meta Ads Data Service] Fetching daily breakdown`);
    
    const formattedAccountId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    
    try {
      const url = `${META_ADS_API_BASE_URL}/${formattedAccountId}/insights?` +
        `fields=impressions,clicks,spend,reach,ctr,cpc,cpm&` +
        `time_range={"since":"${dateRange.startDate}","until":"${dateRange.endDate}"}&` +
        `time_increment=1&` +  // Daily breakdown
        `level=account&` +
        `access_token=${accessToken}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Meta Ads Data Service] Daily error:`, errorText);
        return [];
      }

      const data = await response.json() as { data?: any[] };
      
      const dailyData = (data.data || []).map((item: any) => ({
        date: item.date_start,
        impressions: parseInt(item.impressions || '0', 10),
        clicks: parseInt(item.clicks || '0', 10),
        spend: parseFloat(item.spend || '0'),
        reach: parseInt(item.reach || '0', 10),
        ctr: parseFloat(item.ctr || '0'),
        cpc: parseFloat(item.cpc || '0'),
        cpm: parseFloat(item.cpm || '0'),
      }));

      console.log(`[Meta Ads Data Service] Daily breakdown: ${dailyData.length} days`);
      return dailyData;
    } catch (error: any) {
      console.error(`[Meta Ads Data Service] Daily error:`, error.message);
      return [];
    }
  }
}

export default new MetaAdsDataService();
