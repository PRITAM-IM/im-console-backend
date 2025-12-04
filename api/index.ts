import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app';
import connectDB from '../src/config/db';

// Ensure DB connection before handling requests
export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    // Connect to MongoDB (uses cached connection if already connected)
    await connectDB();
    
    // Handle the request using Express app
    return app(req as any, res as any);
  } catch (error: any) {
    console.error('Serverless function error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
};
