import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
// Note: dotenv is already loaded in config/env.ts, no need to load again here

// Import routes
import authRoutes from './routes/authRoutes';
import projectRoutes from './routes/projectRoutes';
import googleRoutes from './routes/googleRoutes';
import googleAdsRoutes from './routes/googleAdsRoutes';
import googleSearchConsoleRoutes from './routes/googleSearchConsoleRoutes';
import googleSheetsRoutes from './routes/googleSheetsRoutes';
import googleDriveRoutes from './routes/googleDriveRoutes';
import googleBusinessProfileRoutes from './routes/googleBusinessProfileRoutes';
import youtubeRoutes from './routes/youtubeRoutes';
import facebookRoutes from './routes/facebookRoutes';
import metaAdsRoutes from './routes/metaAdsRoutes';
import instagramRoutes from './routes/instagramRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import linkedinRoutes from './routes/linkedinRoutes';
import aiAnalysisRoutes from './routes/aiAnalysisRoutes';

// Import middleware
import { errorHandler } from './middleware/errorMiddleware';

const app = express();

// CORS Configuration - Allow both development and production origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'https://client-hotel-dashboard.vercel.app', // Production frontend
  process.env.FRONTEND_URL || '',
].filter(Boolean);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/google-ads', googleAdsRoutes);
app.use('/api/gsc', googleSearchConsoleRoutes); // Short route for Google Search Console
app.use('/api/google-search-console', googleSearchConsoleRoutes); // Keep for backward compatibility
app.use('/api/google-sheets', googleSheetsRoutes);
app.use('/api/google-drive', googleDriveRoutes);
app.use('/api/google-business-profile', googleBusinessProfileRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/facebook', facebookRoutes);
app.use('/api/meta-ads', metaAdsRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/ai', aiAnalysisRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Hotel Analytics Cockpit API is running',
  });
});

// Error handling middleware
app.use(errorHandler);

export default app;