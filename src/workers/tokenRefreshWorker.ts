/**
 * Token Refresh Worker
 * Proactively refreshes ALL Google OAuth access tokens every 45 minutes.
 * Ensures users never see "Session Expired" warnings due to access token expiry.
 *
 * Google access tokens expire after ~1 hour.
 * This worker refreshes any token expiring within the next 15 minutes.
 * Covers: Google Analytics, YouTube, Google Ads, Search Console, GBP, Drive, Sheets
 */

import * as cron from 'node-cron';
import { google } from 'googleapis';
import { Model, Document } from 'mongoose';

// ─── Models ────────────────────────────────────────────────────────────────
import GAConnection from '../models/GAConnection';
import YouTubeConnection from '../models/YouTubeConnection';
import GoogleAdsConnection from '../models/GoogleAdsConnection';
import GoogleSearchConsoleConnection from '../models/GoogleSearchConsoleConnection';
import GoogleBusinessProfileConnection from '../models/GoogleBusinessProfileConnection';
import GoogleDriveConnection from '../models/GoogleDriveConnection';
import GoogleSheetsConnection from '../models/GoogleSheetsConnection';

// ─── OAuth2 Clients ─────────────────────────────────────────────────────────
import { oauth2Client } from '../config/google';                          // GA
import { youtubeOauth2Client } from '../config/youtube';                  // YouTube
import { googleAdsOauth2Client } from '../config/googleAds';              // Google Ads
import { googleSearchConsoleOauth2Client } from '../config/googleSearchConsole'; // Search Console
import { googleBusinessProfileOauth2Client } from '../config/googleBusinessProfile'; // GBP
import { googleDriveOauth2Client } from '../config/googleDrive';          // Drive
import { googleSheetsOauth2Client } from '../config/googleSheets';        // Sheets

// ─── Types ──────────────────────────────────────────────────────────────────
interface TokenConnection extends Document {
    projectId: any;
    refreshToken: string;
    accessToken?: string;
    expiresAt?: Date;
}

interface ServiceConfig {
    name: string;
    model: Model<any>;
    oauthClient: any;
}

// ─── Service Registry ───────────────────────────────────────────────────────
const GOOGLE_SERVICES: ServiceConfig[] = [
    { name: 'Google Analytics', model: GAConnection, oauthClient: oauth2Client },
    { name: 'YouTube', model: YouTubeConnection, oauthClient: youtubeOauth2Client },
    { name: 'Google Ads', model: GoogleAdsConnection, oauthClient: googleAdsOauth2Client },
    { name: 'Search Console', model: GoogleSearchConsoleConnection, oauthClient: googleSearchConsoleOauth2Client },
    { name: 'Business Profile', model: GoogleBusinessProfileConnection, oauthClient: googleBusinessProfileOauth2Client },
    { name: 'Google Drive', model: GoogleDriveConnection, oauthClient: googleDriveOauth2Client },
    { name: 'Google Sheets', model: GoogleSheetsConnection, oauthClient: googleSheetsOauth2Client },
];

// How many minutes before expiry to proactively refresh (buffer window)
const REFRESH_BUFFER_MINUTES = 15;

// ─── Core Refresh Logic ─────────────────────────────────────────────────────

/**
 * Refresh a single connection's access token using its stored refresh token.
 * Updates the DB record in-place. Returns true on success, false on failure.
 */
async function refreshConnectionToken(
    service: ServiceConfig,
    connection: TokenConnection
): Promise<boolean> {
    const label = `[TokenRefresh][${service.name}][project:${connection.projectId}]`;

    try {
        // Set credentials on the OAuth client
        service.oauthClient.setCredentials({ refresh_token: connection.refreshToken });

        // Request a fresh access token from Google
        const { credentials } = await service.oauthClient.refreshAccessToken();
        const { access_token, expiry_date } = credentials;

        if (!access_token) {
            console.warn(`${label} No access token returned from Google`);
            return false;
        }

        // Persist the new token and expiry back to MongoDB
        connection.accessToken = access_token;
        connection.expiresAt = expiry_date ? new Date(expiry_date) : undefined;
        await connection.save();

        const expiresIn = expiry_date
            ? Math.round((expiry_date - Date.now()) / 60000)
            : 'unknown';

        console.log(`${label} ✅ Token refreshed — expires in ~${expiresIn} min`);
        return true;
    } catch (error: any) {
        const isInvalidGrant =
            error.message?.includes('invalid_grant') ||
            error.response?.data?.error === 'invalid_grant';

        if (isInvalidGrant) {
            // Refresh token itself has expired/been revoked — requires user re-auth.
            // This happens in Google "Testing" mode (7-day limit) or if the user revoked access.
            console.warn(
                `${label} ⚠️  Refresh token revoked or expired (invalid_grant). ` +
                `User must reconnect ${service.name}. ` +
                `Fix: Publish your Google OAuth app to "Production" in Google Cloud Console.`
            );
        } else {
            console.error(`${label} ❌ Token refresh failed: ${error.message}`);
        }

        return false;
    }
}

