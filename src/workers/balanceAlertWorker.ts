/**
 * Balance Alert Worker
 * Runs on a cron schedule to check Meta Ads balances and send alerts
 */

import * as cron from 'node-cron';
import balanceMonitorService from '../services/balanceMonitorService';

class BalanceAlertWorker {
    private cronJob: cron.ScheduledTask | null = null;
    private isRunning = false;

    /**
     * Start the cron job
     */
    start() {
        // Check if feature is enabled
        if (process.env.BALANCE_ALERT_ENABLED !== 'true') {
            console.log('[Balance Alert Worker] Feature disabled (BALANCE_ALERT_ENABLED=false)');
            return;
        }

        // Validate required env variables
        if (!process.env.TWOCHAT_API_KEY) {
            console.warn('[Balance Alert Worker] TWOCHAT_API_KEY not configured');
            return;
        }

        if (!process.env.TWOCHAT_WHATSAPP_GROUP_ID) {
            console.warn('[Balance Alert Worker] TWOCHAT_WHATSAPP_GROUP_ID not configured');
            return;
        }

        const cronSchedule = process.env.BALANCE_ALERT_CRON || '0 */3 * * *'; // Default: every 3 hours

        console.log(`[Balance Alert Worker] Starting with schedule: ${cronSchedule}`);

        this.cronJob = cron.schedule(cronSchedule, async () => {
            if (this.isRunning) {
                console.log('[Balance Alert Worker] Previous scan still running, skipping...');
                return;
            }

            this.isRunning = true;

            try {
                console.log('[Balance Alert Worker] Starting scheduled scan...');
                const startTime = Date.now();

                const summary = await balanceMonitorService.scanAllProjects();

                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                console.log(`[Balance Alert Worker] Scan completed in ${duration}s:`, {
                    total: summary.total,
                    lowBalance: summary.lowBalance,
                    alertsSent: summary.alertsSent,
                    errors: summary.errors,
                });
            } catch (error: any) {
                console.error('[Balance Alert Worker] Scan failed:', error.message);
            } finally {
                this.isRunning = false;
            }
        });

        console.log('[Balance Alert Worker] Cron job started successfully');
    }

    /**
     * Stop the cron job
     */
    stop() {
        if (this.cronJob) {
            this.cronJob.stop();
            console.log('[Balance Alert Worker] Stopped');
        }
    }

    /**
     * Run a manual scan (for testing)
     */
    async runManualScan() {
        if (this.isRunning) {
            console.log('[Balance Alert Worker] Scan already running');
            return;
        }

        console.log('[Balance Alert Worker] Running manual scan...');
        this.isRunning = true;

        try {
            const summary = await balanceMonitorService.scanAllProjects();
            console.log('[Balance Alert Worker] Manual scan complete:', summary);
            return summary;
        } catch (error: any) {
            console.error('[Balance Alert Worker] Manual scan failed:', error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }
}

export default new BalanceAlertWorker();
