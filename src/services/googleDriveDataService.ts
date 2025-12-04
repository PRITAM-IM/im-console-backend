import { google } from 'googleapis';
import GoogleDriveConnection from '../models/GoogleDriveConnection';
import googleDriveAuthService, { DriveFile, DriveFolder } from './googleDriveAuthService';
import { googleDriveOauth2Client } from '../config/googleDrive';
import { Types } from 'mongoose';

export interface DriveStorageQuota {
  limit: string;
  usage: string;
  usageInDrive: string;
  usageInTrash: string;
}

export interface DriveStats {
  totalFiles: number;
  totalFolders: number;
  recentFiles: DriveFile[];
  storageQuota: DriveStorageQuota;
}

class GoogleDriveDataService {
  private async getAccessToken(projectId: string): Promise<string> {
    const connection = await GoogleDriveConnection.findOne({ 
      projectId: new Types.ObjectId(projectId) 
    });
    
    if (!connection) {
      throw new Error('Google Drive connection not found for this project');
    }

    const now = new Date();
    const expiryBuffer = 5 * 60 * 1000;
    
    if (connection.expiresAt && connection.accessToken) {
      const expiresAt = new Date(connection.expiresAt);
      if (expiresAt.getTime() - now.getTime() > expiryBuffer) {
        return connection.accessToken;
      }
    }

    console.log('[Google Drive Data Service] Refreshing access token...');
    const { accessToken, expiresAt } = await googleDriveAuthService.refreshAccessToken(connection.refreshToken);
    
    connection.accessToken = accessToken;
    connection.expiresAt = expiresAt ?? undefined;
    await connection.save();
    
    return accessToken;
  }

  public async getStorageQuota(projectId: string): Promise<DriveStorageQuota> {
    const accessToken = await this.getAccessToken(projectId);
    
    googleDriveOauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive('v3');
    
    const response = await drive.about.get({
      auth: googleDriveOauth2Client,
      fields: 'storageQuota',
    });

    const quota = response.data.storageQuota;
    
    return {
      limit: quota?.limit || '0',
      usage: quota?.usage || '0',
      usageInDrive: quota?.usageInDrive || '0',
      usageInTrash: quota?.usageInDriveTrash || '0',
    };
  }

  public async listFiles(projectId: string, folderId?: string, pageSize: number = 50): Promise<DriveFile[]> {
    const accessToken = await this.getAccessToken(projectId);
    
    googleDriveOauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive('v3');
    
    let query = "trashed=false";
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }
    
    const response = await drive.files.list({
      auth: googleDriveOauth2Client,
      q: query,
      fields: 'files(id, name, mimeType, size, modifiedTime, createdTime, webViewLink, iconLink, thumbnailLink, parents)',
      pageSize,
      orderBy: 'modifiedTime desc',
    });

    return (response.data.files || []).map(file => ({
      id: file.id || '',
      name: file.name || 'Untitled',
      mimeType: file.mimeType || '',
      size: file.size || undefined,
      modifiedTime: file.modifiedTime || undefined,
      createdTime: file.createdTime || undefined,
      webViewLink: file.webViewLink || undefined,
      iconLink: file.iconLink || undefined,
      thumbnailLink: file.thumbnailLink || undefined,
      parents: file.parents || undefined,
    }));
  }

  public async listFolders(projectId: string): Promise<DriveFolder[]> {
    const accessToken = await this.getAccessToken(projectId);
    return googleDriveAuthService.listFolders(accessToken);
  }

  public async getRecentFiles(projectId: string, limit: number = 10): Promise<DriveFile[]> {
    const accessToken = await this.getAccessToken(projectId);
    
    googleDriveOauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive('v3');
    
    const response = await drive.files.list({
      auth: googleDriveOauth2Client,
      q: "trashed=false",
      fields: 'files(id, name, mimeType, size, modifiedTime, createdTime, webViewLink, iconLink, thumbnailLink)',
      pageSize: limit,
      orderBy: 'viewedByMeTime desc',
    });

    return (response.data.files || []).map(file => ({
      id: file.id || '',
      name: file.name || 'Untitled',
      mimeType: file.mimeType || '',
      size: file.size || undefined,
      modifiedTime: file.modifiedTime || undefined,
      createdTime: file.createdTime || undefined,
      webViewLink: file.webViewLink || undefined,
      iconLink: file.iconLink || undefined,
      thumbnailLink: file.thumbnailLink || undefined,
    }));
  }

  public async getDriveStats(projectId: string): Promise<DriveStats> {
    const accessToken = await this.getAccessToken(projectId);
    
    googleDriveOauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive('v3');

    // Get storage quota
    const aboutResponse = await drive.about.get({
      auth: googleDriveOauth2Client,
      fields: 'storageQuota',
    });

    // Count files
    const filesResponse = await drive.files.list({
      auth: googleDriveOauth2Client,
      q: "trashed=false and mimeType!='application/vnd.google-apps.folder'",
      fields: 'files(id)',
      pageSize: 1000,
    });

    // Count folders
    const foldersResponse = await drive.files.list({
      auth: googleDriveOauth2Client,
      q: "trashed=false and mimeType='application/vnd.google-apps.folder'",
      fields: 'files(id)',
      pageSize: 1000,
    });

    // Get recent files
    const recentResponse = await drive.files.list({
      auth: googleDriveOauth2Client,
      q: "trashed=false",
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink)',
      pageSize: 10,
      orderBy: 'modifiedTime desc',
    });

    const quota = aboutResponse.data.storageQuota;

    return {
      totalFiles: filesResponse.data.files?.length || 0,
      totalFolders: foldersResponse.data.files?.length || 0,
      recentFiles: (recentResponse.data.files || []).map(file => ({
        id: file.id || '',
        name: file.name || 'Untitled',
        mimeType: file.mimeType || '',
        size: file.size || undefined,
        modifiedTime: file.modifiedTime || undefined,
        webViewLink: file.webViewLink || undefined,
        iconLink: file.iconLink || undefined,
      })),
      storageQuota: {
        limit: quota?.limit || '0',
        usage: quota?.usage || '0',
        usageInDrive: quota?.usageInDrive || '0',
        usageInTrash: quota?.usageInDriveTrash || '0',
      },
    };
  }
}

export default new GoogleDriveDataService();

