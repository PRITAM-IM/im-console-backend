import express from 'express';
import {
  initiateAuth,
  handleCallbackGet,
  saveFacebookPage,
  getFacebookPages,
  getFacebookOverview,
  getFacebookTimeSeries,
  getFacebookFollowData,
  getFacebookPosts,
} from '../controllers/facebookController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// Public routes (OAuth flow)
router.get('/auth', initiateAuth);
router.get('/callback', handleCallbackGet);

// Protected routes (require authentication)
router.post('/page', authenticate, saveFacebookPage);
router.get('/pages/:projectId', authenticate, getFacebookPages);
router.get('/overview/:projectId', authenticate, getFacebookOverview);
router.get('/timeseries/:projectId', authenticate, getFacebookTimeSeries);
router.get('/follows/:projectId', authenticate, getFacebookFollowData);
router.get('/posts/:projectId', authenticate, getFacebookPosts);

export default router;
