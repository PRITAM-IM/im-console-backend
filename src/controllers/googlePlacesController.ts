import { Request, Response } from 'express';
import googlePlacesService from '../services/googlePlacesService';
import projectService from '../services/projectService';

/**
 * Google Places API Controller
 * Handles requests for searching places and fetching place details
 */

const asyncHandler = (fn: (req: Request, res: Response, next: any) => Promise<void>) => (req: Request, res: Response, next: any) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Search for hotels/places by name or query
 */
export const searchPlaces = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { query, latitude, longitude } = req.query;

  if (!query || typeof query !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Search query is required',
    });
    return;
  }

  try {
    let location: { lat: number; lng: number } | undefined;

    // If latitude and longitude are provided, use them for location bias
    if (latitude && longitude) {
      location = {
        lat: parseFloat(latitude as string),
        lng: parseFloat(longitude as string),
      };
    }

    const results = await googlePlacesService.searchPlaces(query, location);

    res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get detailed information about a specific place
 */
export const getPlaceDetails = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { placeId } = req.params;

  if (!placeId) {
    res.status(400).json({
      success: false,
      error: 'Place ID is required',
    });
    return;
  }

  try {
    const details = await googlePlacesService.getPlaceDetails(placeId);

    res.status(200).json({
      success: true,
      data: details,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get reviews for a specific place
 */
export const getPlaceReviews = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { placeId } = req.params;

  if (!placeId) {
    res.status(400).json({
      success: false,
      error: 'Place ID is required',
    });
    return;
  }

  try {
    const reviews = await googlePlacesService.getPlaceReviews(placeId);

    res.status(200).json({
      success: true,
      data: reviews,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Save Google Places data to a project
 */
export const savePlaceToProject = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { placeId } = req.body;

  if (!projectId || !placeId) {
    res.status(400).json({
      success: false,
      error: 'Project ID and Place ID are required',
    });
    return;
  }

  try {
    // @ts-ignore
    const userId = req.user._id.toString();

    // Verify project belongs to user
    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    // Fetch place details
    const placeDetails = await googlePlacesService.getPlaceDetails(placeId);

    // Update project with Google Places data
    project.googlePlacesId = placeId;
    project.googlePlacesData = {
      displayName: placeDetails.displayName,
      formattedAddress: placeDetails.formattedAddress,
      rating: placeDetails.rating,
      userRatingCount: placeDetails.userRatingCount,
      websiteUri: placeDetails.websiteUri,
      phoneNumber: placeDetails.internationalPhoneNumber || placeDetails.nationalPhoneNumber,
      location: placeDetails.location,
      lastUpdated: new Date(),
    };

    await project.save();

    res.status(200).json({
      success: true,
      data: {
        project,
        placeDetails,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get Google Places data for a project
 */
export const getProjectPlaceData = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;

  if (!projectId) {
    res.status(400).json({
      success: false,
      error: 'Project ID is required',
    });
    return;
  }

  try {
    // @ts-ignore
    const userId = req.user._id.toString();

    // Verify project belongs to user
    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    if (!project.googlePlacesId) {
      res.status(404).json({
        success: false,
        error: 'No Google Places data found for this project',
      });
      return;
    }

    // Fetch fresh place details
    const placeDetails = await googlePlacesService.getPlaceDetails(project.googlePlacesId);

    res.status(200).json({
      success: true,
      data: {
        savedData: project.googlePlacesData,
        currentData: placeDetails,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get a photo from Google Places (proxy endpoint)
 */
export const getPlacePhoto = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { photoName } = req.params;
  const maxWidth = parseInt(req.query.maxWidth as string) || 800;

  if (!photoName) {
    res.status(400).json({
      success: false,
      error: 'Photo name is required',
    });
    return;
  }

  try {
    const photoDataUrl = await googlePlacesService.getPhotoData(photoName, maxWidth);

    res.status(200).json({
      success: true,
      data: {
        photoDataUrl,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export default {
  searchPlaces,
  getPlaceDetails,
  getPlaceReviews,
  savePlaceToProject,
  getProjectPlaceData,
  getPlacePhoto,
};
