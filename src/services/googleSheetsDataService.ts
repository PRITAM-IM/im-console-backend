import { google } from 'googleapis';
import GoogleSheetsConnection from '../models/GoogleSheetsConnection';
import googleSheetsAuthService from './googleSheetsAuthService';
import { googleSheetsOauth2Client } from '../config/googleSheets';
import { Types } from 'mongoose';

export interface SheetData {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetDetails {
  spreadsheetId: string;
  title: string;
  locale: string;
  timeZone: string;
  sheets: SheetData[];
  url: string;
}

export interface SheetValues {
  range: string;
  values: any[][];
}

class GoogleSheetsDataService {
  private async getAccessToken(projectId: string): Promise<string> {
    const connection = await GoogleSheetsConnection.findOne({ 
      projectId: new Types.ObjectId(projectId) 
    });
    
    if (!connection) {
      throw new Error('Google Sheets connection not found for this project');
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    if (connection.expiresAt && connection.accessToken) {
      const expiresAt = new Date(connection.expiresAt);
      if (expiresAt.getTime() - now.getTime() > expiryBuffer) {
        return connection.accessToken;
      }
    }

    // Token is expired or about to expire, refresh it
    console.log('[Google Sheets Data Service] Refreshing access token...');
    const { accessToken, expiresAt } = await googleSheetsAuthService.refreshAccessToken(connection.refreshToken);
    
    // Update the connection with new token
    connection.accessToken = accessToken;
    connection.expiresAt = expiresAt ?? undefined;
    await connection.save();
    
    return accessToken;
  }

  public async getSpreadsheetDetails(projectId: string, spreadsheetId: string): Promise<SpreadsheetDetails> {
    const accessToken = await this.getAccessToken(projectId);
    
    googleSheetsOauth2Client.setCredentials({ access_token: accessToken });
    const sheets = google.sheets('v4');
    
    const response = await sheets.spreadsheets.get({
      auth: googleSheetsOauth2Client,
      spreadsheetId,
      includeGridData: false,
    });

    const data = response.data;
    
    return {
      spreadsheetId: data.spreadsheetId || spreadsheetId,
      title: data.properties?.title || 'Untitled',
      locale: data.properties?.locale || 'en_US',
      timeZone: data.properties?.timeZone || 'UTC',
      sheets: (data.sheets || []).map(sheet => ({
        sheetId: sheet.properties?.sheetId || 0,
        title: sheet.properties?.title || 'Sheet',
        rowCount: sheet.properties?.gridProperties?.rowCount || 0,
        columnCount: sheet.properties?.gridProperties?.columnCount || 0,
      })),
      url: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    };
  }

  public async getSheetValues(projectId: string, spreadsheetId: string, range: string): Promise<SheetValues> {
    const accessToken = await this.getAccessToken(projectId);
    
    googleSheetsOauth2Client.setCredentials({ access_token: accessToken });
    const sheets = google.sheets('v4');
    
    const response = await sheets.spreadsheets.values.get({
      auth: googleSheetsOauth2Client,
      spreadsheetId,
      range,
    });

    return {
      range: response.data.range || range,
      values: response.data.values || [],
    };
  }

  public async listSpreadsheets(projectId: string): Promise<any[]> {
    const accessToken = await this.getAccessToken(projectId);
    return googleSheetsAuthService.listSpreadsheets(accessToken);
  }
}

export default new GoogleSheetsDataService();

