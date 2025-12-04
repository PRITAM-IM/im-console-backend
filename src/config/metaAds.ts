import { ENV } from './env';

// Meta Ads OAuth configuration (uses same App ID as Facebook Page Insights)
export const META_ADS_APP_ID = ENV.FACEBOOK_APP_ID; // Same app ID
export const META_ADS_APP_SECRET = ENV.FACEBOOK_APP_SECRET; // Same app secret
export const META_ADS_REDIRECT_URI = ENV.META_ADS_REDIRECT_URI;

// Meta Ads API base URL (v20.0)
export const META_ADS_API_BASE_URL = 'https://graph.facebook.com/v20.0';

// Scopes required for Meta Ads API access
// ads_read: Read ads data
// ads_management: Manage ads
// business_management: Manage business assets
export const META_ADS_SCOPES = [
  'ads_read',
  'ads_management',
  'business_management',
];

// Validate Meta Ads configuration on module load
if (!META_ADS_APP_ID) {
  console.warn('[Meta Ads Config] WARNING: FACEBOOK_APP_ID is not set (required for Meta Ads)');
}

if (!META_ADS_APP_SECRET) {
  console.warn('[Meta Ads Config] WARNING: FACEBOOK_APP_SECRET is not set (required for Meta Ads)');
}

if (!META_ADS_REDIRECT_URI) {
  console.warn('[Meta Ads Config] WARNING: META_ADS_REDIRECT_URI is not set in environment variables');
}

console.log('[Meta Ads Config] Initialized with:', {
  APP_ID: META_ADS_APP_ID ? `${META_ADS_APP_ID.substring(0, 4)}...` : 'NOT SET',
  APP_SECRET: META_ADS_APP_SECRET ? 'SET' : 'NOT SET',
  REDIRECT_URI: META_ADS_REDIRECT_URI,
  API_VERSION: 'v20.0',
});

// Generate authentication URL for Meta Ads
export const getMetaAdsAuthUrl = (state?: string): string => {
  if (!META_ADS_APP_ID) {
    throw new Error('FACEBOOK_APP_ID is not configured. Please set it in your .env file.');
  }

  if (!META_ADS_REDIRECT_URI) {
    throw new Error('META_ADS_REDIRECT_URI is not configured. Please set it in your .env file.');
  }

  const params = new URLSearchParams({
    client_id: META_ADS_APP_ID,
    redirect_uri: META_ADS_REDIRECT_URI,
    scope: META_ADS_SCOPES.join(','),
    response_type: 'code',
  });

  if (state) {
    params.append('state', state);
  }

  const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
  
  console.log('[Meta Ads Config] Generated auth URL with client_id:', META_ADS_APP_ID ? `${META_ADS_APP_ID.substring(0, 4)}...` : 'MISSING');
  
  return authUrl;
};

