import mongoose from 'mongoose';
import { ENV } from './env';

// Define a type for the cached connection
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Declare a global variable to cache the connection across invocations
// This is critical for serverless environments (like Vercel) to prevent
// creating a new connection for every request.
let cached: MongooseCache = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

const connectDB = async (): Promise<typeof mongoose> => {
  // If we have a cached connection, return it immediately
  if (cached.conn) {
    return cached.conn;
  }

  // If we don't have a promise (connection in progress), create one
  if (!cached.promise) {
    const opts = {
      bufferCommands: false, // Disable buffering to fail fast if not connected
      serverSelectionTimeoutMS: 10000, // Timeout after 10s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      maxPoolSize: 10, // Maintain up to 10 socket connections
      retryWrites: true,
      w: 'majority' as const,
    };

    console.log('Connecting to MongoDB...');
    console.log('MongoDB URI (masked):', ENV.MONGODB_URI.replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@'));
    
    cached.promise = mongoose.connect(ENV.MONGODB_URI, opts).then((mongoose) => {
      console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);

      if (mongoose.connection.name === 'test') {
        console.warn('⚠️  WARNING: Connected to "test" database.');
      }

      return mongoose;
    }).catch((error) => {
      console.error('❌ MongoDB connection failed:', error.message);
      throw error;
    });
  }

  try {
    // Wait for the connection to complete
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('MongoDB connection error:', e);
    throw e;
  }

  return cached.conn;
};

export default connectDB;