/**
 * LinkedIn Integration Configuration
 * 
 * LinkedIn Sign In with OpenID Connect is used for:
 * - User authentication
 * - Basic profile information
 * 
 * Note: Organization/Company Page analytics require Marketing Developer Platform approval
 * Once approved, add scopes: r_organization_social, rw_organization_admin
 */
import { ENV } from './env';

// Single source of truth for LinkedIn OAuth configuration
export const LINKEDIN_CONFIG = {
  clientId: ENV.LINKEDIN_CLIENT_ID,
  clientSecret: ENV.LINKEDIN_CLIENT_SECRET,
  // IMPORTANT: This redirect URI must match EXACTLY what's configured in LinkedIn Developer Portal
  redirectUri: ENV.LINKEDIN_REDIRECT_URL || 'http://localhost:3000/api/linkedin/callback',
  authorizationUrl: 'https://www.linkedin.com/oauth/v2/authorization',
  tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
  apiBaseUrl: 'https://api.linkedin.com/v2',
};

// Scopes for LinkedIn Sign In with OpenID Connect
// These are the basic scopes available without special approval
export const LINKEDIN_SCOPES = [
  'openid',
  'profile', 
  'email',
];

// Encode state as base64 JSON (includes projectId)
export const encodeState = (data: { projectId: string }): string => {
  return Buffer.from(JSON.stringify(data)).toString('base64');
};

// Decode state from base64 JSON
export const decodeState = (state: string): { projectId: string } | null => {
  try {
    const decoded = Buffer.from(state, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('[LinkedIn Config] Failed to decode state:', error);
    return null;
  }
};

// Generate authentication URL for LinkedIn
export const getLinkedInAuthUrl = (projectId: string): string => {
  // Encode projectId in state parameter
  const state = encodeState({ projectId });
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINKEDIN_CONFIG.clientId,
    redirect_uri: LINKEDIN_CONFIG.redirectUri,
    scope: LINKEDIN_SCOPES.join(' '),
    state: state,
  });
  
  const authUrl = `${LINKEDIN_CONFIG.authorizationUrl}?${params.toString()}`;
  
  console.log('[LinkedIn Config] Generated auth URL with:');
  console.log('  - Client ID:', LINKEDIN_CONFIG.clientId ? `${LINKEDIN_CONFIG.clientId.substring(0, 8)}...` : 'NOT SET');
  console.log('  - Redirect URI:', LINKEDIN_CONFIG.redirectUri);
  console.log('  - Scopes:', LINKEDIN_SCOPES.join(' '));
  console.log('  - State (projectId):', projectId);
  
  return authUrl;
};

// LinkedIn token response type
interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

// Exchange authorization code for tokens
export const exchangeCodeForTokens = async (code: string): Promise<{
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  refreshTokenExpiresIn?: number;
}> => {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: LINKEDIN_CONFIG.redirectUri,
    client_id: LINKEDIN_CONFIG.clientId,
    client_secret: LINKEDIN_CONFIG.clientSecret,
  });

  const response = await fetch(LINKEDIN_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('[LinkedIn Config] Token exchange error:', errorData);
    throw new Error(`LinkedIn token exchange failed: ${response.status}`);
  }

  const data = await response.json() as LinkedInTokenResponse;

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token,
    refreshTokenExpiresIn: data.refresh_token_expires_in,
  };
};

// Refresh access token using refresh token
export const refreshAccessToken = async (refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> => {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: LINKEDIN_CONFIG.clientId,
    client_secret: LINKEDIN_CONFIG.clientSecret,
  });

  const response = await fetch(LINKEDIN_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('[LinkedIn Config] Token refresh error:', errorData);
    throw new Error('Failed to refresh LinkedIn access token');
  }

  const data = await response.json() as LinkedInTokenResponse;

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
};

