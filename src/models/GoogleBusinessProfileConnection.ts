import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IGoogleBusinessProfileConnection extends Document {
  projectId: mongoose.Types.ObjectId;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const googleBusinessProfileConnectionSchema: Schema<IGoogleBusinessProfileConnection> = new Schema(
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

const GoogleBusinessProfileConnection: Model<IGoogleBusinessProfileConnection> = mongoose.model<IGoogleBusinessProfileConnection>(
  'GoogleBusinessProfileConnection',
  googleBusinessProfileConnectionSchema
);

export default GoogleBusinessProfileConnection;

