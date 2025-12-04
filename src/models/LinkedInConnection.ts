import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ILinkedInConnection extends Document {
  projectId: mongoose.Types.ObjectId;
  refreshToken?: string;
  accessToken: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const linkedInConnectionSchema: Schema<ILinkedInConnection> = new Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
    },
    refreshToken: {
      type: String,
    },
    accessToken: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const LinkedInConnection: Model<ILinkedInConnection> = mongoose.model<ILinkedInConnection>('LinkedInConnection', linkedInConnectionSchema);

export default LinkedInConnection;

