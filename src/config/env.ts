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

// Debug: Log Google Places API key status
console.log('[ENV Config] Google Places API Key Check:', {
  length: process.env.GOOGLE_PLACES_API_KEY?.length || 0,
  first20: process.env.GOOGLE_PLACES_API_KEY ? process.env.GOOGLE_PLACES_API_KEY.substring(0, 20) + '...' : 'NOT SET',
  hasNewlines: process.env.GOOGLE_PLACES_API_KEY?.includes('\n') || process.env.GOOGLE_PLACES_API_KEY?.includes('\r') ? 'YES - PROBLEM!' : 'No',
});

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/hotel-analytics',
  JWT_SECRET: process.env.JWT_SECRET || 'hotel-analytics-jwt-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  // Frontend URL for OAuth callbacks
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
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
  // Google Places API
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY || '',
  // OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4-turbo',
  OPENAI_MAX_TOKENS: process.env.OPENAI_MAX_TOKENS || '2000',
  // Pinecone Vector Database (Legacy - being replaced by Milvus)
  PINECONE_API_KEY: process.env.PINECONE_API_KEY || '',
  PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME || 'hotel-analytics-metrics',

  // Milvus / Zilliz Cloud (New Async RAG Architecture)
  MILVUS_ADDRESS: process.env.MILVUS_ADDRESS || '', // e.g., 'https://in03-xxxxx.api.gcp-us-west1.zillizcloud.com'
  MILVUS_TOKEN: process.env.MILVUS_TOKEN || '', // Zilliz Cloud API token
  MILVUS_SSL: process.env.MILVUS_SSL || 'true', // Use SSL for Zilliz Cloud

  // Background Sync Worker
  MILVUS_SYNC_ENABLED: process.env.MILVUS_SYNC_ENABLED || 'true',
  MILVUS_SYNC_CRON: process.env.MILVUS_SYNC_CRON || '0 * * * *', // Every hour by default

  // Event Discovery APIs
  SERPAPI_API_KEY: process.env.SERPAPI_API_KEY || '',
  EVENTBRITE_PRIVATE_TOKEN: process.env.EVENTBRITE_PRIVATE_TOKEN || '',
};