/**
 * Scan all connections for a given service and refresh any that are
 * expiring within REFRESH_BUFFER_MINUTES or are already expired.
 */
async function refreshServiceTokens(service: ServiceConfig): Promise<{
    checked: number;
    refreshed: number;
    failed: number;
    skipped: number;
}> {
    const cutoff = new Date(Date.now() + REFRESH_BUFFER_MINUTES * 60 * 1000);

    // Find connections that:
    // 1. Have no expiry recorded (unknown state — refresh to be safe), OR
    // 2. Expire within the next REFRESH_BUFFER_MINUTES minutes
    const connections: TokenConnection[] = await service.model.find({
        refreshToken: { $exists: true, $ne: '' },
        $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $lte: cutoff } },
        ],
    });

    if (connections.length === 0) {
        return { checked: 0, refreshed: 0, failed: 0, skipped: 0 };
    }

    let refreshed = 0;
    let failed = 0;

    for (const connection of connections) {
        const success = await refreshConnectionToken(service, connection);
        if (success) {
            refreshed++;
        } else {
            failed++;
        }
    }

    return {
        checked: connections.length,
        refreshed,
        failed,
        skipped: 0,
    };
}

/**
 * Scan ALL Google services and refresh expiring tokens.
 */
async function refreshAllTokens(): Promise<void> {
    console.log('[TokenRefresh] Starting proactive token refresh scan...');
    const startTime = Date.now();

    let totalChecked = 0;
    let totalRefreshed = 0;
    let totalFailed = 0;

    for (const service of GOOGLE_SERVICES) {
        try {
            const result = await refreshServiceTokens(service);
            if (result.checked > 0) {
                console.log(
                    `[TokenRefresh][${service.name}] Checked: ${result.checked}, ` +
                    `Refreshed: ${result.refreshed}, Failed: ${result.failed}`
                );
            }
            totalChecked += result.checked;
            totalRefreshed += result.refreshed;
            totalFailed += result.failed;
        } catch (error: any) {
            console.error(`[TokenRefresh][${service.name}] Scan error: ${error.message}`);
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(
        `[TokenRefresh] Scan complete in ${duration}s — ` +
        `Checked: ${totalChecked}, Refreshed: ${totalRefreshed}, Failed: ${totalFailed}`
    );
}

// ─── Worker Class ────────────────────────────────────────────────────────────

class TokenRefreshWorker {
    private cronJob: cron.ScheduledTask | null = null;
    private isRunning = false;

    /**
     * Start the worker.
     *  - Runs immediately on startup (to fix any already-expired tokens)
     *  - Then runs every 45 minutes via cron
     */
    start(): void {
        if (this.cronJob) {
            console.log('[TokenRefresh] Worker already running');
            return;
        }

        // Run immediately on startup
        console.log('[TokenRefresh] Running initial token refresh on startup...');
        this.runScan();

        // Schedule every 45 minutes: "*/45 * * * *"
        const schedule = process.env.TOKEN_REFRESH_CRON || '*/45 * * * *';
        this.cronJob = cron.schedule(schedule, async () => {
            await this.runScan();
        });

        console.log(`[TokenRefresh] Worker started — scheduled every 45 minutes (${schedule})`);
    }

    stop(): void {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            console.log('[TokenRefresh] Worker stopped');
        }
    }

    private async runScan(): Promise<void> {
        if (this.isRunning) {
            console.log('[TokenRefresh] Scan already in progress, skipping...');
            return;
        }

        this.isRunning = true;
        try {
            await refreshAllTokens();
        } catch (error: any) {
            console.error('[TokenRefresh] Unexpected error during scan:', error.message);
        } finally {
            this.isRunning = false;
        }
    }

    /** Manual trigger for testing/debugging */
    async runManualRefresh(): Promise<void> {
        console.log('[TokenRefresh] Manual refresh triggered');
        await this.runScan();
    }
}

export default new TokenRefreshWorker();
