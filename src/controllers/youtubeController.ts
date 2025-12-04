import { Request, Response } from 'express';
import youtubeAuthService from '../services/youtubeAuthService';
import youtubeDataService from '../services/youtubeDataService';
import youtubeContentService from '../services/youtubeContentService';
import projectService from '../services/projectService';
import asyncHandler from 'express-async-handler';

export const initiateAuth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;
    const state = projectId ? String(projectId) : undefined;

    console.log(`[YouTube Initiate Auth] ===== BACKEND OAuth URL Generation =====`);
    console.log(`[YouTube Initiate Auth] Request received from: ${req.headers.origin || 'unknown'}`);
    console.log(`[YouTube Initiate Auth] Project ID: ${projectId}`);
    console.log(`[YouTube Initiate Auth] State: ${state}`);

    // Generate auth URL from backend
    const authUrl = youtubeAuthService.generateAuthUrl(state);

    console.log(`[YouTube Initiate Auth] Generated auth URL: ${authUrl.substring(0, 100)}...`);

    res.status(200).json({
      success: true,
      authUrl,
    });
  } catch (error: any) {
    console.error('[YouTube Initiate Auth] Error:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const handleCallbackGet = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state } = req.query;

    console.log('[YouTube Callback GET] ===== OAuth Callback Received =====');
    console.log('[YouTube Callback GET] Code:', code ? `${String(code).substring(0, 20)}...` : 'MISSING');
    console.log('[YouTube Callback GET] State (projectId):', state || 'MISSING');

    if (!code) {
      console.error('[YouTube Callback GET] Missing authorization code');
      return res.redirect(`http://localhost:5173/auth/youtube/callback?error=missing_code`);
    }

    const projectId = state ? String(state) : '';

    if (!projectId) {
      console.error('[YouTube Callback GET] Missing project ID in state');
      return res.redirect(`http://localhost:5173/auth/youtube/callback?error=missing_project_id`);
    }

    // Redirect to frontend with code and projectId
    const frontendCallbackUrl = `http://localhost:5173/auth/youtube/callback?code=${code}&projectId=${projectId}`;
    console.log('[YouTube Callback GET] Redirecting to frontend:', frontendCallbackUrl);

    res.redirect(frontendCallbackUrl);
  } catch (error: any) {
    console.error('[YouTube Callback GET] Error:', error);
    res.redirect(`http://localhost:5173/auth/youtube/callback?error=${encodeURIComponent(error.message)}`);
  }
});

