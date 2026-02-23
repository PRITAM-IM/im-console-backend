import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IYouTubeConnection extends Document {
  projectId: mongoose.Types.ObjectId;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const youTubeConnectionSchema: Schema<IYouTubeConnection> = new Schema(
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

const YouTubeConnection: Model<IYouTubeConnection> = mongoose.model<IYouTubeConnection>(
  'YouTubeConnection',
  youTubeConnectionSchema
);

export default YouTubeConnection;

