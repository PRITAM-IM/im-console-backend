import { Request, Response } from 'express';
import googleSheetsAuthService from '../services/googleSheetsAuthService';
import googleSheetsDataService from '../services/googleSheetsDataService';
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
    const authUrl = googleSheetsAuthService.generateAuthUrl(state);
    
    console.log(`[Google Sheets Controller] Generated auth URL for project: ${projectId}`);
    
    res.json({ success: true, authUrl });
  } catch (error: any) {
    console.error('[Google Sheets Controller] Error initiating auth:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const handleCallbackGet = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('[Google Sheets Controller] OAuth error:', error);
      res.redirect(`${ENV.GOOGLE_USER_REDIRECT_URL.replace('/auth/google/callback', '/auth/google-sheets/callback')}?error=${encodeURIComponent(error as string)}`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${ENV.GOOGLE_USER_REDIRECT_URL.replace('/auth/google/callback', '/auth/google-sheets/callback')}?error=missing_params`);
      return;
    }

    let projectId: string;
    try {
      const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString());
      projectId = decodedState.projectId;
    } catch (e) {
      res.redirect(`${ENV.GOOGLE_USER_REDIRECT_URL.replace('/auth/google/callback', '/auth/google-sheets/callback')}?error=invalid_state`);
      return;
    }

    const tokens = await googleSheetsAuthService.handleCallback(code as string);
    await googleSheetsAuthService.saveConnection(
      projectId,
      tokens.refreshToken,
      tokens.accessToken,
      tokens.expiresAt
    );

    console.log(`[Google Sheets Controller] Connection saved for project: ${projectId}`);
    
    res.redirect(`${ENV.GOOGLE_USER_REDIRECT_URL.replace('/auth/google/callback', '/auth/google-sheets/callback')}?success=true&projectId=${projectId}`);
  } catch (error: any) {
    console.error('[Google Sheets Controller] Callback error:', error);
    res.redirect(`${ENV.GOOGLE_USER_REDIRECT_URL.replace('/auth/google/callback', '/auth/google-sheets/callback')}?error=${encodeURIComponent(error.message)}`);
  }
};

export const handleCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, projectId } = req.body;

    if (!code || !projectId) {
      res.status(400).json({ success: false, error: 'Code and project ID are required' });
      return;
    }

    const tokens = await googleSheetsAuthService.handleCallback(code);
    await googleSheetsAuthService.saveConnection(
      projectId,
      tokens.refreshToken,
      tokens.accessToken,
      tokens.expiresAt
    );

    res.json({ success: true, message: 'Google Sheets connected successfully' });
  } catch (error: any) {
    console.error('[Google Sheets Controller] Callback error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const saveSpreadsheet = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, spreadsheetId } = req.body;

    if (!projectId || !spreadsheetId) {
      res.status(400).json({ success: false, error: 'Project ID and Spreadsheet ID are required' });
      return;
    }

    const project = await Project.findByIdAndUpdate(
      projectId,
      { googleSheetId: spreadsheetId },
      { new: true }
    );

    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    console.log(`[Google Sheets Controller] Spreadsheet saved for project: ${projectId}`);
    
    res.json({ success: true, data: project });
  } catch (error: any) {
    console.error('[Google Sheets Controller] Error saving spreadsheet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const listSpreadsheets = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      res.status(400).json({ success: false, error: 'Project ID is required' });
      return;
    }

    const spreadsheets = await googleSheetsDataService.listSpreadsheets(projectId);
    
    res.json({ success: true, data: spreadsheets });
  } catch (error: any) {
    console.error('[Google Sheets Controller] Error listing spreadsheets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getSpreadsheetDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { spreadsheetId } = req.query;

    if (!projectId) {
      res.status(400).json({ success: false, error: 'Project ID is required' });
      return;
    }

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const sheetId = (spreadsheetId as string) || project.googleSheetId;
    if (!sheetId) {
      res.status(400).json({ success: false, error: 'No spreadsheet connected' });
      return;
    }

    const details = await googleSheetsDataService.getSpreadsheetDetails(projectId, sheetId);
    
    res.json({ success: true, data: details });
  } catch (error: any) {
    console.error('[Google Sheets Controller] Error getting spreadsheet details:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getSheetValues = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { spreadsheetId, range } = req.query;

    if (!projectId || !range) {
      res.status(400).json({ success: false, error: 'Project ID and range are required' });
      return;
    }

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }

    const sheetId = (spreadsheetId as string) || project.googleSheetId;
    if (!sheetId) {
      res.status(400).json({ success: false, error: 'No spreadsheet connected' });
      return;
    }

    const values = await googleSheetsDataService.getSheetValues(projectId, sheetId, range as string);
    
    res.json({ success: true, data: values });
  } catch (error: any) {
    console.error('[Google Sheets Controller] Error getting sheet values:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};





