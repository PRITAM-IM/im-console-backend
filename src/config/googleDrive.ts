/**
 * Google Drive Integration Configuration
 * 
 * ⚠️ REQUIRED GOOGLE CLOUD APIs:
 * 1. Google Drive API - For accessing files and folders
 *    Enable at: https://console.developers.google.com/apis/api/drive.googleapis.com
 */
import { google } from 'googleapis';
import { ENV } from './env';

// Initialize OAuth2 client for Google Drive
export const googleDriveOauth2Client = new google.auth.OAuth2(
  ENV.GOOGLE_DRIVE_CLIENT_ID,
  ENV.GOOGLE_DRIVE_CLIENT_SECRET,
  ENV.GOOGLE_DRIVE_REDIRECT_URL
);

// Scopes required for Google Drive API access
export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.file',
];

// Generate authentication URL for Google Drive
export const getGoogleDriveAuthUrl = (state?: string): string => {
  const authUrlOptions: any = {
    access_type: 'offline',
    scope: GOOGLE_DRIVE_SCOPES,
    include_granted_scopes: true,
    prompt: 'consent',
    response_type: 'code',
  };
  
  if (state) {
    authUrlOptions.state = state;
  }
  
  const authUrl = googleDriveOauth2Client.generateAuthUrl(authUrlOptions);
  
  console.log(`[Google Drive Config] Initializing OAuth2Client with redirect URI: ${ENV.GOOGLE_DRIVE_REDIRECT_URL}`);
  
  return authUrl;
};





