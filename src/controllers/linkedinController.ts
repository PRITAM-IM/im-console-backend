import { Request, Response } from 'express';
import linkedinAuthService from '../services/linkedinAuthService';
import linkedinDataService from '../services/linkedinDataService';
import projectService from '../services/projectService';
import asyncHandler from 'express-async-handler';
import { getLinkedInAuthUrl, decodeState, LINKEDIN_CONFIG } from '../config/linkedin';
import Project from '../models/Project';

// GET /api/linkedin/auth-url?projectId=xxx
// Returns the LinkedIn authorization URL - frontend should redirect to this
export const getAuthUrl = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;
    
    console.log('[LinkedIn Auth URL] ===== Generating Auth URL =====');
    console.log('[LinkedIn Auth URL] Project ID:', projectId);
    
    if (!projectId || typeof projectId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Project ID is required',
      });
      return;
    }

    // @ts-ignore
    const userId = req.user._id.toString();
    
    // Verify project exists and belongs to user
    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    // Generate auth URL with projectId encoded in state
    const authUrl = getLinkedInAuthUrl(projectId);
    
    console.log('[LinkedIn Auth URL] Generated URL successfully');
    
    res.status(200).json({
      success: true,
      authUrl,
    });
  } catch (error: any) {
    console.error('[LinkedIn Auth URL] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate auth URL',
    });
  }
});

// Legacy route - kept for backwards compatibility (same as getAuthUrl)
export const initiateAuth = getAuthUrl;

// GET /api/linkedin/callback - OAuth callback from LinkedIn
export const handleCallbackGet = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { code, state, error: oauthError, error_description } = req.query;
  
  console.log('[LinkedIn Callback GET] ===== OAuth Callback Received =====');
  console.log('[LinkedIn Callback GET] Code:', code ? `${String(code).substring(0, 20)}...` : 'MISSING');
  console.log('[LinkedIn Callback GET] State:', state || 'MISSING');
  console.log('[LinkedIn Callback GET] Error:', oauthError || 'none');
  console.log('[LinkedIn Callback GET] Error Description:', error_description || 'none');
  
  // Handle OAuth errors from LinkedIn
  if (oauthError) {
    console.error('[LinkedIn Callback GET] OAuth Error:', oauthError, error_description);
    const errorMsg = encodeURIComponent(String(error_description || oauthError));
    res.redirect(`http://localhost:5173/auth/linkedin/callback?error=${errorMsg}`);
    return;
  }

  // Validate code
  if (!code) {
    console.error('[LinkedIn Callback GET] Missing authorization code');
    res.redirect(`http://localhost:5173/auth/linkedin/callback?error=missing_code`);
    return;
  }

  // Decode and validate state
  if (!state) {
    console.error('[LinkedIn Callback GET] Missing state parameter');
    res.redirect(`http://localhost:5173/auth/linkedin/callback?error=missing_state`);
    return;
  }

  const decodedState = decodeState(String(state));
  if (!decodedState || !decodedState.projectId) {
    console.error('[LinkedIn Callback GET] Invalid state parameter');
    res.redirect(`http://localhost:5173/auth/linkedin/callback?error=invalid_state`);
    return;
  }

  const { projectId } = decodedState;
  console.log('[LinkedIn Callback GET] Decoded projectId:', projectId);

  // Verify project exists
  const project = await Project.findById(projectId);
  if (!project) {
    console.error('[LinkedIn Callback GET] Project not found:', projectId);
    res.redirect(`http://localhost:5173/auth/linkedin/callback?error=project_not_found`);
    return;
  }

  console.log('[LinkedIn Callback GET] Project verified:', project.name);

  // Redirect to frontend with code and projectId
  const frontendCallbackUrl = `http://localhost:5173/auth/linkedin/callback?code=${code}&projectId=${projectId}`;
  console.log('[LinkedIn Callback GET] Redirecting to frontend');
  
  res.redirect(frontendCallbackUrl);
});

