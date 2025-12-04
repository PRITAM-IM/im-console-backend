import { google } from 'googleapis';
import { ENV } from './env';

// Get the redirect URI - ensure it's the new one
const SEARCH_CONSOLE_REDIRECT_URI = process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URL || 'http://localhost:3000/api/gsc/callback';

// Verify we're using the correct redirect URI (not the old one)
if (SEARCH_CONSOLE_REDIRECT_URI.includes('/google-search-console/callback')) {
  console.error('[Google Search Console Config] ERROR: Using OLD redirect URI!');
  console.error('[Google Search Console Config] Old URI:', SEARCH_CONSOLE_REDIRECT_URI);
  console.error('[Google Search Console Config] Expected: http://localhost:3000/api/gsc/callback');
  throw new Error('Invalid redirect URI: Must use /api/gsc/callback, not /api/google-search-console/callback');
}

console.log(`[Google Search Console Config] Initializing OAuth2Client with redirect URI: ${SEARCH_CONSOLE_REDIRECT_URI}`);

// Initialize OAuth2 client for Google Search Console
export const googleSearchConsoleOauth2Client = new google.auth.OAuth2(
  ENV.GOOGLE_CLIENT_ID,
  ENV.GOOGLE_CLIENT_SECRET,
  SEARCH_CONSOLE_REDIRECT_URI
);

// Scopes required for Google Search Console API access
// https://www.googleapis.com/auth/webmasters.readonly: Read-only access to Search Console data
export const GOOGLE_SEARCH_CONSOLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly'
];

// Generate authentication URL for Google Search Console
export const getGoogleSearchConsoleAuthUrl = (state?: string): string => {
  // Use the same redirect URI that was used to initialize the OAuth2Client
  const redirectUri = SEARCH_CONSOLE_REDIRECT_URI;
  console.log(`[Google Search Console Config] Using redirect URI: ${redirectUri}`);
  
  // Double-check we're not using the old URI
  if (redirectUri.includes('/google-search-console/callback')) {
    console.error('[Google Search Console Config] CRITICAL ERROR: Still using old redirect URI!');
    throw new Error('Invalid redirect URI configuration');
  }
  
  const authUrlOptions: any = {
    access_type: 'offline',
    scope: GOOGLE_SEARCH_CONSOLE_SCOPES,
    include_granted_scopes: true,
    prompt: 'consent', // Force consent screen to get refresh token
    response_type: 'code', // Explicitly set response_type
  };
  
  if (state) {
    authUrlOptions.state = state;
  }
  
  const authUrl = googleSearchConsoleOauth2Client.generateAuthUrl(authUrlOptions);
  
  // Verify redirect_uri is in the generated URL
  if (!authUrl.includes('redirect_uri=')) {
    console.warn('[Google Search Console Config] Warning: redirect_uri not found in generated auth URL');
  } else {
    const redirectUriMatch = authUrl.match(/redirect_uri=([^&]+)/);
    if (redirectUriMatch) {
      const decodedRedirectUri = decodeURIComponent(redirectUriMatch[1]);
      console.log(`[Google Search Console Config] Generated auth URL contains redirect_uri: ${decodedRedirectUri}`);
    }
  }
  
  // Verify response_type is in the URL (generateAuthUrl should add it automatically)
  if (!authUrl.includes('response_type=')) {
    console.warn('[Google Search Console Config] Warning: response_type not found in generated auth URL');
  }
  
  return authUrl;
};

