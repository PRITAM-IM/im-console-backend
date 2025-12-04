import { google } from 'googleapis';
import { youtubeOauth2Client } from '../config/youtube';

/**
 * DM Cockpit-style YouTube content format
 */
export interface YouTubeContent {
    content_type: 'video' | 'shorts' | 'playlist';
    id: string;
    title: string;
    thumbnail: string;
    published_at: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    estimatedMinutesWatched: number;
    averageViewDuration: number;
    duration: { minutes?: number; seconds: number };
    player: string;
}

/**
 * Enhanced YouTube Content Service for DM Cockpit-style data
 * Separates Videos, Shorts, and Playlists with auto-detection
 */
class YouTubeContentService {
    /**
     * Get top content (Videos, Shorts, or Playlists) in DM Cockpit format
     * @param channelId - YouTube channel ID
     * @param accessToken - OAuth access token
     * @param dateRange - Date range for analytics
     * @param contentType - Type of content to fetch
     */
    public async getTopContent(
        channelId: string,
        accessToken: string,
        dateRange: { startDate: string; endDate: string },
        contentType: 'video' | 'shorts' | 'playlist'
    ): Promise<YouTubeContent[]> {
        try {
            console.log(`[YouTube Content Service] Fetching top ${contentType} for channel:`, channelId);

            youtubeOauth2Client.setCredentials({ access_token: accessToken });
            const youtubeAnalytics = google.youtubeAnalytics('v2');
            const youtube = google.youtube('v3');

            // Handle playlists separately
            if (contentType === 'playlist') {
                return this.getTopPlaylists(channelId, accessToken);
            }

            // Fetch analytics data for videos/shorts
            const response = await youtubeAnalytics.reports.query({
                auth: youtubeOauth2Client,
                ids: `channel==${channelId}`,
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,
                metrics: 'views,likes,comments,shares,estimatedMinutesWatched,averageViewDuration',
                dimensions: 'video',
                sort: '-views',
                maxResults: 200, // Fetch more to filter shorts/videos
            });

            const rows = response.data.rows || [];
            const content: YouTubeContent[] = [];

            // Process in batches of 50 (YouTube API limit)
            const batchSize = 50;
            for (let i = 0; i < rows.length && content.length < 50; i += batchSize) {
                const batch = rows.slice(i, i + batchSize);
                const videoIds = batch.map((row: any) => String(row[0]));

                try {
                    // Fetch detailed video info including duration and thumbnails
                    const videoDetails = await youtube.videos.list({
                        auth: youtubeOauth2Client,
                        part: ['snippet', 'contentDetails', 'statistics'],
                        id: videoIds,
                    });

                    const items = videoDetails.data.items || [];

                    for (let j = 0; j < items.length; j++) {
                        const item = items[j];
                        const row = batch[j];

                        if (!item || !item.id) continue;

                        // Parse ISO 8601 duration (PT1M30S → 90 seconds)
                        const durationISO = item.contentDetails?.duration || 'PT0S';
                        const durationSeconds = this.parseDuration(durationISO);

                        // Detect if it's a Short (≤60 seconds)
                        const isShort = durationSeconds <= 60;

                        // Filter based on content type
                        if (contentType === 'video' && isShort) continue;
                        if (contentType === 'shorts' && !isShort) continue;

                        const publishedAt = item.snippet?.publishedAt || new Date().toISOString();
                        const formattedDate = new Date(publishedAt).toISOString().replace('T', ' ').substring(0, 19);

                        // Get best quality thumbnail (use 'as any' to bypass TypeScript limitation)
                        const thumbnails = item.snippet?.thumbnails as any;
                        const thumbnail = thumbnails?.maxresdefault?.url ||
                            thumbnails?.high?.url ||
                            thumbnails?.medium?.url ||
                            `https://i.ytimg.com/vi/${item.id}/maxresdefault.jpg`;

                        // Create embedded player iframe
                        const player = `<iframe src="https://www.youtube.com/embed/${item.id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

                        content.push({
                            content_type: isShort ? 'shorts' : 'video',
                            id: item.id,
                            title: item.snippet?.title || 'Untitled',
                            thumbnail,
                            published_at: formattedDate,
                            views: Number(row[1]) || Number(item.statistics?.viewCount) || 0,
                            likes: Number(row[2]) || Number(item.statistics?.likeCount) || 0,
                            comments: Number(row[3]) || Number(item.statistics?.commentCount) || 0,
                            shares: Number(row[4]) || 0,
                            estimatedMinutesWatched: Number(row[5]) || 0,
                            averageViewDuration: Number(row[6]) || 0,
                            duration: this.formatDuration(durationSeconds),
                            player,
                        });

                        // Stop if we have enough content
                        if (content.length >= 50) break;
                    }
                } catch (err) {
                    console.warn('[YouTube Content Service] Error fetching video details batch:', err);
                }
            }

            console.log(`[YouTube Content Service] Found ${content.length} ${contentType} items`);
            return content;
        } catch (error: any) {
            console.error(`[YouTube Content Service] Error fetching top ${contentType}:`, error);
            throw new Error(`Failed to fetch YouTube ${contentType}: ${error.message}`);
        }
    }

    /**
     * Get top playlists with metadata
     */
    private async getTopPlaylists(
        channelId: string,
        accessToken: string
    ): Promise<YouTubeContent[]> {
        try {
            youtubeOauth2Client.setCredentials({ access_token: accessToken });
            const youtube = google.youtube('v3');

            // Fetch channel's playlists
            const playlistsResponse = await youtube.playlists.list({
                auth: youtubeOauth2Client,
                part: ['snippet', 'contentDetails'],
                channelId: channelId,
                maxResults: 50,
            });

            const playlists = playlistsResponse.data.items || [];
            const content: YouTubeContent[] = [];

            for (const playlist of playlists) {
                if (!playlist.id) continue;

                // Get playlist items count
                const itemCount = playlist.contentDetails?.itemCount || 0;

                // Get playlist thumbnail (use 'as any' to bypass TypeScript limitation)
                const thumbnails = playlist.snippet?.thumbnails as any;
                const thumbnail = thumbnails?.maxresdefault?.url ||
                    thumbnails?.high?.url ||
                    thumbnails?.medium?.url ||
                    'https://via.placeholder.com/480x360?text=Playlist';

                const publishedAt = playlist.snippet?.publishedAt || new Date().toISOString();
                const formattedDate = new Date(publishedAt).toISOString().replace('T', ' ').substring(0, 19);

                // Create embedded player for playlist
                const player = `<iframe src="https://www.youtube.com/embed/videoseries?list=${playlist.id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

                content.push({
                    content_type: 'playlist',
                    id: playlist.id,
                    title: playlist.snippet?.title || 'Untitled Playlist',
                    thumbnail,
                    published_at: formattedDate,
                    views: 0, // Playlists don't have view counts in API
                    likes: 0,
                    comments: 0,
                    shares: 0,
                    estimatedMinutesWatched: 0,
                    averageViewDuration: 0,
                    duration: { seconds: itemCount }, // Use itemCount as duration for playlists
                    player,
                });
            }

            return content;
        } catch (error: any) {
            console.error('[YouTube Content Service] Error fetching playlists:', error);
            return [];
        }
    }

    /**
     * Parse ISO 8601 duration to seconds
     * Example: PT1H2M10S → 3730 seconds, PT45S → 45 seconds
     */
    private parseDuration(duration: string): number {
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return 0;

        const hours = parseInt(match[1] || '0', 10);
        const minutes = parseInt(match[2] || '0', 10);
        const seconds = parseInt(match[3] || '0', 10);

        return hours * 3600 + minutes * 60 + seconds;
    }

    /**
     * Format duration for DM Cockpit format
     * Shorts (≤60s): { seconds: 36 }
     * Videos (>60s): { minutes: 4, seconds: 24 }
     */
    private formatDuration(totalSeconds: number): { minutes?: number; seconds: number } {
        if (totalSeconds <= 60) {
            return { seconds: totalSeconds };
        }

        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return { minutes, seconds };
    }
}

export default new YouTubeContentService();
