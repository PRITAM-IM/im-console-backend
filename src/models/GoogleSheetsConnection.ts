import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IGoogleSheetsConnection extends Document {
  projectId: mongoose.Types.ObjectId;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const googleSheetsConnectionSchema: Schema<IGoogleSheetsConnection> = new Schema(
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

const GoogleSheetsConnection: Model<IGoogleSheetsConnection> = mongoose.model<IGoogleSheetsConnection>('GoogleSheetsConnection', googleSheetsConnectionSchema);

export default GoogleSheetsConnection;





