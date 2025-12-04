import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IFacebookConnection extends Document {
  projectId: mongoose.Types.ObjectId;
  refreshToken: string;
  accessToken?: string;
  pageAccessToken?: string; // Page-level access token for insights
  pageId?: string; // Selected page ID
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const facebookConnectionSchema: Schema<IFacebookConnection> = new Schema(
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
    pageAccessToken: {
      type: String,
    },
    pageId: {
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
// - expiresAt is for the access token (short-lived, ~1-2 hours)
// - The connection should persist because it contains a refresh token
// - Refresh tokens can be used to obtain new access tokens
// - The code already handles token refresh in facebookDataService.getAccessToken()

const FacebookConnection: Model<IFacebookConnection> = mongoose.model<IFacebookConnection>('FacebookConnection', facebookConnectionSchema);

export default FacebookConnection;

