import express from 'express';
import {
  getAuthUrl,
  initiateAuth,
  handleCallback,
  handleCallbackGet,
  saveLinkedInPage,
  getLinkedInPages,
  getLinkedInOverview,
  getLinkedInPosts,
  getLinkedInDemographics,
} from '../controllers/linkedinController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// Auth URL generation (new endpoint)
router.get('/auth-url', authenticate, getAuthUrl);

// Legacy auth endpoint (redirects to auth-url)
router.get('/auth', authenticate, initiateAuth);

// OAuth callback routes
router.get('/callback', handleCallbackGet); // GET route for OAuth redirect from LinkedIn
router.post('/callback', authenticate, handleCallback); // POST route for frontend to exchange code

// Page management
router.post('/page', authenticate, saveLinkedInPage);
router.get('/pages/:projectId', authenticate, getLinkedInPages);

// Data endpoints
router.get('/:projectId/overview', authenticate, getLinkedInOverview);
router.get('/:projectId/posts', authenticate, getLinkedInPosts);
router.get('/:projectId/demographics', authenticate, getLinkedInDemographics);

export default router;
