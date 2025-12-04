import { Request, Response } from 'express';
import analyticsService from '../services/analyticsService';
import projectService from '../services/projectService';
import asyncHandler from 'express-async-handler';

export const getOverviewMetrics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

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

    // Check if project has GA property ID
    if (!project.gaPropertyId) {
      res.status(400).json({
        success: false,
        error: 'Project is not linked to a Google Analytics property',
      });
      return;
    }

    console.log(`Fetching analytics for project ${projectId}, property ${project.gaPropertyId}`);

    const data = await analyticsService.getOverviewMetrics(
      projectId,
      project.gaPropertyId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error in getOverviewMetrics:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to fetch overview metrics',
    });
  }
});

export const getSessionChannels = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

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

    // Check if project has GA property ID
    if (!project.gaPropertyId) {
      res.status(400).json({
        success: false,
        error: 'Project is not linked to a Google Analytics property',
      });
      return;
    }

    const data = await analyticsService.getSessionChannels(
      projectId,
      project.gaPropertyId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getConversionsByChannel = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

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

    // Check if project has GA property ID
    if (!project.gaPropertyId) {
      res.status(400).json({
        success: false,
        error: 'Project is not linked to a Google Analytics property',
      });
      return;
    }

    const data = await analyticsService.getConversionsByChannel(
      projectId,
      project.gaPropertyId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getGeoData = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

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

    // Check if project has GA property ID
    if (!project.gaPropertyId) {
      res.status(400).json({
        success: false,
        error: 'Project is not linked to a Google Analytics property',
      });
      return;
    }

    const data = await analyticsService.getGeoData(
      projectId,
      project.gaPropertyId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getDeviceData = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

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

    // Check if project has GA property ID
    if (!project.gaPropertyId) {
      res.status(400).json({
        success: false,
        error: 'Project is not linked to a Google Analytics property',
      });
      return;
    }

    const data = await analyticsService.getDeviceData(
      projectId,
      project.gaPropertyId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getTopLandingPages = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

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

    // Check if project has GA property ID
    if (!project.gaPropertyId) {
      res.status(400).json({
        success: false,
        error: 'Project is not linked to a Google Analytics property',
      });
      return;
    }

    const data = await analyticsService.getTopLandingPages(
      projectId,
      project.gaPropertyId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getSessionSources = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

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

    // Check if project has GA property ID
    if (!project.gaPropertyId) {
      res.status(400).json({
        success: false,
        error: 'Project is not linked to a Google Analytics property',
      });
      return;
    }

    const data = await analyticsService.getSessionSources(
      projectId,
      project.gaPropertyId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Helper function to validate dates and project
const validateAnalyticsRequest = async (projectId: string, userId: string, startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) {
    throw new Error('Start date and end date are required');
  }

  const project = await projectService.getProjectById(projectId, userId);
  if (!project) {
    throw new Error('Project not found');
  }

  if (!project.gaPropertyId) {
    throw new Error('Project is not linked to a Google Analytics property');
  }

  return project;
};

export const getBrowserData = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

  try {
    // @ts-ignore
    const userId = req.user._id.toString();
    const project = await validateAnalyticsRequest(projectId, userId, startDate, endDate);

    const data = await analyticsService.getBrowserData(
      projectId,
      project.gaPropertyId!,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getCampaignData = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

  try {
    // @ts-ignore
    const userId = req.user._id.toString();
    const project = await validateAnalyticsRequest(projectId, userId, startDate, endDate);

    const data = await analyticsService.getCampaignData(
      projectId,
      project.gaPropertyId!,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getSourceMediumCampaign = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

  try {
    // @ts-ignore
    const userId = req.user._id.toString();
    const project = await validateAnalyticsRequest(projectId, userId, startDate, endDate);

    const data = await analyticsService.getSourceMediumCampaign(
      projectId,
      project.gaPropertyId!,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getRevenueMetrics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

  try {
    // @ts-ignore
    const userId = req.user._id.toString();
    const project = await validateAnalyticsRequest(projectId, userId, startDate, endDate);

    const data = await analyticsService.getRevenueMetrics(
      projectId,
      project.gaPropertyId!,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getTimeBasedAnalytics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

  try {
    // @ts-ignore
    const userId = req.user._id.toString();
    const project = await validateAnalyticsRequest(projectId, userId, startDate, endDate);

    const data = await analyticsService.getTimeBasedAnalytics(
      projectId,
      project.gaPropertyId!,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getSessionSourceMedium = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

  try {
    // @ts-ignore
    const userId = req.user._id.toString();
    const project = await validateAnalyticsRequest(projectId, userId, startDate, endDate);

    const data = await analyticsService.getSessionSourceMedium(
      projectId,
      project.gaPropertyId!,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getGoogleAdsCampaigns = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.query as { startDate: string; endDate: string };

  try {
    // @ts-ignore
    const userId = req.user._id.toString();
    const project = await validateAnalyticsRequest(projectId, userId, startDate, endDate);

    const data = await analyticsService.getGoogleAdsCampaigns(
      projectId,
      project.gaPropertyId!,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});