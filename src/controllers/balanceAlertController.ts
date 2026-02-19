import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import balanceAlertWorker from '../workers/balanceAlertWorker';
import twoChatService from '../services/twoChatService';

/**
 * Manually trigger balance scan
 * Can be called by:
 * 1. Authenticated admin users (via JWT)
 * 2. External cron services (via x-cron-token header)
 */
export const triggerBalanceScan = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // Check for cron secret token in header (for external cron services)
    const cronToken = req.headers['x-cron-token'];
    const expectedToken = process.env.CRON_SECRET_TOKEN;

    // If cron token is provided, validate it
    if (cronToken) {
        if (cronToken !== expectedToken || !expectedToken) {
            res.status(401).json({
                success: false,
                error: 'Unauthorized - Invalid cron token',
            });
            return;
        }
        console.log('[Balance Alert Controller] Scan triggered by external cron service');
    } else {
        // If no cron token, user must be authenticated (JWT middleware handles this)
        console.log('[Balance Alert Controller] Scan triggered by authenticated user');
    }

    try {
        console.log('[Balance Alert Controller] Starting manual scan...');
        const summary = await balanceAlertWorker.runManualScan();

        res.status(200).json({
            success: true,
            message: 'Balance scan completed',
            data: summary,
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

/**
 * Test 2Chat connection
 */
export const testWhatsApp = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { groupId } = req.body;

    if (!groupId) {
        res.status(400).json({
            success: false,
            error: 'groupId is required',
        });
        return;
    }

    try {
        const result = await twoChatService.testConnection(groupId);

        res.status(200).json({
            success: result.success,
            message: result.success ? 'Test message sent' : 'Failed to send message',
            messageId: result.messageId,
            error: result.error,
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
