import express from 'express';
import { generateOverview } from '../controllers/aiAnalysisController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// POST /api/ai/generate-overview - Generate AI analysis for project
router.post('/generate-overview', authenticate, generateOverview);

export default router;

