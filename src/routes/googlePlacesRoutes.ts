import express from 'express';
import {
  searchPlaces,
  getPlaceDetails,
  getPlaceReviews,
  savePlaceToProject,
  getProjectPlaceData,
  getPlacePhoto,
} from '../controllers/googlePlacesController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// Search for places (hotels)
router.get('/search', authenticate, searchPlaces);

// Get detailed information about a specific place
router.get('/details/:placeId', authenticate, getPlaceDetails);

// Get reviews for a specific place
router.get('/reviews/:placeId', authenticate, getPlaceReviews);

// Save Google Places data to a project
router.post('/projects/:projectId/place', authenticate, savePlaceToProject);

// Get Google Places data for a project
router.get('/projects/:projectId/place', authenticate, getProjectPlaceData);

// Get a photo from Google Places (proxy endpoint)
router.get('/photo/:photoName(*)', authenticate, getPlacePhoto);

export default router;
