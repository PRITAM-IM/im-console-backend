import express from 'express';
import {
  initiateAuth,
  handleCallback,
  handleCallbackGet,
  saveSpreadsheet,
  listSpreadsheets,
  getSpreadsheetDetails,
  getSheetValues,
} from '../controllers/googleSheetsController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/auth', authenticate, initiateAuth);
router.get('/callback', handleCallbackGet);
router.post('/callback', authenticate, handleCallback);
router.post('/spreadsheet', authenticate, saveSpreadsheet);
router.get('/spreadsheets/:projectId', authenticate, listSpreadsheets);
router.get('/:projectId/details', authenticate, getSpreadsheetDetails);
router.get('/:projectId/values', authenticate, getSheetValues);

export default router;





