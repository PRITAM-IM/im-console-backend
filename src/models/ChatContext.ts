import mongoose, { Schema, Document } from 'mongoose';

export interface IChatContext extends Document {
  conversationId: mongoose.Types.ObjectId;
  metrics: {
    trafficMetrics?: any;
    conversionMetrics?: any;
    channelBreakdown?: any;
    adSpend?: any;
    comparison?: any;
    [key: string]: any; // Allow flexible metric storage
  };
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  capturedAt: Date;
}

const chatContextSchema = new Schema<IChatContext>(
  {
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
    capturedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

// Index for efficient context retrieval
chatContextSchema.index({ conversationId: 1, capturedAt: -1 });

export const ChatContext = mongoose.model<IChatContext>('ChatContext', chatContextSchema);
