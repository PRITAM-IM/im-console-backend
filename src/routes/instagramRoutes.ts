import express from 'express';
import {
  getAuthUrl,
  getAccounts,
  selectAccount,
  getInsights,
  getMedia,
} from '../controllers/instagramController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// Public route (OAuth flow - reuses Facebook OAuth)
router.get('/auth-url', getAuthUrl);

// Protected routes (require authentication)
router.get('/accounts/:projectId', authenticate, getAccounts);
router.post('/select', authenticate, selectAccount);
router.get('/insights', authenticate, getInsights); // Query params: ?projectId=xxx&days=90
router.get('/insights/:projectId', authenticate, getInsights); // Path param for backward compatibility
router.get('/media/:projectId', authenticate, getMedia);

export default router;

