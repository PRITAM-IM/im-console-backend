import { Request, Response } from 'express';
import googleAdsAuthService from '../services/googleAdsAuthService';
import projectService from '../services/projectService';
import asyncHandler from 'express-async-handler';
import googleAdsDataService from '../services/googleAdsDataService';

export const initiateAuth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;
    const state = projectId ? String(projectId) : undefined;

    console.log(`[Google Ads Initiate Auth] Request received`);
    console.log(`[Google Ads Initiate Auth] Project ID: ${projectId}`);
    console.log(`[Google Ads Initiate Auth] State: ${state}`);
    console.log(`[Google Ads Initiate Auth] Redirect URL configured: ${process.env.GOOGLE_ADS_REDIRECT_URL || 'http://localhost:3000/api/google-ads/callback'}`);

    const authUrl = googleAdsAuthService.generateAuthUrl(state);

    console.log(`[Google Ads Initiate Auth] Generated auth URL (first 150 chars): ${authUrl.substring(0, 150)}...`);

    res.status(200).json({
      success: true,
      data: {
        authUrl,
      },
    });
  } catch (error: any) {
    console.error(`[Google Ads Initiate Auth] Error:`, error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// GET callback handler for OAuth redirect
export const handleCallbackGet = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  console.log(`[Google Ads OAuth Callback] Callback route hit!`);
  console.log(`[Google Ads OAuth Callback] Query params:`, req.query);
  console.log(`[Google Ads OAuth Callback] Full URL:`, req.url);

  const { code, state, error } = req.query;

  if (error) {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/google-ads/callback?error=${encodeURIComponent(String(error))}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/google-ads/callback?error=missing_code_or_state`);
    return;
  }

  const projectId = String(state);

  try {
    console.log(`[Google Ads OAuth Callback] Processing callback for project: ${projectId}`);

    // Handle OAuth callback
    const { accessToken, refreshToken, expiresAt } = await googleAdsAuthService.handleCallback(String(code));
    console.log(`[Google Ads OAuth Callback] Tokens received - Access token: ${accessToken ? 'Yes' : 'No'}, Refresh token: ${refreshToken ? 'Yes' : 'No'}`);

    // Save connection
    console.log(`[Google Ads OAuth Callback] Saving connection to database...`);
    const savedConnection = await googleAdsAuthService.saveConnection(projectId, refreshToken, accessToken, expiresAt);
    console.log(`[Google Ads OAuth Callback] Connection saved successfully - ID: ${savedConnection._id}, Project ID: ${savedConnection.projectId}`);

    // Verify the connection was saved
    const verifyConnection = await googleAdsAuthService.getConnectionByProject(projectId);
    if (!verifyConnection) {
      console.error(`[Google Ads OAuth Callback] ERROR: Connection was not found after save!`);
      throw new Error('Failed to verify connection was saved');
    }
    console.log(`[Google Ads OAuth Callback] Connection verified in database`);

    // Redirect to frontend callback page with success
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/google-ads/callback?ads_connected=${projectId}`);
  } catch (error: any) {
    console.error(`[Google Ads OAuth Callback] ERROR:`, error);
    console.error(`[Google Ads OAuth Callback] Error stack:`, error.stack);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/google-ads/callback?error=${encodeURIComponent(error.message)}`);
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
    const { accessToken, refreshToken, expiresAt } = await googleAdsAuthService.handleCallback(code);

    // Save connection
    await googleAdsAuthService.saveConnection(projectId, refreshToken, accessToken, expiresAt);

    res.status(200).json({
      success: true,
      data: {
        message: 'Google Ads connection established successfully',
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const saveGoogleAdsCustomer = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId, customerId } = req.body;

  if (!projectId || !customerId) {
    res.status(400).json({
      success: false,
      error: 'Project ID and Customer ID are required',
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

    // Update project with Google Ads customer ID
    const updatedProject = await projectService.updateProject(projectId, userId, {
      googleAdsCustomerId: customerId,
    });

    if (!updatedProject) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    // Ensure googleAdsCustomerId is included in response
    const projectData = updatedProject.toObject ? updatedProject.toObject() : updatedProject;

    res.status(200).json({
      success: true,
      data: {
        ...projectData,
        googleAdsCustomerId: customerId, // Explicitly include to ensure it's in response
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getGoogleAdsCustomers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
    const accessToken = await googleAdsDataService.getAccessToken(projectId);

    // Fetch Google Ads customers
    const customers = await googleAdsAuthService.getGoogleAdsCustomers(accessToken);

    res.status(200).json({
      success: true,
      data: customers,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getGoogleAdsOverview = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    if (!project.googleAdsCustomerId) {
      res.status(400).json({
        success: false,
        error: 'Google Ads customer ID not set for this project',
      });
      return;
    }

    // Get access token
    const accessToken = await googleAdsDataService.getAccessToken(projectId);

    // Fetch overview metrics
    const metrics = await googleAdsDataService.getOverviewMetrics(
      project.googleAdsCustomerId,
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

export const getGoogleAdsCampaigns = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    if (!project.googleAdsCustomerId) {
      res.status(400).json({
        success: false,
        error: 'Google Ads customer ID not set for this project',
      });
      return;
    }

    // Get access token
    const accessToken = await googleAdsDataService.getAccessToken(projectId);

    // Fetch campaigns
    const campaigns = await googleAdsDataService.getCampaigns(
      project.googleAdsCustomerId,
      accessToken,
      {
        startDate: startDate as string,
        endDate: endDate as string,
      }
    );

    res.status(200).json({
      success: true,
      data: campaigns,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const getGoogleAdsLocations = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    if (!project.googleAdsCustomerId) {
      res.status(400).json({
        success: false,
        error: 'Google Ads customer ID not set for this project',
      });
      return;
    }

    const accessToken = await googleAdsDataService.getAccessToken(projectId);

    const locations = await googleAdsDataService.getLocationData(
      project.googleAdsCustomerId,
      accessToken,
      {
        startDate: startDate as string,
        endDate: endDate as string,
      }
    );

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

export const getGoogleAdsDevices = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    if (!project.googleAdsCustomerId) {
      res.status(400).json({
        success: false,
        error: 'Google Ads customer ID not set for this project',
      });
      return;
    }

    const accessToken = await googleAdsDataService.getAccessToken(projectId);

    const devices = await googleAdsDataService.getDeviceData(
      project.googleAdsCustomerId,
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

export const getGoogleAdsKeywords = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    if (!project.googleAdsCustomerId) {
      res.status(400).json({
        success: false,
        error: 'Google Ads customer ID not set for this project',
      });
      return;
    }

    const accessToken = await googleAdsDataService.getAccessToken(projectId);

    const keywords = await googleAdsDataService.getKeywords(
      project.googleAdsCustomerId,
      accessToken,
      {
        startDate: startDate as string,
        endDate: endDate as string,
      }
    );

    res.status(200).json({
      success: true,
      data: keywords,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Get daily metrics endpoint for Performance Metrics chart
export const getDailyMetrics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({
        success: false,
        error: 'Project not found',
      });
      return;
    }

    if (!project.googleAdsCustomerId) {
      res.status(400).json({
        success: false,
        error: 'Google Ads customer ID not set for this project',
      });
      return;
    }

    const accessToken = await googleAdsDataService.getAccessToken(projectId);

    const dailyMetrics = await googleAdsDataService.getDailyMetrics(
      project.googleAdsCustomerId,
      accessToken,
      {
        startDate: startDate as string,
        endDate: endDate as string,
      }
    );

    res.status(200).json({
      success: true,
      data: dailyMetrics,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Diagnostic endpoint to check Google Ads API status
export const diagnoseGoogleAds = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId } = req.params;
  const ENV = require('../config/env').ENV;

  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    configuration: {
      developerTokenConfigured: !!ENV.GOOGLE_ADS_DEVELOPER_TOKEN,
      developerTokenLength: ENV.GOOGLE_ADS_DEVELOPER_TOKEN?.length || 0,
      loginCustomerIdConfigured: !!ENV.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      loginCustomerId: ENV.GOOGLE_ADS_LOGIN_CUSTOMER_ID || 'NOT SET',
    },
    apiTests: {},
  };

  try {
    // @ts-ignore
    const userId = req.user._id.toString();

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found', diagnostics });
      return;
    }

    diagnostics.project = {
      id: projectId,
      googleAdsCustomerId: project.googleAdsCustomerId || 'NOT SET',
    };

    // Get access token
    const accessToken = await googleAdsDataService.getAccessToken(projectId);
    diagnostics.accessToken = {
      obtained: true,
      length: accessToken.length,
    };

    // Test 1: List Accessible Customers (this doesn't need login-customer-id)
    try {
      const listUrl = 'https://googleads.googleapis.com/v19/customers:listAccessibleCustomers';
      const listResponse = await fetch(listUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': ENV.GOOGLE_ADS_DEVELOPER_TOKEN,
        },
      });

      const listData = await listResponse.json();
      diagnostics.apiTests.listAccessibleCustomers = {
        status: listResponse.status,
        success: listResponse.ok,
        data: listData,
      };
    } catch (err: any) {
      diagnostics.apiTests.listAccessibleCustomers = { error: err.message };
    }

    // Test 2: Try querying the manager account directly (if configured)
    if (ENV.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
      try {
        const managerId = ENV.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, '');
        const managerUrl = `https://googleads.googleapis.com/v19/customers/${managerId}/googleAds:search`;
        const query = 'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1';

        const managerResponse = await fetch(managerUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': ENV.GOOGLE_ADS_DEVELOPER_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        });

        const managerData = await managerResponse.json();
        diagnostics.apiTests.queryManagerAccount = {
          managerId,
          status: managerResponse.status,
          success: managerResponse.ok,
          data: managerData,
        };
      } catch (err: any) {
        diagnostics.apiTests.queryManagerAccount = { error: err.message };
      }
    }

    // Test 3: Try querying the client account (if set)
    if (project.googleAdsCustomerId) {
      try {
        const clientId = project.googleAdsCustomerId.replace(/-/g, '');
        const loginId = ENV.GOOGLE_ADS_LOGIN_CUSTOMER_ID
          ? ENV.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/g, '')
          : clientId;
        const clientUrl = `https://googleads.googleapis.com/v19/customers/${clientId}/googleAds:search`;
        const query = 'SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1';

        const clientResponse = await fetch(clientUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': ENV.GOOGLE_ADS_DEVELOPER_TOKEN,
            'login-customer-id': loginId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        });

        const clientData = await clientResponse.json();
        diagnostics.apiTests.queryClientAccount = {
          clientId,
          loginCustomerId: loginId,
          status: clientResponse.status,
          success: clientResponse.ok,
          data: clientData,
        };
      } catch (err: any) {
        diagnostics.apiTests.queryClientAccount = { error: err.message };
      }
    }

    res.status(200).json({
      success: true,
      diagnostics,
    });
  } catch (error: any) {
    diagnostics.error = error.message;
    res.status(400).json({
      success: false,
      error: error.message,
      diagnostics,
    });
  }
});

