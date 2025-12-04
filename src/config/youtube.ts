/**
 * YouTube Integration Configuration
 * 
 * ⚠️ REQUIRED GOOGLE CLOUD APIs (both must be enabled):
 * 1. YouTube Data API v3 - For fetching channel info, video details
 *    Enable at: https://console.developers.google.com/apis/api/youtube.googleapis.com
 * 
 * 2. YouTube Analytics API - For fetching analytics metrics (views, likes, watch time)
 *    Enable at: https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com
 */
import { google } from 'googleapis';
import { ENV } from './env';

// Initialize OAuth2 client for YouTube
export const youtubeOauth2Client = new google.auth.OAuth2(
  ENV.YOUTUBE_CLIENT_ID,
  ENV.YOUTUBE_CLIENT_SECRET,
  ENV.YOUTUBE_REDIRECT_URL
);

// Scopes required for YouTube Analytics API access
// https://www.googleapis.com/auth/youtube.readonly: View YouTube account
// https://www.googleapis.com/auth/yt-analytics.readonly: View YouTube Analytics reports
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtubepartner',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly'
];

// Generate authentication URL for YouTube
export const getYouTubeAuthUrl = (state?: string): string => {
  const authUrlOptions: any = {
    access_type: 'offline',
    scope: YOUTUBE_SCOPES,
    include_granted_scopes: true,
    prompt: 'consent', // Force consent screen to get refresh token
    response_type: 'code',
  };

  if (state) {
    authUrlOptions.state = state;
  }

  const authUrl = youtubeOauth2Client.generateAuthUrl(authUrlOptions);

  // Verify response_type is in the URL
  if (!authUrl.includes('response_type=')) {
    console.warn('[YouTube Config] Warning: response_type not found in generated auth URL');
  }

  console.log(`[YouTube Config] Initializing OAuth2Client with redirect URI: ${ENV.YOUTUBE_REDIRECT_URL}`);

  return authUrl;
};

