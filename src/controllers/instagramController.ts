import { Request, Response } from 'express';
import facebookAuthService from '../services/facebookAuthService';
import projectService from '../services/projectService';
import asyncHandler from 'express-async-handler';
import instagramService from '../services/instagramService';
import AnalyticsCache from '../models/AnalyticsCache';
import { Types } from 'mongoose';

/**
 * GET /api/instagram/auth-url
 * Reuse existing Facebook auth URL (scope already includes instagram_basic)
 */
export const getAuthUrl = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;
    const state = projectId ? String(projectId) : undefined;
    
    console.log(`[Instagram Get Auth URL] Generating OAuth URL for project: ${projectId}`);
    
    // Reuse Facebook auth URL (scope includes instagram_basic)
    const authUrl = facebookAuthService.generateAuthUrl(state);
    
    res.status(200).json({
      success: true,
      data: {
        authUrl,
      },
    });
  } catch (error: any) {
    console.error(`[Instagram Get Auth URL] ERROR:`, error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/instagram/accounts/:projectId
 * Get Instagram Business Accounts linked to user's Facebook Pages
 */
export const getAccounts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    // Get access token from Facebook connection
    const accessToken = await instagramService.getAccessToken(projectId);

    // Fetch Instagram Business Accounts
    const accounts = await instagramService.getInstagramAccounts(accessToken);

    res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (error: any) {
    console.error('[Instagram Controller] Error fetching accounts:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/instagram/select
 * Save selected Instagram Business Account to project
 */
export const selectAccount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId, igUserId, igUsername, pageId } = req.body;

  if (!projectId || !igUserId || !igUsername || !pageId) {
    res.status(400).json({
      success: false,
      error: 'Project ID, Instagram User ID, Username, and Page ID are required',
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

    // Get Page Access Token (required for Instagram Insights API)
    const pageAccessToken = await instagramService.getPageAccessToken(projectId, pageId);

    // Update project with Instagram account info
    const updatedProject = await projectService.updateProject(projectId, userId, {
      instagram: {
        igUserId,
        igUsername,
        pageId, // Store page ID for fetching Page Access Token
        accessToken: pageAccessToken, // Use Page Access Token for Instagram Insights
        connectedAt: new Date(),
      },
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
      data: projectData,
    });
  } catch (error: any) {
    console.error('[Instagram Controller] Error selecting account:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/instagram/insights?projectId=xxx&days=90
 * GET /api/instagram/insights/:projectId?days=90
 * Fetch Instagram media-level insights aggregated from individual posts
 */
export const getInsights = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // Support both query param and path param for backward compatibility
  const projectId = req.params.projectId || req.query.projectId;
  const { days } = req.query;

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
    const project = await projectService.getProjectById(String(projectId), userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    if (!project.instagram?.igUserId) {
      res.status(400).json({
        success: false,
        error: 'Instagram account not connected for this project',
      });
      return;
    }

    // Parse days parameter (default: 90)
    const periodDays = days ? parseInt(String(days), 10) : 90;
    if (isNaN(periodDays) || periodDays < 1) {
      res.status(400).json({
        success: false,
        error: 'Invalid days parameter',
      });
      return;
    }

    // Check cache
    const cacheKey = `instagram_media_insights_${periodDays}`;
    const cacheEntry = await AnalyticsCache.findOne({
      projectId: new Types.ObjectId(String(projectId)),
      reportType: 'instagram_media_insights',
      dateRange: cacheKey,
      expiresAt: { $gt: new Date() },
    });

    if (cacheEntry) {
      console.log(`[Instagram Insights] Cache hit for project ${projectId}`);
      res.status(200).json(cacheEntry.data);
      return;
    }

    // Get Page Access Token (required for Instagram Insights)
    let accessToken: string;
    if (project.instagram?.pageId) {
      accessToken = await instagramService.getPageAccessToken(String(projectId), project.instagram.pageId);
    } else if (project.instagram?.accessToken) {
      accessToken = project.instagram.accessToken;
    } else {
      accessToken = await instagramService.getAccessToken(String(projectId));
    }

    const igUserId = project.instagram.igUserId;

    // Fetch media-level insights
    const result = await instagramService.fetchAllInstagramMediaInsights(
      igUserId,
      accessToken,
      periodDays
    );

    // Cache result for 6 hours
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    await AnalyticsCache.findOneAndUpdate(
      {
        projectId: new Types.ObjectId(String(projectId)),
        reportType: 'instagram_media_insights',
        dateRange: cacheKey,
      },
      {
        projectId: new Types.ObjectId(String(projectId)),
        reportType: 'instagram_media_insights',
        dateRange: cacheKey,
        data: result,
        expiresAt,
      },
      {
        upsert: true,
        new: true,
      }
    );

    res.status(200).json(result);
  } catch (error: any) {
    console.error('[Instagram Controller] Error fetching insights:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/instagram/media/:projectId
 * Fetch ALL media (posts/reels/stories) with their insights
 * Query params: limit (number or 'all', default: 100)
 */
export const getMedia = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    if (!project.instagram?.igUserId) {
      res.status(400).json({
        success: false,
        error: 'Instagram account not connected for this project',
      });
      return;
    }

    // Get access token (reuse Facebook token)
    const accessToken = project.instagram.accessToken || await instagramService.getAccessToken(projectId);

    // Parse limit
    let limitValue: number | 'all' = 100;
    if (limit) {
      if (String(limit).toLowerCase() === 'all') {
        limitValue = 'all';
      } else {
        const parsed = parseInt(String(limit), 10);
        if (!isNaN(parsed) && parsed > 0) {
          limitValue = parsed;
        }
      }
    }

    // Fetch ALL media with pagination
    const media = await instagramService.fetchAllMedia(
      project.instagram.igUserId,
      accessToken,
      limitValue
    );

    res.status(200).json({
      success: true,
      data: media,
      meta: {
        count: media.length,
        limit: limitValue,
      },
    });
  } catch (error: any) {
    console.error('[Instagram Controller] Error fetching media:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});
