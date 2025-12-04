import express from 'express';
import {
  initiateAuth,
  handleCallback,
  handleCallbackGet,
  saveLocation,
  getLocations,
  getReviews,
  getInsights,
} from '../controllers/googleBusinessProfileController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/auth', authenticate, initiateAuth);
router.get('/callback', handleCallbackGet); // GET route for OAuth redirect
router.post('/callback', authenticate, handleCallback); // POST route for manual callback
router.post('/location', authenticate, saveLocation);
router.get('/locations/:projectId', authenticate, getLocations);
router.get('/:projectId/reviews', authenticate, getReviews);
router.get('/:projectId/insights', authenticate, getInsights);

export default router;

