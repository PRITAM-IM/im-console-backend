import express from 'express';
import {
  getAuthUrl,
  handleCallback,
  getAdAccounts,
  saveAdAccount,
  getInsights,
  getCampaigns,
  getAgeGenderBreakdown,
  getPlatformBreakdown,
  getDailyBreakdown,
} from '../controllers/metaAdsController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// Public routes (OAuth flow)
router.get('/auth-url', getAuthUrl);
router.get('/callback', handleCallback);

// Protected routes (require authentication)
router.get('/accounts/:projectId', authenticate, getAdAccounts);
router.post('/select-account', authenticate, saveAdAccount);
router.get('/insights/:projectId', authenticate, getInsights);
router.get('/campaigns/:projectId', authenticate, getCampaigns);
router.get('/demographics/:projectId', authenticate, getAgeGenderBreakdown);
router.get('/platforms/:projectId', authenticate, getPlatformBreakdown);
router.get('/daily/:projectId', authenticate, getDailyBreakdown);

export default router;

