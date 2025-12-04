import express from 'express';
import { register, login, getMe, initiateGoogleAuth, handleGoogleCallback } from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.get('/google', initiateGoogleAuth);
router.get('/google/callback', handleGoogleCallback);

export default router;