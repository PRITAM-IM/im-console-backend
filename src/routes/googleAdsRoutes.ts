import express from 'express';
import {
  initiateAuth,
  handleCallback,
  handleCallbackGet,
  saveGoogleAdsCustomer,
  getGoogleAdsCustomers,
  getGoogleAdsOverview,
  getGoogleAdsLocations,
  getGoogleAdsDevices,
  getGoogleAdsCampaigns,
  getGoogleAdsKeywords,
} from '../controllers/googleAdsController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/auth', authenticate, initiateAuth);
router.get('/callback', handleCallbackGet); // GET route for OAuth redirect
router.post('/callback', authenticate, handleCallback); // POST route for manual callback
router.post('/customer', authenticate, saveGoogleAdsCustomer);
router.get('/customers/:projectId', authenticate, getGoogleAdsCustomers);
router.get('/:projectId/overview', authenticate, getGoogleAdsOverview);
router.get('/:projectId/locations', authenticate, getGoogleAdsLocations);
router.get('/:projectId/devices', authenticate, getGoogleAdsDevices);
router.get('/:projectId/campaigns', authenticate, getGoogleAdsCampaigns);
router.get('/:projectId/keywords', authenticate, getGoogleAdsKeywords);

export default router;

