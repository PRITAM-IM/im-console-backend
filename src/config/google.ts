import { google } from 'googleapis';
import { ENV } from './env';

// Initialize OAuth2 client for GA4
export const oauth2Client = new google.auth.OAuth2(
  ENV.GOOGLE_CLIENT_ID,
  ENV.GOOGLE_CLIENT_SECRET,
  ENV.GOOGLE_REDIRECT_URL
);

// Initialize OAuth2 client for user authentication
export const userOauth2Client = new google.auth.OAuth2(
  ENV.GOOGLE_CLIENT_ID,
  ENV.GOOGLE_CLIENT_SECRET,
  ENV.GOOGLE_AUTH_REDIRECT_URL
);

// Scopes required for GA4 access
// analytics.readonly: Read-only access to Analytics data (for fetching reports)
// analytics.edit: Edit management entities (for listing properties via Admin API)
export const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/analytics.edit'
];

// Generate authentication URL
export const getAuthUrl = (state?: string): string => {
  const authUrlOptions: any = {
    access_type: 'offline',
    scope: SCOPES,
    include_granted_scopes: true,
    prompt: 'consent', // Force consent screen to get refresh token
  };
  
  if (state) {
    authUrlOptions.state = state;
  }
  
  return oauth2Client.generateAuthUrl(authUrlOptions);
};