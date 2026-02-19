/**
 * Balance Monitor Service
 * Scans all projects with Meta Ads connections and checks for low balances
 */

import Project from '../models/Project';
import BalanceAlert from '../models/BalanceAlert';
import metaAdsDataService from './metaAdsDataService';
import twoChatService from './twoChatService';

export interface BalanceCheckResult {
    projectId: string;
    projectName: string;
    balance: number;
    currency: string;
    isLowBalance: boolean;
    alertSent: boolean;
    error?: string;
}

class BalanceMonitorService {
    private threshold: number;
    private whatsappGroupId: string;

    constructor() {
        this.threshold = parseInt(process.env.BALANCE_ALERT_THRESHOLD || '5000', 10);
        this.whatsappGroupId = process.env.TWOCHAT_WHATSAPP_GROUP_ID || '';
    }

    /**
     * Check if an alert was recently sent for this project (within last 24 hours)
     */
    private async wasRecentlyAlerted(projectId: string): Promise<boolean> {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const recentAlert = await BalanceAlert.findOne({
            projectId,
            alertSentAt: { $gte: twentyFourHoursAgo },
            status: 'sent',
        });

        return !!recentAlert;
    }

    /**
     * Scan a single project for low balance
     */
    private async checkProjectBalance(project: any): Promise<BalanceCheckResult> {
        const result: BalanceCheckResult = {
            projectId: project._id.toString(),
            projectName: project.name,
            balance: 0,
            currency: 'INR',
            isLowBalance: false,
            alertSent: false,
        };

        try {
            // Get access token and fetch balance
            const accessToken = await metaAdsDataService.getAccessToken(project._id.toString());
            const balanceData = await metaAdsDataService.getAccountBalance(
                project.metaAdsAccountId,
                accessToken
            );

            result.balance = balanceData.balance;
            result.currency = balanceData.currency;

            // Check if balance is below threshold
            if (balanceData.balance < this.threshold) {
                result.isLowBalance = true;

                // Check if we already sent an alert recently
                const recentlyAlerted = await this.wasRecentlyAlerted(project._id.toString());

                if (!recentlyAlerted && this.whatsappGroupId) {
                    // Send WhatsApp alert
                    const alertResult = await twoChatService.sendLowBalanceAlert({
                        groupId: this.whatsappGroupId,
                        projectName: project.name,
                        accountName: balanceData.accountName || 'Unknown Account',
                        balance: balanceData.balance,
                        currency: balanceData.currency,
                        threshold: this.threshold,
                        projectId: project._id.toString(),
                    });

                    if (alertResult.success) {
                        // Save alert record
                        await BalanceAlert.create({
                            projectId: project._id,
                            projectName: project.name,
                            balance: balanceData.balance,
                            currency: balanceData.currency,
                            threshold: this.threshold,
                            whatsappGroupId: this.whatsappGroupId,
                            messageId: alertResult.messageId,
                            status: 'sent',
                        });

                        result.alertSent = true;
                        console.log(`[Balance Monitor] Alert sent for ${project.name} (₹${balanceData.balance})`);
                    } else {
                        // Save failed alert
                        await BalanceAlert.create({
                            projectId: project._id,
                            projectName: project.name,
                            balance: balanceData.balance,
                            currency: balanceData.currency,
                            threshold: this.threshold,
                            whatsappGroupId: this.whatsappGroupId,
                            status: 'failed',
                            errorMessage: alertResult.error,
                        });

                        result.error = alertResult.error;
                        console.error(`[Balance Monitor] Failed to send alert for ${project.name}:`, alertResult.error);
                    }
                } else if (recentlyAlerted) {
                    console.log(`[Balance Monitor] Skipping ${project.name} - alert sent recently`);
                }
            }
        } catch (error: any) {
            result.error = error.message;
            console.error(`[Balance Monitor] Error checking ${project.name}:`, error.message);
        }

        return result;
    }

    /**
     * Scan all projects with Meta Ads connections
     */
    async scanAllProjects(): Promise<{
        total: number;
        checked: number;
        lowBalance: number;
        alertsSent: number;
        errors: number;
        results: BalanceCheckResult[];
    }> {
        console.log('[Balance Monitor] Starting scan...');

        try {
            // Find all projects with Meta Ads connected
            const projects = await Project.find({
                metaAdsAccountId: { $exists: true, $ne: null },
            }).select('_id name metaAdsAccountId');

            console.log(`[Balance Monitor] Found ${projects.length} projects with Meta Ads`);

            const results: BalanceCheckResult[] = [];
            let checked = 0;
            let lowBalance = 0;
            let alertsSent = 0;
            let errors = 0;

            // Check each project
            for (const project of projects) {
                const result = await this.checkProjectBalance(project);
                results.push(result);

                checked++;
                if (result.isLowBalance) lowBalance++;
                if (result.alertSent) alertsSent++;
                if (result.error) errors++;

                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const summary = {
                total: projects.length,
                checked,
                lowBalance,
                alertsSent,
                errors,
                results,
            };

            console.log('[Balance Monitor] Scan complete:', {
                total: summary.total,
                checked: summary.checked,
                lowBalance: summary.lowBalance,
                alertsSent: summary.alertsSent,
                errors: summary.errors,
            });

            return summary;
        } catch (error: any) {
            console.error('[Balance Monitor] Scan failed:', error);
            throw error;
        }
    }
}

export default new BalanceMonitorService();
