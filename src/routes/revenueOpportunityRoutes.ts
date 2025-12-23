import express from 'express';
import {
    discoverOpportunities,
    getOpportunities,
    getOpportunityDetails,
    refreshInsights,
    deleteOpportunity,
    generateCampaignImage,
} from '../controllers/revenueOpportunityController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

/**
 * Revenue Opportunity Routes
 * All routes require authentication
 */

// Discover new opportunities for a project
router.post('/projects/:projectId/discover', authenticate, discoverOpportunities);

// Get all opportunities for a project
router.get('/projects/:projectId', authenticate, getOpportunities);

// Get single opportunity details
router.get('/:opportunityId', authenticate, getOpportunityDetails);

// Refresh AI insights for an opportunity
router.post('/:opportunityId/refresh', authenticate, refreshInsights);

// Delete an opportunity
router.delete('/:opportunityId', authenticate, deleteOpportunity);

// Generate campaign image for an opportunity
router.post('/:opportunityId/generate-image', authenticate, generateCampaignImage);

export default router;
