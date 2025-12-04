import { Request, Response } from 'express';
import authService from '../services/authService';
import { userOauth2Client } from '../config/google';
import asyncHandler from 'express-async-handler';
import User, { IUser } from '../models/User';
import { google } from 'googleapis';
import { ENV } from '../config/env';

const buildUserResponse = (user: IUser) => ({
  id: user._id,
  email: user.email,
  name: user.name,
  role: user.role,
});

export const register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email, password, name, role } = req.body;

  try {
    const { user, token } = await authService.registerUser(email, password, name, role);

    res.status(201).json({
      token,
      user: buildUserResponse(user),
    });
  } catch (error: any) {
    res.status(400).json({
      message: error.message,
    });
  }
});

export const login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  try {
    const { user, token } = await authService.loginUser(email, password);

    res.status(200).json({
      token,
      user: buildUserResponse(user),
    });
  } catch (error: any) {
    res.status(401).json({
      message: error.message,
    });
  }
});

export const getMe = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  // @ts-ignore
  const user = req.user;

  res.status(200).json(buildUserResponse(user));
});

export const initiateGoogleAuth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const authUrl = userOauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'consent',
    });
    
    res.redirect(authUrl);
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export const handleGoogleCallback = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { code } = req.query;

  if (!code) {
    res.status(400).json({
      success: false,
      error: 'Authorization code is required',
    });
    return;
  }

  try {
    // Exchange code for tokens
    const { tokens } = await userOauth2Client.getToken(code as string);
    userOauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: userOauth2Client });
    const { data } = await oauth2.userinfo.get();
    
    const { email, name } = data;
    
    if (!email) {
      throw new Error('Email not provided by Google');
    }

    // Check if user exists, if not create them
    let user = await User.findOne({ email });
    
    if (!user) {
      // Create new user with default role
      user = await User.create({
        email,
        name: name || email.split('@')[0],
        password: 'google_auth', // Placeholder password
        role: 'hotel_manager',
      });
    }

    // Generate token
    const token = authService.generateToken(user._id.toString());

    // Redirect to frontend with token
    const redirectUrl = new URL(ENV.GOOGLE_USER_REDIRECT_URL);
    redirectUrl.searchParams.set('token', token);
    redirectUrl.searchParams.set(
      'user',
      JSON.stringify(buildUserResponse(user))
    );

    res.redirect(redirectUrl.toString());
  } catch (error: any) {
    res.status(400).json({
      message: error.message,
    });
  }
});