import express from 'express';
import {
  initiateAuth,
  handleCallback,
  handleCallbackGet,
  saveFolder,
  listFolders,
  listFiles,
  getStorageQuota,
  getDriveStats,
  getRecentFiles,
} from '../controllers/googleDriveController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/auth', authenticate, initiateAuth);
router.get('/callback', handleCallbackGet);
router.post('/callback', authenticate, handleCallback);
router.post('/folder', authenticate, saveFolder);
router.get('/folders/:projectId', authenticate, listFolders);
router.get('/:projectId/files', authenticate, listFiles);
router.get('/:projectId/quota', authenticate, getStorageQuota);
router.get('/:projectId/stats', authenticate, getDriveStats);
router.get('/:projectId/recent', authenticate, getRecentFiles);

export default router;