export const handleCallback = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, projectId } = req.body;

    console.log('[YouTube Callback POST] ===== Processing OAuth Callback =====');
    console.log('[YouTube Callback POST] Code:', code ? `${code.substring(0, 20)}...` : 'MISSING');
    console.log('[YouTube Callback POST] Project ID:', projectId || 'MISSING');

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
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    // Exchange code for tokens
    const { accessToken, refreshToken, expiresAt } = await youtubeAuthService.handleCallback(code);

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: 'Failed to obtain refresh token. Please try again.',
      });
      return;
    }

    // Save connection to database
    await youtubeAuthService.saveConnection(projectId, refreshToken, accessToken, expiresAt);

    console.log('[YouTube Callback POST] Connection saved successfully');

    res.status(200).json({
      success: true,
      message: 'YouTube connection established successfully',
    });
  } catch (error: any) {
    console.error('[YouTube Callback POST] Error:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const saveYouTubeChannel = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId, channelId } = req.body;

  if (!projectId || !channelId) {
    res.status(400).json({
      success: false,
      error: 'Project ID and Channel ID are required',
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

    // Verify YouTube connection exists (OAuth must be completed first)
    const connection = await youtubeAuthService.getConnectionByProject(projectId);
    if (!connection) {
      console.log(`[YouTube Save Channel] No YouTube connection found for project ${projectId}`);
      res.status(400).json({
        success: false,
        error: 'YouTube OAuth connection not found. Please complete the authorization first.',
      });
      return;
    }
    console.log(`[YouTube Save Channel] Found existing connection for project ${projectId}`);

    // Update project with YouTube channel ID
    const updatedProject = await projectService.updateProject(projectId, userId, {
      youtubeChannelId: channelId,
    });

    if (!updatedProject) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    const projectData = updatedProject.toObject ? updatedProject.toObject() : updatedProject;

    console.log(`[YouTube Save Channel] Successfully saved channel ${channelId} for project ${projectId}`);

    res.status(200).json({
      success: true,
      data: {
        ...projectData,
        youtubeChannelId: channelId,
      },
    });
  } catch (error: any) {
    console.error(`[YouTube Save Channel] Error:`, error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getYouTubeChannels = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
    const accessToken = await youtubeDataService.getAccessToken(projectId);

    // Fetch channels
    const channels = await youtubeAuthService.getYouTubeChannels(accessToken);

    res.status(200).json({
      success: true,
      data: channels,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getYouTubeOverview = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query;

  if (!projectId) {
    res.status(400).json({
      success: false,
      error: 'Project ID is required',
    });
    return;
  }

  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      error: 'Start date and end date are required',
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

    if (!project.youtubeChannelId) {
      res.status(400).json({
        success: false,
        error: 'YouTube channel ID not set for this project',
      });
      return;
    }

    // Get access token
    const accessToken = await youtubeDataService.getAccessToken(projectId);

    // Fetch overview metrics
    const metrics = await youtubeDataService.getOverviewMetrics(
      project.youtubeChannelId,
      accessToken,
      {
        startDate: startDate as string,
        endDate: endDate as string,
      }
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

export const getYouTubeTopVideos = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query;

  if (!projectId) {
    res.status(400).json({
      success: false,
      error: 'Project ID is required',
    });
    return;
  }

  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      error: 'Start date and end date are required',
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

    if (!project.youtubeChannelId) {
      res.status(400).json({
        success: false,
        error: 'YouTube channel ID not set for this project',
      });
      return;
    }

    // Get access token
    const accessToken = await youtubeDataService.getAccessToken(projectId);

    // Fetch top videos
    const videos = await youtubeDataService.getTopVideos(
      project.youtubeChannelId,
      accessToken,
      {
        startDate: startDate as string,
        endDate: endDate as string,
      }
    );

    res.status(200).json({
      success: true,
      data: videos,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getYouTubeTrafficSources = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query;

  if (!projectId) {
    res.status(400).json({
      success: false,
      error: 'Project ID is required',
    });
    return;
  }

  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      error: 'Start date and end date are required',
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

    if (!project.youtubeChannelId) {
      res.status(400).json({
        success: false,
        error: 'YouTube channel ID not set for this project',
      });
      return;
    }

    // Get access token
    const accessToken = await youtubeDataService.getAccessToken(projectId);

    // Fetch traffic sources
    const sources = await youtubeDataService.getTrafficSources(
      project.youtubeChannelId,
      accessToken,
      {
        startDate: startDate as string,
        endDate: endDate as string,
      }
    );

    res.status(200).json({
      success: true,
      data: sources,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getYouTubeDevices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query;

  if (!projectId) {
    res.status(400).json({
      success: false,
      error: 'Project ID is required',
    });
    return;
  }

  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      error: 'Start date and end date are required',
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

    if (!project.youtubeChannelId) {
      res.status(400).json({
        success: false,
        error: 'YouTube channel ID not set for this project',
      });
      return;
    }

    // Get access token
    const accessToken = await youtubeDataService.getAccessToken(projectId);

    // Fetch device types
    const devices = await youtubeDataService.getDeviceTypes(
      project.youtubeChannelId,
      accessToken,
      {
        startDate: startDate as string,
        endDate: endDate as string,
      }
    );

    res.status(200).json({
      success: true,
      data: devices,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getYouTubeGeography = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query;

  if (!projectId) {
    res.status(400).json({
      success: false,
      error: 'Project ID is required',
    });
    return;
  }

  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      error: 'Start date and end date are required',
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

    if (!project.youtubeChannelId) {
      res.status(400).json({
        success: false,
        error: 'YouTube channel ID not set for this project',
      });
      return;
    }

    // Get access token
    const accessToken = await youtubeDataService.getAccessToken(projectId);

    // Fetch geography
    const geography = await youtubeDataService.getGeography(
      project.youtubeChannelId,
      accessToken,
      {
        startDate: startDate as string,
        endDate: endDate as string,
      }
    );

    res.status(200).json({
      success: true,
      data: geography,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get top content (Videos, Shorts, or Playlists) in DM Cockpit format
 * Query param: contentType = 'video' | 'shorts' | 'playlist'
 */
export const getTopContent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate, contentType } = req.query;

  if (!projectId || !startDate || !endDate) {
    res.status(400).json({
      success: false,
      error: 'Project ID, start date, and end date are required',
    });
    return;
  }

  if (!contentType || !['video', 'shorts', 'playlist'].includes(contentType as string)) {
    res.status(400).json({
      success: false,
      error: 'Content type must be one of: video, shorts, playlist',
    });
    return;
  }

  try {
    // @ts-ignore
    const userId = req.user._id.toString();

    const project = await projectService.getProjectById(projectId, userId);
    if (!project || !project.youtubeChannelId) {
      res.status(404).json({
        success: false,
        error: 'Project or YouTube channel not found',
      });
      return;
    }

    const accessToken = await youtubeDataService.getAccessToken(projectId);

    // Fetch top content based on type
    const content = await youtubeContentService.getTopContent(
      project.youtubeChannelId,
      accessToken,
      {
        startDate: startDate as string,
        endDate: endDate as string,
      },
      contentType as 'video' | 'shorts' | 'playlist'
    );

    res.status(200).json({
      success: true,
      data: content,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

