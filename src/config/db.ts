import dns from 'node:dns';
import mongoose from 'mongoose';
import { ENV } from './env';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

let cached: MongooseCache = (global as any).mongoose;
if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

const MONGO_CONNECT_OPTIONS = {
  bufferCommands: false,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 5,
  minPoolSize: 1,
  retryWrites: true,
  w: 'majority' as const,
};

const connectWithCurrentDns = async (): Promise<typeof mongoose> => {
  const instance = await mongoose.connect(ENV.MONGODB_URI, MONGO_CONNECT_OPTIONS);
  console.log(`MongoDB Connected: ${instance.connection.host}`);

  if (instance.connection.name === 'test') {
    console.warn('WARNING: Connected to "test" database.');
  }

  return instance;
};

const isSrvDnsRefusedError = (error: any): boolean =>
  error?.code === 'ECONNREFUSED' && error?.syscall === 'querySrv';

const connectDB = async (): Promise<typeof mongoose> => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    console.log('Connecting to MongoDB...');
    console.log(
      'MongoDB URI (masked):',
      ENV.MONGODB_URI.replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@')
    );

    cached.promise = connectWithCurrentDns()
      .catch(async (error) => {
        if (!isSrvDnsRefusedError(error)) {
          throw error;
        }

        console.warn(
          'MongoDB SRV DNS lookup was refused by current resolver. Retrying with public DNS...'
        );
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        return connectWithCurrentDns();
      })
      .catch((error) => {
        console.error('MongoDB connection failed:', error.message);
        throw error;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    console.error('MongoDB connection error:', error);
    throw error;
  }

  return cached.conn;
};

export default connectDB;
