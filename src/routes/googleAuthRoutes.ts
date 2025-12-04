import express from 'express';
import {
  initiateGoogleAuth,
  handleGoogleCallback,
} from '../controllers/authController';

const router = express.Router();

router.get('/auth/google', initiateGoogleAuth);
router.get('/auth/google/callback', handleGoogleCallback);

export default router;