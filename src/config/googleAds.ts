import { google } from 'googleapis';
import { ENV } from './env';

// Initialize OAuth2 client for Google Ads
export const googleAdsOauth2Client = new google.auth.OAuth2(
  ENV.GOOGLE_CLIENT_ID,
  ENV.GOOGLE_CLIENT_SECRET,
  ENV.GOOGLE_ADS_REDIRECT_URL
);

// Scopes required for Google Ads API access
// https://www.googleapis.com/auth/adwords: Full access to Google Ads account
export const GOOGLE_ADS_SCOPES = [
  'https://www.googleapis.com/auth/adwords'
];

// Generate authentication URL for Google Ads
export const getGoogleAdsAuthUrl = (state?: string): string => {
  const authUrlOptions: any = {
    access_type: 'offline',
    scope: GOOGLE_ADS_SCOPES,
    include_granted_scopes: true,
    prompt: 'consent', // Force consent screen to get refresh token
    response_type: 'code', // Explicitly set response_type (though generateAuthUrl should add this automatically)
  };
  
  if (state) {
    authUrlOptions.state = state;
  }
  
  const authUrl = googleAdsOauth2Client.generateAuthUrl(authUrlOptions);
  
  // Verify response_type is in the URL (generateAuthUrl should add it automatically)
  if (!authUrl.includes('response_type=')) {
    console.warn('[Google Ads Config] Warning: response_type not found in generated auth URL');
  }
  
  return authUrl;
};

