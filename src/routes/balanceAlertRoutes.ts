import express from 'express';
import { triggerBalanceScan, testWhatsApp } from '../controllers/balanceAlertController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

// Manual balance scan (protected)
router.post('/scan', authenticate, triggerBalanceScan);

// Test WhatsApp connection (protected)
router.post('/test-whatsapp', authenticate, testWhatsApp);

export default router;
