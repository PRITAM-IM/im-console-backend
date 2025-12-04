import dotenv from 'dotenv';
import path from 'path';

// Try multiple paths for .env file
// When running from backend/: .env (backend/.env)
// When running from root/: backend/.env
// When compiled: ../../.env (backend/.env)
const backendEnvPath = path.resolve(process.cwd(), '.env');
const srcBackendEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(process.cwd(), '../.env');

// Load .env file - try current working directory first (most reliable)
let envResult = dotenv.config({ path: backendEnvPath });
if (envResult.error) {
  // Try relative to source file (when running from backend/src/config/)
  envResult = dotenv.config({ path: srcBackendEnvPath });
  if (envResult.error) {
    // Try root directory
    envResult = dotenv.config({ path: rootEnvPath });
    if (envResult.error) {
      console.warn('[ENV Config] Could not load .env file. Tried:', backendEnvPath, srcBackendEnvPath, rootEnvPath);
    } else {
      console.log('[ENV Config] Loaded .env from root directory:', rootEnvPath);
    }
  } else {
    console.log('[ENV Config] Loaded .env from src relative path:', srcBackendEnvPath);
  }
} else {
  console.log('[ENV Config] Loaded .env from working directory:', backendEnvPath);
}

// Debug: Log Facebook config status
console.log('[ENV Config] Facebook Config Check:', {
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID ? `${process.env.FACEBOOK_APP_ID.substring(0, 4)}...` : 'NOT SET',
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET ? 'SET' : 'NOT SET',
  FACEBOOK_REDIRECT_URI: process.env.FACEBOOK_REDIRECT_URI || 'NOT SET',
});

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/hotel-analytics',
  JWT_SECRET: process.env.JWT_SECRET || 'hotel-analytics-jwt-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REDIRECT_URL: process.env.GOOGLE_REDIRECT_URL || 'http://localhost:3000/api/google/callback',
  GOOGLE_AUTH_REDIRECT_URL: process.env.GOOGLE_AUTH_REDIRECT_URL || 'http://localhost:3000/api/auth/google/callback',
  GOOGLE_USER_REDIRECT_URL: process.env.GOOGLE_USER_REDIRECT_URL || 'http://localhost:5173/auth/google/callback',
  GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
  GOOGLE_ADS_REDIRECT_URL: process.env.GOOGLE_ADS_REDIRECT_URL || 'http://localhost:3000/api/google-ads/callback',
  GOOGLE_SEARCH_CONSOLE_REDIRECT_URL: process.env.GOOGLE_SEARCH_CONSOLE_REDIRECT_URL || 'http://localhost:3000/api/gsc/callback',
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID || '',
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET || '',
  FACEBOOK_REDIRECT_URI: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3000/api/facebook/callback',
  META_ADS_REDIRECT_URI: process.env.META_ADS_REDIRECT_URI || 'http://localhost:3000/api/meta-ads/callback',
  YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
  YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
  YOUTUBE_REDIRECT_URL: process.env.YOUTUBE_REDIRECT_URL || 'http://localhost:3000/api/youtube/callback',
  // Google Sheets (uses same credentials as Google Drive)
  GOOGLE_SHEETS_CLIENT_ID: process.env.GOOGLE_SHEETS_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_SHEETS_CLIENT_SECRET: process.env.GOOGLE_SHEETS_CLIENT_SECRET || process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_SHEETS_REDIRECT_URL: process.env.GOOGLE_SHEETS_REDIRECT_URL || 'http://localhost:3000/api/google-sheets/callback',
  // Google Drive
  GOOGLE_DRIVE_CLIENT_ID: process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_DRIVE_CLIENT_SECRET: process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_DRIVE_REDIRECT_URL: process.env.GOOGLE_DRIVE_REDIRECT_URL || 'http://localhost:3000/api/google-drive/callback',
  // LinkedIn
  LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID || '',
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET || '',
  LINKEDIN_REDIRECT_URL: process.env.LINKEDIN_REDIRECT_URL || 'http://localhost:3000/api/linkedin/callback',
  // OpenRouter AI
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  // Google Business Profile
  GOOGLE_BUSINESS_PROFILE_REDIRECT_URL: process.env.GOOGLE_BUSINESS_PROFILE_REDIRECT_URL || 'http://localhost:3000/api/google-business-profile/callback',
};