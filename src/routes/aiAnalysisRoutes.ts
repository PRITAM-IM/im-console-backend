import express from 'express';
import { generateOverview, analyzeServiceData } from '../controllers/aiAnalysisController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// POST /api/ai/generate-overview - Generate AI analysis for project
router.post('/generate-overview', authenticate, generateOverview);

// POST /api/ai/analyze-service - Analyze specific service data
router.post('/analyze-service', authenticate, analyzeServiceData);

export default router;

