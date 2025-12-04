import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IAnalyticsCache extends Document {
  projectId: mongoose.Types.ObjectId;
  reportType: string;
  dateRange: string;
  data: any;
  expiresAt: Date;
  createdAt: Date;
}

const analyticsCacheSchema: Schema<IAnalyticsCache> = new Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    reportType: {
      type: String,
      required: true,
      trim: true,
    },
    dateRange: {
      type: String,
      required: true,
      trim: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for automatic cleanup of expired cache entries
analyticsCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AnalyticsCache: Model<IAnalyticsCache> = mongoose.model<IAnalyticsCache>('AnalyticsCache', analyticsCacheSchema);

export default AnalyticsCache;