// POST /api/linkedin/callback - Exchange code for tokens (called by frontend)
export const handleCallback = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, projectId } = req.body;
    
    console.log('[LinkedIn Callback POST] ===== Processing OAuth Callback =====');
    console.log('[LinkedIn Callback POST] Code:', code ? `${code.substring(0, 20)}...` : 'MISSING');
    console.log('[LinkedIn Callback POST] Project ID:', projectId || 'MISSING');

    if (!code || !projectId) {
      res.status(400).json({
        success: false,
        error: 'Code and project ID are required',
      });
      return;
    }

    // @ts-ignore
    const userId = req.user._id.toString();
    
    // Verify project belongs to user
    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      console.error('[LinkedIn Callback POST] Project not found for user');
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    console.log('[LinkedIn Callback POST] Project verified:', project.name);

    // Exchange code for tokens using the SAME redirect_uri
    console.log('[LinkedIn Callback POST] Exchanging code for tokens...');
    console.log('[LinkedIn Callback POST] Using redirect_uri:', LINKEDIN_CONFIG.redirectUri);
    
    const { accessToken, refreshToken, expiresAt } = await linkedinAuthService.handleCallback(code);

    console.log('[LinkedIn Callback POST] Tokens received successfully');

    // Save connection to database
    await linkedinAuthService.saveConnection(projectId, accessToken, refreshToken, expiresAt);

    console.log('[LinkedIn Callback POST] Connection saved to database');

    res.status(200).json({
      success: true,
      message: 'LinkedIn connection established successfully',
    });
  } catch (error: any) {
    console.error('[LinkedIn Callback POST] Error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to connect LinkedIn',
    });
  }
});

// POST /api/linkedin/page - Save LinkedIn page ID to project
export const saveLinkedInPage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId, pageId } = req.body;

  if (!projectId || !pageId) {
    res.status(400).json({
      success: false,
      error: 'Project ID and Page ID are required',
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

    // Update project with LinkedIn page ID
    const updatedProject = await projectService.updateProject(projectId, userId, {
      linkedinPageId: pageId,
    });

    if (!updatedProject) {
      res.status(404).json({
        success: false,
        error: 'Failed to update project',
      });
      return;
    }

    const projectData = updatedProject.toObject ? updatedProject.toObject() : updatedProject;
    
    res.status(200).json({
      success: true,
      data: {
        ...projectData,
        linkedinPageId: pageId,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/linkedin/pages/:projectId - Get LinkedIn pages/profiles
export const getLinkedInPages = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    // Get access token
    const accessToken = await linkedinDataService.getAccessToken(projectId);

    // Fetch pages/organizations
    const pages = await linkedinAuthService.getOrganizations(accessToken);

    res.status(200).json({
      success: true,
      data: pages,
    });
  } catch (error: any) {
    console.error('[LinkedIn Pages] Error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/linkedin/:projectId/overview - Get overview metrics
export const getLinkedInOverview = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    if (!project.linkedinPageId) {
      res.status(400).json({
        success: false,
        error: 'LinkedIn page ID not set for this project',
      });
      return;
    }

    // Get access token
    const accessToken = await linkedinDataService.getAccessToken(projectId);

    // Fetch overview metrics
    const metrics = await linkedinDataService.getOverviewMetrics(
      project.linkedinPageId,
      accessToken
    );

    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/linkedin/:projectId/posts - Get recent posts
export const getLinkedInPosts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { limit } = req.query;

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

    if (!project.linkedinPageId) {
      res.status(400).json({
        success: false,
        error: 'LinkedIn page ID not set for this project',
      });
      return;
    }

    // Get access token
    const accessToken = await linkedinDataService.getAccessToken(projectId);

    // Fetch posts
    const posts = await linkedinDataService.getRecentPosts(
      project.linkedinPageId,
      accessToken,
      limit ? parseInt(limit as string, 10) : 10
    );

    res.status(200).json({
      success: true,
      data: posts,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/linkedin/:projectId/demographics - Get follower demographics
export const getLinkedInDemographics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    if (!project.linkedinPageId) {
      res.status(400).json({
        success: false,
        error: 'LinkedIn page ID not set for this project',
      });
      return;
    }

    // Get access token
    const accessToken = await linkedinDataService.getAccessToken(projectId);

    // Fetch demographics
    const demographics = await linkedinDataService.getFollowerDemographics(
      project.linkedinPageId,
      accessToken
    );

    res.status(200).json({
      success: true,
      data: demographics,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});
