import mongoose, { Document, Schema } from 'mongoose';

export interface IChatConversation extends Document {
  userId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  title: string;
  lastMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChatConversationSchema = new Schema<IChatConversation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      default: 'New Conversation',
    },
    lastMessage: {
      type: String,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Compound index for efficient user+project queries
ChatConversationSchema.index({ userId: 1, projectId: 1, updatedAt: -1 });

export const ChatConversation = mongoose.model<IChatConversation>('ChatConversation', ChatConversationSchema);
