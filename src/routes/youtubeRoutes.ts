import express from 'express';
import {
  initiateAuth,
  handleCallback,
  handleCallbackGet,
  saveYouTubeChannel,
  getYouTubeChannels,
  getYouTubeOverview,
  getYouTubeTopVideos,
  getYouTubeTrafficSources,
  getYouTubeDevices,
  getYouTubeGeography,
  getTopContent,
} from '../controllers/youtubeController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/auth', authenticate, initiateAuth);
router.get('/callback', handleCallbackGet); // GET route for OAuth redirect
router.post('/callback', authenticate, handleCallback); // POST route for manual callback
router.post('/channel', authenticate, saveYouTubeChannel);
router.get('/channels/:projectId', authenticate, getYouTubeChannels);
router.get('/:projectId/overview', authenticate, getYouTubeOverview);
router.get('/:projectId/top-videos', authenticate, getYouTubeTopVideos);
router.get('/:projectId/top-content', authenticate, getTopContent); // New DM Cockpit-style endpoint
router.get('/:projectId/traffic-sources', authenticate, getYouTubeTrafficSources);
router.get('/:projectId/devices', authenticate, getYouTubeDevices);
router.get('/:projectId/geography', authenticate, getYouTubeGeography);

export default router;


