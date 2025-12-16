import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import projectService from '../services/projectService';
import Project from '../models/Project';
import GoogleAdsConnection from '../models/GoogleAdsConnection';
import GoogleSearchConsoleConnection from '../models/GoogleSearchConsoleConnection';
import YouTubeConnection from '../models/YouTubeConnection';
import FacebookConnection from '../models/FacebookConnection';
import MetaAdsConnection from '../models/MetaAdsConnection';
import LinkedInConnection from '../models/LinkedInConnection';
import GoogleSheetsConnection from '../models/GoogleSheetsConnection';
import GoogleDriveConnection from '../models/GoogleDriveConnection';

// Google Ads Disconnect
export const disconnectGoogleAds = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.body;

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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    await GoogleAdsConnection.deleteMany({ projectId });
    await Project.findByIdAndUpdate(projectId, {
      $unset: { googleAdsCustomerId: 1, googleAdsCurrency: 1 }
    });

    res.status(200).json({
      success: true,
      data: { message: 'Google Ads disconnected successfully' },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Google Search Console Disconnect
export const disconnectGoogleSearchConsole = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.body;

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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    await GoogleSearchConsoleConnection.deleteMany({ projectId });
    await Project.findByIdAndUpdate(projectId, {
      $unset: { searchConsoleSiteUrl: 1 }
    });

    res.status(200).json({
      success: true,
      data: { message: 'Google Search Console disconnected successfully' },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// YouTube Disconnect
export const disconnectYouTube = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.body;

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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    await YouTubeConnection.deleteMany({ projectId });
    await Project.findByIdAndUpdate(projectId, {
      $unset: { youtubeChannelId: 1, youtubeChannelName: 1 }
    });

    res.status(200).json({
      success: true,
      data: { message: 'YouTube disconnected successfully' },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Facebook Disconnect
export const disconnectFacebook = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.body;

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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    await FacebookConnection.deleteMany({ projectId });
    await Project.findByIdAndUpdate(projectId, {
      $unset: { facebookPageId: 1, facebookPageName: 1, facebookPageAccessToken: 1 }
    });

    res.status(200).json({
      success: true,
      data: { message: 'Facebook disconnected successfully' },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Instagram Disconnect
export const disconnectInstagram = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.body;

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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    // Instagram uses Facebook connection model
    await FacebookConnection.deleteMany({ projectId });
    await Project.findByIdAndUpdate(projectId, {
      $unset: { instagram: 1 }
    });

    res.status(200).json({
      success: true,
      data: { message: 'Instagram disconnected successfully' },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Meta Ads Disconnect
export const disconnectMetaAds = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.body;

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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    await MetaAdsConnection.deleteMany({ projectId });
    await Project.findByIdAndUpdate(projectId, {
      $unset: { metaAdsAccountId: 1, metaAdsCurrency: 1, metaAdsAccountName: 1 }
    });

    res.status(200).json({
      success: true,
      data: { message: 'Meta Ads disconnected successfully' },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// LinkedIn Disconnect
export const disconnectLinkedIn = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.body;

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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    await LinkedInConnection.deleteMany({ projectId });
    await Project.findByIdAndUpdate(projectId, {
      $unset: { linkedinPageId: 1, linkedinPageName: 1 }
    });

    res.status(200).json({
      success: true,
      data: { message: 'LinkedIn disconnected successfully' },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Google Sheets Disconnect
export const disconnectGoogleSheets = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.body;

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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    await GoogleSheetsConnection.deleteMany({ projectId });
    await Project.findByIdAndUpdate(projectId, {
      $unset: { googleSheetsSpreadsheetId: 1, googleSheetsSpreadsheetName: 1 }
    });

    res.status(200).json({
      success: true,
      data: { message: 'Google Sheets disconnected successfully' },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Google Drive Disconnect
export const disconnectGoogleDrive = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.body;

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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    await GoogleDriveConnection.deleteMany({ projectId });
    await Project.findByIdAndUpdate(projectId, {
      $unset: { googleDriveFolderId: 1, googleDriveFolderName: 1 }
    });

    res.status(200).json({
      success: true,
      data: { message: 'Google Drive disconnected successfully' },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Google Places Disconnect
export const disconnectGooglePlaces = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.body;

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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    // Google Places doesn't have a connection model, just remove the field from project
    await Project.findByIdAndUpdate(projectId, {
      $unset: { googlePlacesId: 1 }
    });

    res.status(200).json({
      success: true,
      data: { message: 'Google Places disconnected successfully' },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});
