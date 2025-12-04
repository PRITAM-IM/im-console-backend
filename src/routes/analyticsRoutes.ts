import express from 'express';
import {
  getOverviewMetrics,
  getSessionChannels,
  getConversionsByChannel,
  getGeoData,
  getDeviceData,
  getTopLandingPages,
  getSessionSources,
  getBrowserData,
  getCampaignData,
  getSourceMediumCampaign,
  getRevenueMetrics,
  getTimeBasedAnalytics,
  getSessionSourceMedium,
  getGoogleAdsCampaigns,
} from '../controllers/analyticsController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router({ mergeParams: true });

router.get('/overview/:projectId', authenticate, getOverviewMetrics);
router.get('/channels/:projectId', authenticate, getSessionChannels);
router.get('/conversions/:projectId', authenticate, getConversionsByChannel);
router.get('/geo/:projectId', authenticate, getGeoData);
router.get('/devices/:projectId', authenticate, getDeviceData);
router.get('/landing-pages/:projectId', authenticate, getTopLandingPages);
router.get('/sources/:projectId', authenticate, getSessionSources);
router.get('/browsers/:projectId', authenticate, getBrowserData);
router.get('/campaigns/:projectId', authenticate, getCampaignData);
router.get('/source-medium-campaign/:projectId', authenticate, getSourceMediumCampaign);
router.get('/revenue/:projectId', authenticate, getRevenueMetrics);
router.get('/time-based/:projectId', authenticate, getTimeBasedAnalytics);
router.get('/session-source-medium/:projectId', authenticate, getSessionSourceMedium);
router.get('/google-ads-campaigns/:projectId', authenticate, getGoogleAdsCampaigns);

export default router;