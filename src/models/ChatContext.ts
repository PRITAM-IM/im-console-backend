import mongoose, { Document, Schema } from 'mongoose';
import { AggregatedMetrics } from '../services/metricsAggregator';

export interface IChatContext extends Document {
  conversationId: mongoose.Types.ObjectId;
  metrics: AggregatedMetrics;
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  createdAt: Date;
}

const ChatContextSchema = new Schema<IChatContext>({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'ChatConversation',
    required: true,
    index: true,
  },
  metrics: {
    type: Schema.Types.Mixed,
    required: true,
  },
  dateRange: {
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const ChatContext = mongoose.model<IChatContext>('ChatContext', ChatContextSchema);
