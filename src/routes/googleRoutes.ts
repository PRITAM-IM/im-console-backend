import express from 'express';
import {
  initiateAuth,
  handleCallback,
  handleCallbackGet,
  saveGaProperty,
  getGA4Properties,
  testCallbackRoute,
} from '../controllers/googleController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/auth', authenticate, initiateAuth);
router.get('/callback/test', testCallbackRoute); // Test endpoint
router.get('/callback', handleCallbackGet); // GET route for OAuth redirect
router.post('/callback', authenticate, handleCallback); // POST route for manual callback
router.post('/property', authenticate, saveGaProperty);
router.get('/properties/:projectId', authenticate, getGA4Properties);

export default router;