import { google } from 'googleapis';
import GoogleSheetsConnection, { IGoogleSheetsConnection } from '../models/GoogleSheetsConnection';
import { googleSheetsOauth2Client, getGoogleSheetsAuthUrl } from '../config/googleSheets';
import { Types } from 'mongoose';

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  sheetCount: number;
  locale?: string;
  timeZone?: string;
  url: string;
}

export interface IGoogleSheetsAuthService {
  generateAuthUrl(state?: string): string;
  handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }>;
  saveConnection(projectId: string, refreshToken: string, accessToken: string, expiresAt: Date | null): Promise<IGoogleSheetsConnection>;
  getConnectionByProject(projectId: string): Promise<IGoogleSheetsConnection | null>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }>;
  listSpreadsheets(accessToken: string): Promise<SpreadsheetInfo[]>;
}

class GoogleSheetsAuthService implements IGoogleSheetsAuthService {
  public generateAuthUrl(state?: string): string {
    return getGoogleSheetsAuthUrl(state);
  }

  public async handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }> {
    const { tokens } = await googleSheetsOauth2Client.getToken(code);
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
  ): Promise<IGoogleSheetsConnection> {
    try {
      console.log(`[Google Sheets Auth Service] Saving connection for project: ${projectId}`);
      
      if (!Types.ObjectId.isValid(projectId)) {
        throw new Error(`Invalid project ID format: ${projectId}`);
      }

      const projectObjectId = new Types.ObjectId(projectId);
      
      const deleteResult = await GoogleSheetsConnection.deleteMany({ projectId: projectObjectId });
      console.log(`[Google Sheets Auth Service] Deleted ${deleteResult.deletedCount} existing connection(s)`);

      const connection = await GoogleSheetsConnection.create({
        projectId: projectObjectId,
        refreshToken,
        accessToken,
        expiresAt,
      });

      console.log(`[Google Sheets Auth Service] Connection created successfully - ID: ${connection._id}`);
      
      return connection;
    } catch (error: any) {
      console.error(`[Google Sheets Auth Service] Error saving connection:`, error);
      throw error;
    }
  }

  public async getConnectionByProject(projectId: string): Promise<IGoogleSheetsConnection | null> {
    return await GoogleSheetsConnection.findOne({ projectId: new Types.ObjectId(projectId) });
  }

  public async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    googleSheetsOauth2Client.setCredentials({ refresh_token: refreshToken });
    
    try {
      const { credentials } = await googleSheetsOauth2Client.refreshAccessToken();
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

  public async listSpreadsheets(accessToken: string): Promise<SpreadsheetInfo[]> {
    try {
      console.log('[Google Sheets Auth Service] Fetching spreadsheets...');
      
      const drive = google.drive('v3');
      googleSheetsOauth2Client.setCredentials({ access_token: accessToken });
      
      const response = await drive.files.list({
        auth: googleSheetsOauth2Client,
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        fields: 'files(id, name, webViewLink)',
        pageSize: 50,
        orderBy: 'modifiedTime desc',
      });

      const spreadsheets: SpreadsheetInfo[] = [];

      if (response.data.files) {
        for (const file of response.data.files) {
          spreadsheets.push({
            spreadsheetId: file.id || '',
            title: file.name || 'Untitled',
            sheetCount: 0,
            url: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}`,
          });
        }
      }

      console.log(`[Google Sheets Auth Service] Found ${spreadsheets.length} spreadsheet(s)`);
      return spreadsheets;
    } catch (error: any) {
      console.error('[Google Sheets Auth Service] Error fetching spreadsheets:', error.message);
      return [];
    }
  }
}

export default new GoogleSheetsAuthService();





