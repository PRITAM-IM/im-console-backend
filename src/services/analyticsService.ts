import gaDataService from './gaDataService';
import AnalyticsCache from '../models/AnalyticsCache';
import { Types } from 'mongoose';

export interface IAnalyticsService {
  getOverviewMetrics(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getSessionChannels(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getConversionsByChannel(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getGeoData(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getDeviceData(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getTopLandingPages(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getSessionSources(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getBrowserData(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getCampaignData(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getSourceMediumCampaign(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getRevenueMetrics(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getTimeBasedAnalytics(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getGoogleAdsCampaigns(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getSessionSourceMedium(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any>;
  getCachedData(projectId: string, reportType: string, dateRange: string): Promise<any>;
  cacheData(projectId: string, reportType: string, dateRange: string, data: any): Promise<void>;
}

class AnalyticsService implements IAnalyticsService {
  private CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  public async getCachedData(projectId: string, reportType: string, dateRange: string): Promise<any> {
    const cacheEntry = await AnalyticsCache.findOne({
      projectId: new Types.ObjectId(projectId),
      reportType,
      dateRange,
      expiresAt: { $gt: new Date() },
    });

    return cacheEntry ? cacheEntry.data : null;
  }

  public async cacheData(projectId: string, reportType: string, dateRange: string, data: any): Promise<void> {
    const expiresAt = new Date(Date.now() + this.CACHE_DURATION);

    await AnalyticsCache.findOneAndUpdate(
      {
        projectId: new Types.ObjectId(projectId),
        reportType,
        dateRange,
      },
      {
        projectId: new Types.ObjectId(projectId),
        reportType,
        dateRange,
        data,
        expiresAt,
      },
      {
        upsert: true,
        new: true,
      }
    );
  }

  /**
   * Calculate date range for comparison period
   * Matches DM Cockpit's approach: shifts the entire date range backwards by its duration
   * Example: Viewing Jan 15-21 (7 days) compares to Jan 8-14 (previous 7 days)
   */
  private calculateComparisonPeriod(startDate: string, endDate: string): { startDate: string; endDate: string } {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Calculate the duration in days
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Shift both start and end backwards by the duration + 1 day to avoid overlap
    // This matches DM Cockpit's comparison logic
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - diffDays);
    
    return {
      startDate: prevStart.toISOString().split('T')[0],
      endDate: prevEnd.toISOString().split('T')[0]
    };
  }

  /**
   * Calculate percentage change between current and previous values
   * Matches DM Cockpit's calculation: ((current - previous) / previous) * 100
   * Handles edge cases for division by zero
   */
  private calculatePercentageChange(current: number, previous: number): number {
    // If previous is zero or very close to zero
    if (previous === 0 || Math.abs(previous) < 0.0001) {
      // If current is also zero, no change
      if (current === 0 || Math.abs(current) < 0.0001) {
        return 0;
      }
      // If previous was zero but current has value, show as 100% increase
      return current > 0 ? 100 : -100;
    }
    
    // Standard percentage change calculation
    const change = ((current - previous) / previous) * 100;
    
    // Cap at reasonable limits to avoid displaying extreme values
    // DM Cockpit appears to cap at around ±1000%
    if (change > 1000) return 1000;
    if (change < -1000) return -1000;
    
    return change;
  }

  public async getOverviewMetrics(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'overview';
    const dateRange = `${startDate}_${endDate}`;
    
    // Check cache first
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    // Get access token
    const accessToken = await gaDataService.getAccessToken(projectId);

    // Calculate comparison period
    const comparisonPeriod = this.calculateComparisonPeriod(startDate, endDate);

    // Split metrics into two requests (max 10 metrics per request)
    // First request: Core metrics (10 metrics)
    const metrics1 = [
      'totalUsers',
      'sessions',
      'engagementRate',
      'averageSessionDuration',
      'bounceRate',
      'newUsers',
      'conversions',
      'eventCount',
      'engagedSessions',
      'totalRevenue',
    ];

    // Second request: Additional revenue metrics (2 metrics)
    const metrics2 = [
      'purchaseRevenue',
      'averageRevenuePerUser',
    ];

    console.log(`Fetching overview metrics for property ${propertyId} from ${startDate} to ${endDate}`);
    console.log(`Fetching comparison metrics for property ${propertyId} from ${comparisonPeriod.startDate} to ${comparisonPeriod.endDate}`);

    // Run both reports in parallel for current and previous periods
    const [response1, response2, prevResponse1, prevResponse2] = await Promise.all([
      gaDataService.runReport(
        propertyId,
        accessToken,
        [],
        metrics1,
        [{ startDate, endDate }]
      ),
      gaDataService.runReport(
        propertyId,
        accessToken,
        [],
        metrics2,
        [{ startDate, endDate }]
      ),
      // Previous period - metrics1
      gaDataService.runReport(
        propertyId,
        accessToken,
        [],
        metrics1,
        [{ startDate: comparisonPeriod.startDate, endDate: comparisonPeriod.endDate }]
      ),
      // Previous period - metrics2
      gaDataService.runReport(
        propertyId,
        accessToken,
        [],
        metrics2,
        [{ startDate: comparisonPeriod.startDate, endDate: comparisonPeriod.endDate }]
      ),
    ]);

    // Process data - handle empty responses (common for newly added properties)
    // Transform to match frontend OverviewMetrics interface: { totalUsers, sessions, pageviews, bounceRate }
    let metricValues: { [key: string]: number } = {};
    let prevMetricValues: { [key: string]: number } = {};
    
    // Process first response
    const allMetrics = [...metrics1, ...metrics2];
    
    if (!response1.rows || response1.rows.length === 0) {
      console.warn(`No data returned for property ${propertyId} - property may be new or have no data in date range`);
      // Return zeros for all metrics
      allMetrics.forEach(metric => {
        metricValues[metric] = 0;
      });
    } else {
      // Extract metric values from first response
      const row1 = response1.rows[0];
      if (row1?.metricValues) {
        row1.metricValues.forEach((metric: any, index: number) => {
          const metricName = metrics1[index];
          // Convert string values to numbers, handle percentages and durations
          let value = parseFloat(metric.value || '0');
          
          // Handle percentage metrics (engagementRate, bounceRate)
          if (metricName === 'engagementRate' || metricName === 'bounceRate') {
            value = value * 100; // Convert to percentage (0.5 -> 50)
          }
          
          // Handle duration metrics (averageSessionDuration is in seconds)
          if (metricName === 'averageSessionDuration') {
            value = value / 60; // Convert to minutes
          }
          
          metricValues[metricName] = isNaN(value) ? 0 : value;
        });
      }
    }

    // Process second response
    if (response2.rows && response2.rows.length > 0) {
      const row2 = response2.rows[0];
      if (row2?.metricValues) {
        row2.metricValues.forEach((metric: any, index: number) => {
          const metricName = metrics2[index];
          const value = parseFloat(metric.value || '0');
          metricValues[metricName] = isNaN(value) ? 0 : value;
        });
      }
    }
    
    // Ensure all metrics are present (fill missing ones with 0)
    allMetrics.forEach(metric => {
      if (!(metric in metricValues)) {
        metricValues[metric] = 0;
      }
    });

    // Process previous period data
    if (!prevResponse1.rows || prevResponse1.rows.length === 0) {
      console.warn(`No previous period data returned for property ${propertyId}`);
      allMetrics.forEach(metric => {
        prevMetricValues[metric] = 0;
      });
    } else {
      const prevRow = prevResponse1.rows[0];
      if (prevRow?.metricValues) {
        prevRow.metricValues.forEach((metric: any, index: number) => {
          const metricName = metrics1[index];
          const value = parseFloat(metric.value || '0');
          prevMetricValues[metricName] = isNaN(value) ? 0 : value;
        });
      }
    }

    // Process second response for previous period
    if (prevResponse2 && prevResponse2.rows && prevResponse2.rows.length > 0) {
      const prevRow = prevResponse2.rows[0];
      if (prevRow?.metricValues) {
        prevRow.metricValues.forEach((metric: any, index: number) => {
          const metricName = metrics2[index];
          const value = parseFloat(metric.value || '0');
          prevMetricValues[metricName] = isNaN(value) ? 0 : value;
        });
      }
    }

    // Ensure all previous metrics are present
    allMetrics.forEach(metric => {
      if (!(metric in prevMetricValues)) {
        prevMetricValues[metric] = 0;
      }
    });

    // Transform to frontend format - comprehensive metrics like DM Cockpit with comparison data
    const data = {
      totalUsers: metricValues.totalUsers || 0,
      totalUsersChange: this.calculatePercentageChange(metricValues.totalUsers || 0, prevMetricValues.totalUsers || 0),
      sessions: metricValues.sessions || 0,
      sessionsChange: this.calculatePercentageChange(metricValues.sessions || 0, prevMetricValues.sessions || 0),
      pageviews: metricValues.eventCount || 0, // Using eventCount as pageviews
      pageviewsChange: this.calculatePercentageChange(metricValues.eventCount || 0, prevMetricValues.eventCount || 0),
      bounceRate: metricValues.bounceRate || 0,
      bounceRateChange: this.calculatePercentageChange(metricValues.bounceRate || 0, prevMetricValues.bounceRate || 0),
      // Behavioral metrics
      engagementRate: metricValues.engagementRate || 0,
      engagementRateChange: this.calculatePercentageChange(metricValues.engagementRate || 0, prevMetricValues.engagementRate || 0),
      averageSessionDuration: metricValues.averageSessionDuration || 0,
      averageSessionDurationChange: this.calculatePercentageChange(metricValues.averageSessionDuration || 0, prevMetricValues.averageSessionDuration || 0),
      engagedSessions: metricValues.engagedSessions || 0,
      engagedSessionsChange: this.calculatePercentageChange(metricValues.engagedSessions || 0, prevMetricValues.engagedSessions || 0),
      // User metrics
      newUsers: metricValues.newUsers || 0,
      newUsersChange: this.calculatePercentageChange(metricValues.newUsers || 0, prevMetricValues.newUsers || 0),
      // Conversion metrics
      conversions: metricValues.conversions || 0,
      conversionsChange: this.calculatePercentageChange(metricValues.conversions || 0, prevMetricValues.conversions || 0),
      // Revenue metrics
      totalRevenue: metricValues.totalRevenue || 0,
      totalRevenueChange: this.calculatePercentageChange(metricValues.totalRevenue || 0, prevMetricValues.totalRevenue || 0),
      purchaseRevenue: metricValues.purchaseRevenue || 0,
      purchaseRevenueChange: this.calculatePercentageChange(metricValues.purchaseRevenue || 0, prevMetricValues.purchaseRevenue || 0),
      averageRevenuePerUser: metricValues.averageRevenuePerUser || 0,
      averageRevenuePerUserChange: this.calculatePercentageChange(metricValues.averageRevenuePerUser || 0, prevMetricValues.averageRevenuePerUser || 0),
    };

    // Cache the data
    await this.cacheData(projectId, reportType, dateRange, data);

    return data;
  }

  public async getSessionChannels(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'sessionChannels';
    const dateRange = `${startDate}_${endDate}`;
    
    // Check cache first
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    // Get access token
    const accessToken = await gaDataService.getAccessToken(projectId);

    // Calculate comparison period
    const comparisonPeriod = this.calculateComparisonPeriod(startDate, endDate);

    // Define dimensions and metrics - comprehensive metrics for DM Cockpit format
    const dimensions = ['sessionDefaultChannelGroup'];
    // Split into two requests due to 10 metric limit
    const metrics1 = ['totalUsers', 'sessions', 'bounceRate', 'averageSessionDuration', 'totalRevenue'];
    const metrics2 = ['conversions', 'eventCount', 'engagementRate', 'engagedSessions', 'newUsers'];

    // Run both reports in parallel for current and previous periods - use allSettled to handle partial failures
    const [result1, result2, prevResult1, prevResult2] = await Promise.allSettled([
      gaDataService.runReport(
        propertyId,
        accessToken,
        dimensions,
        metrics1,
        [{ startDate, endDate }]
      ),
      gaDataService.runReport(
        propertyId,
        accessToken,
        dimensions,
        metrics2,
        [{ startDate, endDate }]
      ),
      // Previous period - metrics1
      gaDataService.runReport(
        propertyId,
        accessToken,
        dimensions,
        metrics1,
        [{ startDate: comparisonPeriod.startDate, endDate: comparisonPeriod.endDate }]
      ),
      // Previous period - metrics2
      gaDataService.runReport(
        propertyId,
        accessToken,
        dimensions,
        metrics2,
        [{ startDate: comparisonPeriod.startDate, endDate: comparisonPeriod.endDate }]
      ),
    ]);

    // Extract responses or handle errors
    const response1 = result1.status === 'fulfilled' ? result1.value : null;
    const response2 = result2.status === 'fulfilled' ? result2.value : null;
    const prevResponse1 = prevResult1.status === 'fulfilled' ? prevResult1.value : null;
    const prevResponse2 = prevResult2.status === 'fulfilled' ? prevResult2.value : null;

    // Log any failures
    if (result1.status === 'rejected') {
      console.error(`Failed to fetch metrics1 for channels (property ${propertyId}):`, result1.reason);
    }
    if (result2.status === 'rejected') {
      console.error(`Failed to fetch metrics2 for channels (property ${propertyId}):`, result2.reason);
    }
    if (prevResult1.status === 'rejected') {
      console.error(`Failed to fetch previous metrics1 for channels (property ${propertyId}):`, prevResult1.reason);
    }
    if (prevResult2.status === 'rejected') {
      console.error(`Failed to fetch previous metrics2 for channels (property ${propertyId}):`, prevResult2.reason);
    }

    // Process data - combine both responses
    const channelMap = new Map<string, any>();
    const prevChannelMap = new Map<string, any>();
    
    // Process first response
    if (response1?.rows && response1.rows.length > 0) {
      console.log(`Processing ${response1.rows.length} rows from metrics1 for property ${propertyId}`);
      response1.rows.forEach((row: any) => {
        const channel = row.dimensionValues?.[0]?.value || 'Unknown';
        channelMap.set(channel, {
          channel,
          totalUsers: parseInt(row.metricValues?.[0]?.value || '0', 10),
          sessions: parseInt(row.metricValues?.[1]?.value || '0', 10),
          bounceRate: parseFloat(row.metricValues?.[2]?.value || '0') * 100,
          averageSessionDuration: parseFloat(row.metricValues?.[3]?.value || '0'), // Keep in seconds for proper display
          totalRevenue: parseFloat(row.metricValues?.[4]?.value || '0'),
        });
      });
    } else {
      console.warn(`No rows in response1 for property ${propertyId}`);
    }

    // Process second response and merge
    if (response2?.rows && response2.rows.length > 0) {
      console.log(`Processing ${response2.rows.length} rows from metrics2 for property ${propertyId}`);
      response2.rows.forEach((row: any) => {
        const channel = row.dimensionValues?.[0]?.value || 'Unknown';
        const existing = channelMap.get(channel) || { channel };
        channelMap.set(channel, {
          ...existing,
          conversions: parseInt(row.metricValues?.[0]?.value || '0', 10),
          eventCount: parseInt(row.metricValues?.[1]?.value || '0', 10),
          engagementRate: parseFloat(row.metricValues?.[2]?.value || '0') * 100,
          engagedSessions: parseInt(row.metricValues?.[3]?.value || '0', 10),
          newUsers: parseInt(row.metricValues?.[4]?.value || '0', 10),
        });
      });
    } else {
      console.warn(`No rows in response2 for property ${propertyId}`);
    }

    // If we have channels from response2 but not response1, ensure they have default values
    if (channelMap.size === 0 && response2?.rows && response2.rows.length > 0) {
      console.warn(`Only response2 has data for property ${propertyId}, creating entries with default values`);
      response2.rows.forEach((row: any) => {
        const channel = row.dimensionValues?.[0]?.value || 'Unknown';
        if (!channelMap.has(channel)) {
          channelMap.set(channel, {
            channel,
            totalUsers: 0,
            sessions: 0,
            bounceRate: 0,
            averageSessionDuration: 0,
            totalRevenue: 0,
          });
        }
      });
    }

    // Process previous period data - first response
    if (prevResponse1?.rows && prevResponse1.rows.length > 0) {
      prevResponse1.rows.forEach((row: any) => {
        const channel = row.dimensionValues?.[0]?.value || 'Unknown';
        prevChannelMap.set(channel, {
          channel,
          totalUsers: parseInt(row.metricValues?.[0]?.value || '0', 10),
          sessions: parseInt(row.metricValues?.[1]?.value || '0', 10),
          bounceRate: parseFloat(row.metricValues?.[2]?.value || '0') * 100,
          averageSessionDuration: parseFloat(row.metricValues?.[3]?.value || '0'), // Keep in seconds
          totalRevenue: parseFloat(row.metricValues?.[4]?.value || '0'),
        });
      });
    }

    // Process previous period data - second response
    if (prevResponse2?.rows && prevResponse2.rows.length > 0) {
      prevResponse2.rows.forEach((row: any) => {
        const channel = row.dimensionValues?.[0]?.value || 'Unknown';
        const existing = prevChannelMap.get(channel) || { channel };
        prevChannelMap.set(channel, {
          ...existing,
          conversions: parseInt(row.metricValues?.[0]?.value || '0', 10),
          eventCount: parseInt(row.metricValues?.[1]?.value || '0', 10),
          engagementRate: parseFloat(row.metricValues?.[2]?.value || '0') * 100,
          engagedSessions: parseInt(row.metricValues?.[3]?.value || '0', 10),
          newUsers: parseInt(row.metricValues?.[4]?.value || '0', 10),
        });
      });
    }

    const rows = Array.from(channelMap.values());
    
    // Add comparison data for each channel
    const rowsWithComparison = rows.map((row: any) => {
      const prevData = prevChannelMap.get(row.channel) || {
        totalUsers: 0,
        sessions: 0,
        bounceRate: 0,
        averageSessionDuration: 0,
        totalRevenue: 0,
        conversions: 0,
        eventCount: 0,
        engagementRate: 0,
        engagedSessions: 0,
        newUsers: 0,
      };

      return {
        ...row,
        totalUsersChange: this.calculatePercentageChange(row.totalUsers || 0, prevData.totalUsers || 0),
        sessionsChange: this.calculatePercentageChange(row.sessions || 0, prevData.sessions || 0),
        bounceRateChange: this.calculatePercentageChange(row.bounceRate || 0, prevData.bounceRate || 0),
        averageSessionDurationChange: this.calculatePercentageChange(row.averageSessionDuration || 0, prevData.averageSessionDuration || 0),
        totalRevenueChange: this.calculatePercentageChange(row.totalRevenue || 0, prevData.totalRevenue || 0),
        conversionsChange: this.calculatePercentageChange(row.conversions || 0, prevData.conversions || 0),
        eventCountChange: this.calculatePercentageChange(row.eventCount || 0, prevData.eventCount || 0),
        engagementRateChange: this.calculatePercentageChange(row.engagementRate || 0, prevData.engagementRate || 0),
        engagedSessionsChange: this.calculatePercentageChange(row.engagedSessions || 0, prevData.engagedSessions || 0),
        newUsersChange: this.calculatePercentageChange(row.newUsers || 0, prevData.newUsers || 0),
      };
    });
    
    // Sort by sessions descending and take top 10 for DM Cockpit
    const sortedRows = rowsWithComparison.sort((a: any, b: any) => b.sessions - a.sessions).slice(0, 10);
    
    // Log final result
    console.log(`Channel data for property ${propertyId}: ${sortedRows.length} channels found (top 10)`);
    if (sortedRows.length > 0) {
      console.log(`Sample channel data:`, JSON.stringify(sortedRows[0], null, 2));
    }
    
    // If no data, return empty array
    if (sortedRows.length === 0) {
      console.warn(`No channel data returned for property ${propertyId}`);
      return sortedRows;
    }

    // Cache the data
    await this.cacheData(projectId, reportType, dateRange, sortedRows);

    return sortedRows;
  }

  public async getConversionsByChannel(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'conversionsByChannel';
    const dateRange = `${startDate}_${endDate}`;
    
    // Check cache first
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    // Get access token
    const accessToken = await gaDataService.getAccessToken(projectId);

    // Define dimensions and metrics
    const dimensions = ['sessionDefaultChannelGroup'];
    const metrics = ['conversions'];

    // Run report
    const response = await gaDataService.runReport(
      propertyId,
      accessToken,
      dimensions,
      metrics,
      [{ startDate, endDate }]
    );

    // Process data
    const data = {
      rows: response.rows?.map((row: any) => ({
        channel: row.dimensionValues?.[0]?.value || 'Unknown',
        conversions: row.metricValues?.[0]?.value || 0,
      })) || [],
    };

    // Cache the data
    await this.cacheData(projectId, reportType, dateRange, data);

    return data;
  }

  public async getGeoData(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'geoData';
    const dateRange = `${startDate}_${endDate}`;
    
    // Check cache first
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    // Get access token
    const accessToken = await gaDataService.getAccessToken(projectId);

    // Define dimensions and metrics - matching DM Cockpit format
    const dimensions = ['country'];
    const metrics = ['totalUsers', 'sessions'];

    // Run report
    const response = await gaDataService.runReport(
      propertyId,
      accessToken,
      dimensions,
      metrics,
      [{ startDate, endDate }]
    );

    // Process data - transform to match frontend GeoMetric[] format
    const rows = response.rows?.map((row: any) => ({
      country: row.dimensionValues?.[0]?.value || 'Unknown',
      totalUsers: parseInt(row.metricValues?.[0]?.value || '0', 10),
      sessions: parseInt(row.metricValues?.[1]?.value || '0', 10),
    })) || [];
    
    // Sort by totalUsers descending and take top 10
    const sortedRows = rows.sort((a: any, b: any) => b.totalUsers - a.totalUsers).slice(0, 10);
    
    // If no data, return empty array (don't cache empty data)
    if (sortedRows.length === 0) {
      console.warn(`No geo data returned for property ${propertyId}`);
      return sortedRows;
    }

    // Cache the data
    await this.cacheData(projectId, reportType, dateRange, sortedRows);

    return sortedRows;
  }

  public async getDeviceData(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'deviceData';
    const dateRange = `${startDate}_${endDate}`;
    
    // Check cache first
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    // Get access token
    const accessToken = await gaDataService.getAccessToken(projectId);

    // Define dimensions and metrics
    const dimensions = ['deviceCategory'];
    const metrics = ['sessions'];

    // Run report
    const response = await gaDataService.runReport(
      propertyId,
      accessToken,
      dimensions,
      metrics,
      [{ startDate, endDate }]
    );

    // Process data - transform to match frontend DeviceMetric[] format
    const rows = response.rows?.map((row: any) => ({
      deviceCategory: row.dimensionValues?.[0]?.value || 'Unknown',
      device: row.dimensionValues?.[0]?.value || 'Unknown',
      sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
      value: parseInt(row.metricValues?.[0]?.value || '0', 10),
    })) || [];
    
    // If no data, return empty array (don't cache empty data)
    if (rows.length === 0) {
      console.warn(`No device data returned for property ${propertyId}`);
      return rows;
    }

    // Cache the data
    await this.cacheData(projectId, reportType, dateRange, rows);

    return rows;
  }

  public async getTopLandingPages(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'topLandingPages';
    const dateRange = `${startDate}_${endDate}`;
    
    // Check cache first
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    // Get access token
    const accessToken = await gaDataService.getAccessToken(projectId);

    // Define dimensions and metrics - landingPagePlusQueryString for more detail
    const dimensions = ['landingPagePlusQueryString'];
    const metrics = ['sessions', 'totalUsers', 'bounceRate', 'averageSessionDuration'];

    // Run report
    const response = await gaDataService.runReport(
      propertyId,
      accessToken,
      dimensions,
      metrics,
      [{ startDate, endDate }]
    );

    // Process data - transform to match frontend LandingPageMetric[] format
    const rows = response.rows?.map((row: any) => ({
      landingPage: row.dimensionValues?.[0]?.value || '(not set)',
      pagePath: row.dimensionValues?.[0]?.value || '(not set)',
      sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
      totalUsers: parseInt(row.metricValues?.[1]?.value || '0', 10),
      bounceRate: parseFloat(row.metricValues?.[2]?.value || '0') * 100,
      averageSessionDuration: parseFloat(row.metricValues?.[3]?.value || '0') / 60,
    })) || [];
    
    // Sort by sessions descending and take top 10
    const sortedRows = rows.sort((a: any, b: any) => b.sessions - a.sessions).slice(0, 10);
    
    // If no data, return empty array (don't cache empty data)
    if (sortedRows.length === 0) {
      console.warn(`No landing page data returned for property ${propertyId}`);
      return sortedRows;
    }

    // Cache the data
    await this.cacheData(projectId, reportType, dateRange, sortedRows);

    return sortedRows;
  }

  public async getSessionSources(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'sessionSources';
    const dateRange = `${startDate}_${endDate}`;
    
    // Check cache first
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    // Get access token
    const accessToken = await gaDataService.getAccessToken(projectId);

    // Define dimensions and metrics
    const dimensions = ['sessionSource', 'sessionMedium'];
    const metrics = ['sessions', 'conversions'];

    // Run report
    const response = await gaDataService.runReport(
      propertyId,
      accessToken,
      dimensions,
      metrics,
      [{ startDate, endDate }]
    );

    // Process data
    const data = {
      rows: response.rows?.map((row: any) => ({
        source: row.dimensionValues?.[0]?.value || 'Unknown',
        medium: row.dimensionValues?.[1]?.value || 'Unknown',
        sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
        conversions: parseInt(row.metricValues?.[1]?.value || '0', 10),
      })) || [],
    };

    // Cache the data
    await this.cacheData(projectId, reportType, dateRange, data);

    return data;
  }

  public async getBrowserData(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'browserData';
    const dateRange = `${startDate}_${endDate}`;
    
    // Check cache first
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    // Get access token
    const accessToken = await gaDataService.getAccessToken(projectId);

    // Define dimensions and metrics for browser performance
    const dimensions = ['browser'];
    const metrics = ['sessions', 'totalUsers', 'engagementRate', 'averageSessionDuration', 'bounceRate'];

    // Run report
    const response = await gaDataService.runReport(
      propertyId,
      accessToken,
      dimensions,
      metrics,
      [{ startDate, endDate }]
    );

    // Process data
    const rows = response.rows?.map((row: any) => ({
      browser: row.dimensionValues?.[0]?.value || 'Unknown',
      sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
      users: parseInt(row.metricValues?.[1]?.value || '0', 10),
      engagementRate: parseFloat(row.metricValues?.[2]?.value || '0') * 100,
      averageSessionDuration: parseFloat(row.metricValues?.[3]?.value || '0') / 60,
      bounceRate: parseFloat(row.metricValues?.[4]?.value || '0') * 100,
    })) || [];
    
    if (rows.length === 0) {
      console.warn(`No browser data returned for property ${propertyId}`);
      return rows;
    }

    await this.cacheData(projectId, reportType, dateRange, rows);
    return rows;
  }

  public async getCampaignData(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'campaignData';
    const dateRange = `${startDate}_${endDate}`;
    
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    const accessToken = await gaDataService.getAccessToken(projectId);
    const dimensions = ['sessionCampaignName'];
    const metrics = ['sessions', 'totalUsers', 'conversions', 'totalRevenue', 'engagementRate'];

    const response = await gaDataService.runReport(
      propertyId,
      accessToken,
      dimensions,
      metrics,
      [{ startDate, endDate }]
    );

    const rows = response.rows?.map((row: any) => ({
      campaign: row.dimensionValues?.[0]?.value || '(not set)',
      sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
      users: parseInt(row.metricValues?.[1]?.value || '0', 10),
      conversions: parseInt(row.metricValues?.[2]?.value || '0', 10),
      revenue: parseFloat(row.metricValues?.[3]?.value || '0'),
      engagementRate: parseFloat(row.metricValues?.[4]?.value || '0') * 100,
    })) || [];
    
    if (rows.length === 0) {
      console.warn(`No campaign data returned for property ${propertyId}`);
      return rows;
    }

    await this.cacheData(projectId, reportType, dateRange, rows);
    return rows;
  }

  public async getSourceMediumCampaign(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'sourceMediumCampaign';
    const dateRange = `${startDate}_${endDate}`;
    
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    const accessToken = await gaDataService.getAccessToken(projectId);
    const dimensions = ['sessionSource', 'sessionMedium', 'sessionCampaignName'];
    const metrics = ['sessions', 'totalUsers', 'conversions', 'totalRevenue', 'engagementRate', 'averageSessionDuration'];

    const response = await gaDataService.runReport(
      propertyId,
      accessToken,
      dimensions,
      metrics,
      [{ startDate, endDate }]
    );

    const rows = response.rows?.map((row: any) => ({
      source: row.dimensionValues?.[0]?.value || '(not set)',
      medium: row.dimensionValues?.[1]?.value || '(not set)',
      campaign: row.dimensionValues?.[2]?.value || '(not set)',
      sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
      users: parseInt(row.metricValues?.[1]?.value || '0', 10),
      conversions: parseInt(row.metricValues?.[2]?.value || '0', 10),
      revenue: parseFloat(row.metricValues?.[3]?.value || '0'),
      engagementRate: parseFloat(row.metricValues?.[4]?.value || '0') * 100,
      averageSessionDuration: parseFloat(row.metricValues?.[5]?.value || '0') / 60,
    })) || [];
    
    if (rows.length === 0) {
      console.warn(`No source/medium/campaign data returned for property ${propertyId}`);
      return rows;
    }

    await this.cacheData(projectId, reportType, dateRange, rows);
    return rows;
  }

  public async getRevenueMetrics(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'revenueMetrics';
    const dateRange = `${startDate}_${endDate}`;
    
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    const accessToken = await gaDataService.getAccessToken(projectId);
    const metrics = [
      'totalRevenue',
      'purchaseRevenue',
      'averageRevenuePerUser',
      'averagePurchaseRevenue',
      'totalPurchasers',
      'conversions',
    ];

    const response = await gaDataService.runReport(
      propertyId,
      accessToken,
      [],
      metrics,
      [{ startDate, endDate }]
    );

    let metricValues: { [key: string]: number } = {};
    
    if (!response.rows || response.rows.length === 0) {
      console.warn(`No revenue data returned for property ${propertyId}`);
      metrics.forEach(metric => {
        metricValues[metric] = 0;
      });
    } else {
      const row = response.rows[0];
      if (row?.metricValues) {
        row.metricValues.forEach((metric: any, index: number) => {
          const metricName = metrics[index];
          metricValues[metricName] = parseFloat(metric.value || '0');
        });
      }
      
      metrics.forEach(metric => {
        if (!(metric in metricValues)) {
          metricValues[metric] = 0;
        }
      });
    }

    const data = {
      totalRevenue: metricValues.totalRevenue || 0,
      purchaseRevenue: metricValues.purchaseRevenue || 0,
      averageRevenuePerUser: metricValues.averageRevenuePerUser || 0,
      averagePurchaseRevenue: metricValues.averagePurchaseRevenue || 0,
      totalPurchasers: metricValues.totalPurchasers || 0,
      conversions: metricValues.conversions || 0,
    };

    await this.cacheData(projectId, reportType, dateRange, data);
    return data;
  }

  public async getTimeBasedAnalytics(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'timeBasedAnalytics';
    const dateRange = `${startDate}_${endDate}`;
    
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    const accessToken = await gaDataService.getAccessToken(projectId);

    // Get hour of day data
    const hourResponse = await gaDataService.runReport(
      propertyId,
      accessToken,
      ['hour'],
      ['sessions', 'totalUsers'],
      [{ startDate, endDate }]
    );

    // Get day of week data
    const dayResponse = await gaDataService.runReport(
      propertyId,
      accessToken,
      ['dayOfWeek'],
      ['sessions', 'totalUsers', 'engagementRate'],
      [{ startDate, endDate }]
    );

    const hourData = hourResponse.rows?.map((row: any) => ({
      hour: parseInt(row.dimensionValues?.[0]?.value || '0', 10),
      sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
      users: parseInt(row.metricValues?.[1]?.value || '0', 10),
    })) || [];

    const dayData = dayResponse.rows?.map((row: any) => {
      const dayIndex = parseInt(row.dimensionValues?.[0]?.value || '0', 10);
      return {
        dayOfWeek: dayIndex,
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIndex] || 'Unknown',
        sessions: parseInt(row.metricValues?.[0]?.value || '0', 10),
        users: parseInt(row.metricValues?.[1]?.value || '0', 10),
        engagementRate: parseFloat(row.metricValues?.[2]?.value || '0') * 100,
      };
    }) || [];

    const data = {
      byHour: hourData,
      byDayOfWeek: dayData,
    };

    await this.cacheData(projectId, reportType, dateRange, data);
    return data;
  }

  public async getSessionSourceMedium(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'sessionSourceMedium';
    const dateRange = `${startDate}_${endDate}`;
    
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    const accessToken = await gaDataService.getAccessToken(projectId);
    
    // Session Source/Medium with comprehensive metrics
    const dimensions = ['sessionSource', 'sessionMedium'];
    const metrics = ['totalUsers', 'sessions', 'conversions'];

    const response = await gaDataService.runReport(
      propertyId,
      accessToken,
      dimensions,
      metrics,
      [{ startDate, endDate }]
    );

    const rows = response.rows?.map((row: any) => ({
      source: row.dimensionValues?.[0]?.value || '(direct)',
      medium: row.dimensionValues?.[1]?.value || '(none)',
      totalUsers: parseInt(row.metricValues?.[0]?.value || '0', 10),
      sessions: parseInt(row.metricValues?.[1]?.value || '0', 10),
      conversions: parseInt(row.metricValues?.[2]?.value || '0', 10),
    })) || [];
    
    // Sort by sessions descending and take top 10
    const sortedRows = rows.sort((a: any, b: any) => b.sessions - a.sessions).slice(0, 10);
    
    if (sortedRows.length === 0) {
      console.warn(`No session source/medium data returned for property ${propertyId}`);
      return sortedRows;
    }

    await this.cacheData(projectId, reportType, dateRange, sortedRows);
    return sortedRows;
  }

  public async getGoogleAdsCampaigns(projectId: string, propertyId: string, startDate: string, endDate: string): Promise<any> {
    const reportType = 'googleAdsCampaigns';
    const dateRange = `${startDate}_${endDate}`;
    
    const cachedData = await this.getCachedData(projectId, reportType, dateRange);
    if (cachedData) {
      return cachedData;
    }

    const accessToken = await gaDataService.getAccessToken(projectId);
    
    // Google Ads Campaign metrics
    const dimensions = ['googleAdsCampaignName'];
    const metrics = ['googleAdsClicks', 'googleAdsCost', 'googleAdsConversions', 'conversions'];

    const response = await gaDataService.runReport(
      propertyId,
      accessToken,
      dimensions,
      metrics,
      [{ startDate, endDate }]
    );

    const rows = response.rows?.map((row: any) => ({
      campaignName: row.dimensionValues?.[0]?.value || '(not set)',
      clicks: parseInt(row.metricValues?.[0]?.value || '0', 10),
      cost: parseFloat(row.metricValues?.[1]?.value || '0'),
      googleAdsConversions: parseFloat(row.metricValues?.[2]?.value || '0'),
      conversions: parseInt(row.metricValues?.[3]?.value || '0', 10),
    })) || [];
    
    // Sort by cost descending and take top 5
    const sortedRows = rows
      .filter((row: any) => row.campaignName !== '(not set)')
      .sort((a: any, b: any) => b.cost - a.cost)
      .slice(0, 5);
    
    if (sortedRows.length === 0) {
      console.warn(`No Google Ads campaign data returned for property ${propertyId}`);
      return sortedRows;
    }

    await this.cacheData(projectId, reportType, dateRange, sortedRows);
    return sortedRows;
  }
}

export default new AnalyticsService();