/**
 * Google Business Profile Integration Configuration
 * 
 * ⚠️ REQUIRED GOOGLE CLOUD APIs:
 * 1. Google Business Profile API (formerly Google My Business API)
 *    Enable at: https://console.developers.google.com/apis/api/mybusinessbusinessinformation.googleapis.com
 * 2. Google My Business Account Management API
 *    Enable at: https://console.developers.google.com/apis/api/mybusinessaccountmanagement.googleapis.com
 */
import { google } from 'googleapis';
import { ENV } from './env';

// Initialize OAuth2 client for Google Business Profile
// Use the shared Google redirect URL to avoid redirect_uri_mismatch
export const googleBusinessProfileOauth2Client = new google.auth.OAuth2(
  ENV.GOOGLE_CLIENT_ID,
  ENV.GOOGLE_CLIENT_SECRET,
  ENV.GOOGLE_REDIRECT_URL  // Use shared Google redirect URL
);

// Scopes required for Google Business Profile API access
// business.manage: Full access to business profile and reviews
export const GOOGLE_BUSINESS_PROFILE_SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
];

// Generate authentication URL for Google Business Profile
export const getGoogleBusinessProfileAuthUrl = (projectId?: string): string => {
  const authUrlOptions: any = {
    access_type: 'offline',
    scope: GOOGLE_BUSINESS_PROFILE_SCOPES,
    include_granted_scopes: true,
    prompt: 'consent', // Force consent screen to get refresh token
    response_type: 'code',
  };
  
  // Encode service type and projectId in state parameter
  // Format: gbp:projectId
  if (projectId) {
    authUrlOptions.state = `gbp:${projectId}`;
  }
  
  const authUrl = googleBusinessProfileOauth2Client.generateAuthUrl(authUrlOptions);
  
  console.log(`[Google Business Profile Config] Initializing OAuth2Client with redirect URI: ${ENV.GOOGLE_REDIRECT_URL}`);
  console.log(`[Google Business Profile Config] State parameter: ${authUrlOptions.state}`);
  
  return authUrl;
};

