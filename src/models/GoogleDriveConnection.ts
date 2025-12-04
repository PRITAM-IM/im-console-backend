import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IGoogleDriveConnection extends Document {
  projectId: mongoose.Types.ObjectId;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const googleDriveConnectionSchema: Schema<IGoogleDriveConnection> = new Schema(
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

const GoogleDriveConnection: Model<IGoogleDriveConnection> = mongoose.model<IGoogleDriveConnection>('GoogleDriveConnection', googleDriveConnectionSchema);

export default GoogleDriveConnection;





