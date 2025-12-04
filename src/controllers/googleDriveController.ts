import { Request, Response } from 'express';
import googleDriveAuthService from '../services/googleDriveAuthService';
import googleDriveDataService from '../services/googleDriveDataService';
import Project from '../models/Project';
import { ENV } from '../config/env';

export const initiateAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      res.status(400).json({ success: false, error: 'Project ID is required' });
      return;
    }

    const state = Buffer.from(JSON.stringify({ projectId })).toString('base64');
    const authUrl = googleDriveAuthService.generateAuthUrl(state);
    
    console.log(`[Google Drive Controller] Generated auth URL for project: ${projectId}`);
    
    res.json({ success: true, authUrl });
  } catch (error: any) {
    console.error('[Google Drive Controller] Error initiating auth:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const handleCallbackGet = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('[Google Drive Controller] OAuth error:', error);
      res.redirect(`${ENV.GOOGLE_USER_REDIRECT_URL.replace('/auth/google/callback', '/auth/google-drive/callback')}?error=${encodeURIComponent(error as string)}`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${ENV.GOOGLE_USER_REDIRECT_URL.replace('/auth/google/callback', '/auth/google-drive/callback')}?error=missing_params`);
      return;
    }

    let projectId: string;
    try {
      const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString());
      projectId = decodedState.projectId;
    } catch (e) {
      res.redirect(`${ENV.GOOGLE_USER_REDIRECT_URL.replace('/auth/google/callback', '/auth/google-drive/callback')}?error=invalid_state`);
      return;
    }

    const tokens = await googleDriveAuthService.handleCallback(code as string);
    await googleDriveAuthService.saveConnection(
      projectId,
      tokens.refreshToken,
      tokens.accessToken,
      tokens.expiresAt
    );

    console.log(`[Google Drive Controller] Connection saved for project: ${projectId}`);
    
    res.redirect(`${ENV.GOOGLE_USER_REDIRECT_URL.replace('/auth/google/callback', '/auth/google-drive/callback')}?success=true&projectId=${projectId}`);
  } catch (error: any) {
    console.error('[Google Drive Controller] Callback error:', error);
    res.redirect(`${ENV.GOOGLE_USER_REDIRECT_URL.replace('/auth/google/callback', '/auth/google-drive/callback')}?error=${encodeURIComponent(error.message)}`);
  }
};

export const handleCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, projectId } = req.body;

    if (!code || !projectId) {
      res.status(400).json({ success: false, error: 'Code and project ID are required' });
      return;
    }

    const tokens = await googleDriveAuthService.handleCallback(code);
    await googleDriveAuthService.saveConnection(
      projectId,
      tokens.refreshToken,
      tokens.accessToken,
      tokens.expiresAt
    );

    res.json({ success: true, message: 'Google Drive connected successfully' });
  } catch (error: any) {
    console.error('[Google Drive Controller] Callback error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const saveFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, folderId } = req.body;

    if (!projectId || !folderId) {
      res.status(400).json({ success: false, error: 'Project ID and Folder ID are required' });
      return;
    }

    const project = await Project.findByIdAndUpdate(
      projectId,
      { googleDriveFolderId: folderId },
      { new: true }
    );

    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    console.log(`[Google Drive Controller] Folder saved for project: ${projectId}`);
    
    res.json({ success: true, data: project });
  } catch (error: any) {
    console.error('[Google Drive Controller] Error saving folder:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const listFolders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      res.status(400).json({ success: false, error: 'Project ID is required' });
      return;
    }

    const folders = await googleDriveDataService.listFolders(projectId);
    
    res.json({ success: true, data: folders });
  } catch (error: any) {
    console.error('[Google Drive Controller] Error listing folders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const listFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { folderId, pageSize } = req.query;

    if (!projectId) {
      res.status(400).json({ success: false, error: 'Project ID is required' });
      return;
    }

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const folder = (folderId as string) || project.googleDriveFolderId;
    const files = await googleDriveDataService.listFiles(
      projectId, 
      folder || undefined, 
      pageSize ? parseInt(pageSize as string) : 50
    );
    
    res.json({ success: true, data: files });
  } catch (error: any) {
    console.error('[Google Drive Controller] Error listing files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getStorageQuota = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      res.status(400).json({ success: false, error: 'Project ID is required' });
      return;
    }

    const quota = await googleDriveDataService.getStorageQuota(projectId);
    
    res.json({ success: true, data: quota });
  } catch (error: any) {
    console.error('[Google Drive Controller] Error getting storage quota:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getDriveStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      res.status(400).json({ success: false, error: 'Project ID is required' });
      return;
    }

    const stats = await googleDriveDataService.getDriveStats(projectId);
    
    res.json({ success: true, data: stats });
  } catch (error: any) {
    console.error('[Google Drive Controller] Error getting drive stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getRecentFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { limit } = req.query;

    if (!projectId) {
      res.status(400).json({ success: false, error: 'Project ID is required' });
      return;
    }

    const files = await googleDriveDataService.getRecentFiles(
      projectId, 
      limit ? parseInt(limit as string) : 10
    );
    
    res.json({ success: true, data: files });
  } catch (error: any) {
    console.error('[Google Drive Controller] Error getting recent files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};





