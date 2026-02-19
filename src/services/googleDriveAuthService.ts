import { google } from 'googleapis';
import GoogleDriveConnection, { IGoogleDriveConnection } from '../models/GoogleDriveConnection';
import { googleDriveOauth2Client, getGoogleDriveAuthUrl } from '../config/googleDrive';
import { Types } from 'mongoose';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  parents?: string[];
}

export interface DriveFolder {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface IGoogleDriveAuthService {
  generateAuthUrl(state?: string): string;
  handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }>;
  saveConnection(projectId: string, refreshToken: string, accessToken: string, expiresAt: Date | null): Promise<IGoogleDriveConnection>;
  getConnectionByProject(projectId: string): Promise<IGoogleDriveConnection | null>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }>;
  listFolders(accessToken: string): Promise<DriveFolder[]>;
}

class GoogleDriveAuthService implements IGoogleDriveAuthService {
  public generateAuthUrl(state?: string): string {
    return getGoogleDriveAuthUrl(state);
  }

  public async handleCallback(code: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null }> {
    const { tokens } = await googleDriveOauth2Client.getToken(code);
    const { access_token, refresh_token, expiry_date } = tokens;

    if (!access_token) {
      throw new Error('Failed to obtain access token');
    }

    const expiresAt = expiry_date ? new Date(expiry_date) : null;

    return {
      accessToken: access_token,
      refreshToken: refresh_token || '',
      expiresAt,
    };
  }

  public async saveConnection(
    projectId: string,
    refreshToken: string,
    accessToken: string,
    expiresAt: Date | null
  ): Promise<IGoogleDriveConnection> {
    try {
      console.log(`[Google Drive Auth Service] Saving connection for project: ${projectId}`);
      
      if (!Types.ObjectId.isValid(projectId)) {
        throw new Error(`Invalid project ID format: ${projectId}`);
      }

      const projectObjectId = new Types.ObjectId(projectId);
      const existingConnection = await GoogleDriveConnection.findOne({ projectId: projectObjectId });
      const effectiveRefreshToken = refreshToken || existingConnection?.refreshToken;

      if (!effectiveRefreshToken) {
        throw new Error('Refresh token is missing. Please reconnect Google Drive with consent.');
      }

      let connection: IGoogleDriveConnection;
      if (existingConnection) {
        existingConnection.refreshToken = effectiveRefreshToken;
        existingConnection.accessToken = accessToken;
        existingConnection.expiresAt = expiresAt ?? undefined;
        connection = await existingConnection.save();
      } else {
        connection = await GoogleDriveConnection.create({
          projectId: projectObjectId,
          refreshToken: effectiveRefreshToken,
          accessToken,
          expiresAt,
        });
      }

      console.log(`[Google Drive Auth Service] Connection created successfully - ID: ${connection._id}`);
      
      return connection;
    } catch (error: any) {
      console.error(`[Google Drive Auth Service] Error saving connection:`, error);
      throw error;
    }
  }

  public async getConnectionByProject(projectId: string): Promise<IGoogleDriveConnection | null> {
    return await GoogleDriveConnection.findOne({ projectId: new Types.ObjectId(projectId) });
  }

  public async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
    googleDriveOauth2Client.setCredentials({ refresh_token: refreshToken });
    
    try {
      const { credentials } = await googleDriveOauth2Client.refreshAccessToken();
      const { access_token, expiry_date } = credentials;

      if (!access_token) {
        throw new Error('Failed to refresh access token');
      }

      const expiresAt = expiry_date ? new Date(expiry_date) : null;

      return {
        accessToken: access_token,
        expiresAt,
      };
    } catch (error) {
      throw new Error('Failed to refresh access token');
    }
  }

  public async listFolders(accessToken: string): Promise<DriveFolder[]> {
    try {
      console.log('[Google Drive Auth Service] Fetching all folders with pagination...');
      
      const drive = google.drive('v3');
      googleDriveOauth2Client.setCredentials({ access_token: accessToken });
      
      const folders: DriveFolder[] = [];
      let pageToken: string | undefined = undefined;
      let pageCount = 0;
      
      // Keep fetching pages until there are no more results
      do {
        pageCount++;
        console.log(`[Google Drive Auth Service] Fetching page ${pageCount}...`);
        
        const response: any = await drive.files.list({
          auth: googleDriveOauth2Client,
          q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
          fields: 'nextPageToken, files(id, name, webViewLink)',
          pageSize: 100, // Maximum allowed by API
          orderBy: 'modifiedTime desc',
          pageToken: pageToken,
        });

        if (response.data.files) {
          for (const file of response.data.files) {
            folders.push({
              id: file.id || '',
              name: file.name || 'Untitled',
              webViewLink: file.webViewLink || undefined,
            });
          }
        }
        
        // Get the next page token
        pageToken = response.data.nextPageToken || undefined;
        
      } while (pageToken); // Continue if there's a next page

      console.log(`[Google Drive Auth Service] Found ${folders.length} folder(s) across ${pageCount} page(s)`);
      return folders;
    } catch (error: any) {
      console.error('[Google Drive Auth Service] Error fetching folders:', error.message);
      return [];
    }
  }
}

export default new GoogleDriveAuthService();





