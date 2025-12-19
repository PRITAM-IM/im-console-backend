import app from './app';
import connectDB from './config/db';
import { ENV } from './config/env';
// NOTE: Pinecone/RAG functionality moved to chatbot-backend

const PORT = ENV.PORT || 3000;

// Initialize services
async function initializeServices() {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('✅ Main backend services initialized');
    // NOTE: Pinecone/RAG initialization moved to chatbot-backend
  } catch (error: any) {
    console.error('❌ Error initializing services:', error.message);
    process.exit(1);
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