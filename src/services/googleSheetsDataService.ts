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

  public async updateCellValue(
    projectId: string,
    spreadsheetId: string,
    range: string,
    value: any
  ): Promise<void> {
    const accessToken = await this.getAccessToken(projectId);
    
    googleSheetsOauth2Client.setCredentials({ access_token: accessToken });
    const sheets = google.sheets('v4');
    
    await sheets.spreadsheets.values.update({
      auth: googleSheetsOauth2Client,
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[value]],
      },
    });
  }

  public async updateRowValues(
    projectId: string,
    spreadsheetId: string,
    sheetName: string,
    rowIndex: number,
    values: { [columnName: string]: any }
  ): Promise<void> {
    const accessToken = await this.getAccessToken(projectId);
    
    googleSheetsOauth2Client.setCredentials({ access_token: accessToken });
    const sheets = google.sheets('v4');

    // Get header row to find column indices
    const headerRange = `${sheetName}!1:1`;
    const headerResponse = await sheets.spreadsheets.values.get({
      auth: googleSheetsOauth2Client,
      spreadsheetId,
      range: headerRange,
    });

    const headers = headerResponse.data.values?.[0] || [];
    
    // Prepare batch update requests
    const updateRequests: any[] = [];
    
    for (const [columnName, value] of Object.entries(values)) {
      let columnIndex = headers.findIndex(
        (h: string) => h.toLowerCase() === columnName.toLowerCase()
      );

      // If column doesn't exist, add it
      if (columnIndex === -1) {
        headers.push(columnName);
        columnIndex = headers.length - 1;
        
        // Update header row
        await sheets.spreadsheets.values.update({
          auth: googleSheetsOauth2Client,
          spreadsheetId,
          range: headerRange,
          valueInputOption: 'RAW',
          requestBody: {
            values: [headers],
          },
        });
      }

      // Convert column index to letter (A, B, C, etc.)
      const columnLetter = this.columnIndexToLetter(columnIndex);
      const cellRange = `${sheetName}!${columnLetter}${rowIndex + 1}`;
      
      updateRequests.push({
        range: cellRange,
        values: [[value]],
      });
    }

    // Batch update all cells
    if (updateRequests.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        auth: googleSheetsOauth2Client,
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updateRequests,
        },
      });
    }
  }

  private columnIndexToLetter(index: number): string {
    let letter = '';
    while (index >= 0) {
      letter = String.fromCharCode((index % 26) + 65) + letter;
      index = Math.floor(index / 26) - 1;
    }
    return letter;
  }
}

export default new GoogleSheetsDataService();

