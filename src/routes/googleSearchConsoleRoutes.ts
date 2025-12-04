import express from 'express';
import {
  initiateAuth,
  handleCallback,
  handleCallbackGet,
  saveSearchConsoleSite,
  getSearchConsoleSites,
  getSearchConsoleOverview,
  getSearchConsoleQueries,
  getSearchConsolePages,
  getSearchConsoleCountries,
  getSearchConsoleDevices,
} from '../controllers/googleSearchConsoleController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// OAuth routes - must be before other routes to avoid conflicts
router.get('/auth', authenticate, initiateAuth);
router.get('/auth-url', authenticate, initiateAuth); // Alias for consistency
router.get('/callback', handleCallbackGet); // GET route for OAuth redirect (no auth needed - called by Google)
router.post('/callback', authenticate, handleCallback); // POST route for manual callback

// Data routes
router.post('/site', authenticate, saveSearchConsoleSite);
router.get('/sites/:projectId', authenticate, getSearchConsoleSites);
router.get('/:projectId/overview', authenticate, getSearchConsoleOverview);
router.get('/:projectId/queries', authenticate, getSearchConsoleQueries);
router.get('/:projectId/pages', authenticate, getSearchConsolePages);
router.get('/:projectId/countries', authenticate, getSearchConsoleCountries);
router.get('/:projectId/devices', authenticate, getSearchConsoleDevices);

export default router;

