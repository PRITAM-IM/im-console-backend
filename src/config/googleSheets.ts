/**
 * Google Sheets Integration Configuration
 * 
 * ⚠️ REQUIRED GOOGLE CLOUD APIs:
 * 1. Google Sheets API - For reading/writing spreadsheets
 *    Enable at: https://console.developers.google.com/apis/api/sheets.googleapis.com
 */
import { google } from 'googleapis';
import { ENV } from './env';

// Initialize OAuth2 client for Google Sheets
export const googleSheetsOauth2Client = new google.auth.OAuth2(
  ENV.GOOGLE_SHEETS_CLIENT_ID,
  ENV.GOOGLE_SHEETS_CLIENT_SECRET,
  ENV.GOOGLE_SHEETS_REDIRECT_URL
);

// Scopes required for Google Sheets API access
export const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
];

// Generate authentication URL for Google Sheets
export const getGoogleSheetsAuthUrl = (state?: string): string => {
  const authUrlOptions: any = {
    access_type: 'offline',
    scope: GOOGLE_SHEETS_SCOPES,
    include_granted_scopes: true,
    prompt: 'consent',
    response_type: 'code',
  };
  
  if (state) {
    authUrlOptions.state = state;
  }
  
  const authUrl = googleSheetsOauth2Client.generateAuthUrl(authUrlOptions);
  
  console.log(`[Google Sheets Config] Initializing OAuth2Client with redirect URI: ${ENV.GOOGLE_SHEETS_REDIRECT_URL}`);
  
  return authUrl;
};





