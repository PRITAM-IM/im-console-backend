import app from './app';
import connectDB from './config/db';
import { ENV } from './config/env';
import { initializePineconeIndex } from './config/pinecone';

const PORT = ENV.PORT || 3000;

// Initialize services
async function initializeServices() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Initialize Pinecone index (only if API key is configured)
    if (ENV.PINECONE_API_KEY) {
      console.log('[Pinecone] Initializing vector database...');
      await initializePineconeIndex();
      console.log('[Pinecone] Initialized - RAG is enabled');
    } else {
      console.log('[Pinecone] API key not configured - RAG will fall back to traditional context');
    }

    // Start balance alert worker (Railway persistent server - always attempt to start)
    // Worker internally checks BALANCE_ALERT_ENABLED=true, TWOCHAT_API_KEY, TWOCHAT_WHATSAPP_GROUP_ID
    if (process.env.BALANCE_ALERT_ENABLED === 'true') {
      try {
        const balanceAlertWorker = (await import('./workers/balanceAlertWorker')).default;
        balanceAlertWorker.start();
        console.log('[Balance Alert Worker] Started successfully on Railway');
      } catch (error: any) {
        console.error('[Balance Alert Worker] Failed to start:', error.message);
      }
    } else {
      console.log('[Balance Alert Worker] Disabled — set BALANCE_ALERT_ENABLED=true in Railway env vars to enable');
    }

    // Start token refresh worker — proactively refreshes all Google OAuth access tokens
    // every 45 minutes so users never see "Session Expired" warnings.
    try {
      const tokenRefreshWorker = (await import('./workers/tokenRefreshWorker')).default;
      tokenRefreshWorker.start();
    } catch (error: any) {
      console.error('[Token Refresh Worker] Failed to start:', error.message);
    }
  } catch (error: any) {
    console.error('[Startup] Error initializing services:', error.message);
    // Don't exit - allow server to run with traditional context if Pinecone fails
  }
}

// Initialize services and start server
initializeServices().then(() => {
  // Start server
  app.listen(PORT, () => {
    console.log(`Server running in ${ENV.NODE_ENV} mode on port ${PORT}`);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.log(`Error: ${err.message}`);
  process.exit(1);
});
