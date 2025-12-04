import { ENV } from './env';

// Facebook OAuth configuration
export const FACEBOOK_APP_ID = ENV.FACEBOOK_APP_ID;
export const FACEBOOK_APP_SECRET = ENV.FACEBOOK_APP_SECRET;
export const FACEBOOK_REDIRECT_URI = ENV.FACEBOOK_REDIRECT_URI;

// Validate Facebook configuration on module load
if (!FACEBOOK_APP_ID) {
  console.warn('[Facebook Config] WARNING: FACEBOOK_APP_ID is not set in environment variables');
  console.warn('[Facebook Config] Please ensure FACEBOOK_APP_ID is set in your .env file');
}

if (!FACEBOOK_APP_SECRET) {
  console.warn('[Facebook Config] WARNING: FACEBOOK_APP_SECRET is not set in environment variables');
}

if (!FACEBOOK_REDIRECT_URI) {
  console.warn('[Facebook Config] WARNING: FACEBOOK_REDIRECT_URI is not set in environment variables');
}

console.log('[Facebook Config] Initialized with:', {
  APP_ID: FACEBOOK_APP_ID ? `${FACEBOOK_APP_ID.substring(0, 4)}...` : 'NOT SET',
  APP_SECRET: FACEBOOK_APP_SECRET ? 'SET' : 'NOT SET',
  REDIRECT_URI: FACEBOOK_REDIRECT_URI,
});

// Facebook API base URL (v20.0 for Instagram Business API)
export const FACEBOOK_API_BASE_URL = 'https://graph.facebook.com/v20.0';

// Scopes required for Facebook Insights API access
// pages_read_engagement: Read page insights
// pages_read_user_content: Read user content on pages
// pages_show_list: Show list of pages user manages
// instagram_basic: Access Instagram Business Account data
export const FACEBOOK_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'read_insights',
  'instagram_basic',
  'instagram_manage_insights',
];

// Generate authentication URL for Facebook
export const getFacebookAuthUrl = (state?: string): string => {
  if (!FACEBOOK_APP_ID) {
    throw new Error('FACEBOOK_APP_ID is not configured. Please set it in your .env file.');
  }

  if (!FACEBOOK_REDIRECT_URI) {
    throw new Error('FACEBOOK_REDIRECT_URI is not configured. Please set it in your .env file.');
  }

  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: FACEBOOK_REDIRECT_URI,
    scope: FACEBOOK_SCOPES.join(','),
    response_type: 'code',
  });

  if (state) {
    params.append('state', state);
  }

  const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
  
  console.log('[Facebook Config] Generated auth URL with client_id:', FACEBOOK_APP_ID ? `${FACEBOOK_APP_ID.substring(0, 4)}...` : 'MISSING');
  
  return authUrl;
};

