import mongoose from 'mongoose';
import { ENV } from './env';

const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(ENV.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`MongoDB Database: ${conn.connection.name}`);
    
    // Warn if connected to 'test' database (common mistake with Atlas URIs)
    if (conn.connection.name === 'test') {
      console.warn('⚠️  WARNING: Connected to "test" database. This is likely unintended.');
      console.warn('⚠️  Please ensure MONGODB_URI includes database name: mongodb+srv://...mongodb.net/hotel-analytics?...');
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
};

export default connectDB;