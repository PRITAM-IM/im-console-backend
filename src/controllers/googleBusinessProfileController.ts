import { Request, Response } from 'express';
import gbpAuthService from '../services/gbpAuthService';
import gbpDataService from '../services/gbpDataService';
import projectService from '../services/projectService';
import asyncHandler from 'express-async-handler';

export const initiateAuth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;
    
    console.log(`[GBP Initiate Auth] Request received`);
    console.log(`[GBP Initiate Auth] Project ID: ${projectId}`);
    
    const authUrl = gbpAuthService.generateAuthUrl(projectId ? String(projectId) : undefined);
    
    console.log(`[GBP Initiate Auth] Generated auth URL (first 150 chars): ${authUrl.substring(0, 150)}...`);
    
    res.status(200).json({
      success: true,
      data: {
        authUrl,
      },
    });
  } catch (error: any) {
    console.error(`[GBP Initiate Auth] Error:`, error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET callback handler for OAuth redirect
export const handleCallbackGet = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  console.log(`[GBP OAuth Callback] Callback route hit!`);
  console.log(`[GBP OAuth Callback] Query params:`, req.query);
  
  const { code, state, error } = req.query;

  if (error) {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/google-business-profile/callback?error=${encodeURIComponent(String(error))}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/google-business-profile/callback?error=missing_code_or_state`);
    return;
  }

  const projectId = String(state);

  try {
    console.log(`[GBP OAuth Callback] Processing callback for project: ${projectId}`);
    
    // Handle OAuth callback
    const { accessToken, refreshToken, expiresAt } = await gbpAuthService.handleCallback(String(code));
    console.log(`[GBP OAuth Callback] Tokens received - Access token: ${accessToken ? 'Yes' : 'No'}, Refresh token: ${refreshToken ? 'Yes' : 'No'}`);

    // Save connection
    console.log(`[GBP OAuth Callback] Saving connection to database...`);
    const savedConnection = await gbpAuthService.saveConnection(projectId, refreshToken, accessToken, expiresAt);
    console.log(`[GBP OAuth Callback] Connection saved successfully - ID: ${savedConnection._id}`);

    // Redirect to frontend callback page with success
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/google-business-profile/callback?gbp_connected=${projectId}`);
  } catch (error: any) {
    console.error(`[GBP OAuth Callback] ERROR:`, error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/google-business-profile/callback?error=${encodeURIComponent(error.message)}`);
  }
});

// POST callback handler for manual callback
export const handleCallback = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { code, projectId } = req.body;

  if (!code || !projectId) {
    res.status(400).json({
      success: false,
      error: 'Authorization code and project ID are required',
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

    // Handle OAuth callback
    const { accessToken, refreshToken, expiresAt } = await gbpAuthService.handleCallback(code);

    // Save connection
    await gbpAuthService.saveConnection(projectId, refreshToken, accessToken, expiresAt);

    res.status(200).json({
      success: true,
      data: {
        message: 'Google Business Profile connection established successfully',
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const saveLocation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId, locationId } = req.body;

  if (!projectId || !locationId) {
    res.status(400).json({
      success: false,
      error: 'Project ID and Location ID are required',
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

    // Update project with GBP location ID
    const updatedProject = await projectService.updateProject(projectId, userId, {
      googleBusinessProfileLocationId: locationId,
    });

    if (!updatedProject) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    const projectData = updatedProject.toObject ? updatedProject.toObject() : updatedProject;
    
    res.status(200).json({
      success: true,
      data: {
        ...projectData,
        googleBusinessProfileLocationId: locationId,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getLocations = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    // Get access token for this project
    const accessToken = await gbpDataService.getAccessToken(projectId);

    // Fetch GBP locations
    const locations = await gbpAuthService.getLocations(accessToken);

    res.status(200).json({
      success: true,
      data: locations,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getReviews = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    if (!project.googleBusinessProfileLocationId) {
      res.status(400).json({
        success: false,
        error: 'Google Business Profile location not configured for this project',
      });
      return;
    }

    // Get access token for this project
    const accessToken = await gbpDataService.getAccessToken(projectId);

    // Fetch reviews
    const reviews = await gbpDataService.getReviews(project.googleBusinessProfileLocationId, accessToken);

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

export const getInsights = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    if (!project.googleBusinessProfileLocationId) {
      res.status(400).json({
        success: false,
        error: 'Google Business Profile location not configured for this project',
      });
      return;
    }

    // Get access token for this project
    const accessToken = await gbpDataService.getAccessToken(projectId);

    // Fetch insights
    const insights = await gbpDataService.getInsights(project.googleBusinessProfileLocationId, accessToken);

    res.status(200).json({
      success: true,
      data: insights,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

