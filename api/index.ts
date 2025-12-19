import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app.js';
import connectDB from '../src/config/db.js';
import { initializePineconeIndex } from '../src/config/pinecone.js';
import { ENV } from '../src/config/env.js';

// Track initialization state
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// Initialize services once (cached for subsequent invocations)
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
      console.log('🔌 Initializing serverless function...');
      
      // Connect to MongoDB
      await connectDB();
      console.log('✅ MongoDB connected');
      
      // Initialize Pinecone (only if API key is configured)
      // Skip index creation check in serverless to avoid timeouts
      if (ENV.PINECONE_API_KEY) {
        console.log('🔮 Pinecone configured - RAG enabled');
        // Note: We don't call initializePineconeIndex() here because it's too slow
        // The index should be pre-created using the batch script
        // Pinecone client will be initialized lazily on first use
      } else {
        console.log('⚠️  Pinecone not configured - using traditional context');
      }
      
      isInitialized = true;
      console.log('✅ Serverless function initialized');
    } catch (error: any) {
      console.error('❌ Initialization error:', error.message);
      // Don't throw - allow function to work with degraded functionality
      isInitialized = true; // Mark as initialized to avoid retry loops
    }
  })();

  await initializationPromise;
}

// Ensure DB connection before handling requests
export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    // Ensure services are initialized
    await ensureInitialized();
    
    // Handle the request using Express app
    return app(req as any, res as any);
  } catch (error: any) {
    console.error('❌ Serverless function error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
};
