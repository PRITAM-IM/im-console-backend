import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app';
import connectDB from '../src/config/db';
import { ENV } from '../src/config/env';
// NOTE: Pinecone/RAG functionality moved to chatbot-backend

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
      console.log('🔌 Initializing main backend serverless function...');
      
      // Connect to MongoDB
      await connectDB();
      console.log('✅ MongoDB connected');
      console.log('✅ Main backend initialized');
      // NOTE: Pinecone/RAG initialization moved to chatbot-backend
      
      isInitialized = true;
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
