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
      console.log('🔮 Initializing Pinecone vector database...');
      await initializePineconeIndex();
      console.log('✅ Pinecone initialized - RAG is enabled');
    } else {
      console.log('⚠️  Pinecone API key not configured - RAG will fall back to traditional context');
    }
  } catch (error: any) {
    console.error('❌ Error initializing services:', error.message);
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