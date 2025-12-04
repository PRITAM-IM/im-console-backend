import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IGoogleAdsConnection extends Document {
  projectId: mongoose.Types.ObjectId;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const googleAdsConnectionSchema: Schema<IGoogleAdsConnection> = new Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
    },
    refreshToken: {
      type: String,
      required: true,
    },
    accessToken: {
      type: String,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Note: We don't use TTL index on expiresAt because:
// - expiresAt is for the access token (short-lived, ~1 hour)
// - The connection should persist because it contains a refresh token
// - Refresh tokens can be used to obtain new access tokens indefinitely
// - The code already handles token refresh in googleAdsDataService.getAccessToken()

const GoogleAdsConnection: Model<IGoogleAdsConnection> = mongoose.model<IGoogleAdsConnection>('GoogleAdsConnection', googleAdsConnectionSchema);

export default GoogleAdsConnection;


