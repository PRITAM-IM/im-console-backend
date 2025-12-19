/**
 * Netlify Serverless Function Entry Point
 * Wraps Express app for Netlify Functions
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import serverless from 'serverless-http';
import app from '../../src/app';
import connectDB from '../../src/config/db';
import { ENV } from '../../src/config/env';

// Track initialization state (cached across invocations)
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize services once (cached for subsequent invocations)
 */
async function ensureInitialized() {
  if (isInitialized) {
    return;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  // Start initialization
  initializationPromise = (async () => {
    try {
      console.log('🔌 Initializing Netlify function...');
      
      // Connect to MongoDB
      await connectDB();
      console.log('✅ MongoDB connected');
      
      // Initialize Pinecone (only if API key is configured)
      if (ENV.PINECONE_API_KEY) {
        console.log('🔮 Pinecone configured - RAG enabled');
        // Note: We don't call initializePineconeIndex() here because it's too slow
        // The index should be pre-created using the batch script
        // Pinecone client will be initialized lazily on first use
      } else {
        console.log('⚠️  Pinecone not configured - using traditional context');
      }
      
      isInitialized = true;
      console.log('✅ Netlify function initialized');
    } catch (error: any) {
      console.error('❌ Initialization error:', error.message);
      // Don't throw - allow function to work with degraded functionality
      isInitialized = true; // Mark as initialized to avoid retry loops
    }
  })();

  await initializationPromise;
}

// Create serverless handler from Express app
const serverlessApp = serverless(app, {
  provider: 'aws', // Netlify uses AWS Lambda under the hood
  basePath: '/.netlify/functions/api',
});

/**
 * Netlify Function Handler
 */
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  try {
    // Ensure services are initialized
    await ensureInitialized();
    
    // Handle the request using serverless Express wrapper
    return await serverlessApp(event, context);
  } catch (error: any) {
    console.error('❌ Netlify function error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: error.message,
      }),
    };
  }
};
