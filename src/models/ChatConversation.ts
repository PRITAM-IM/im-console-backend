import mongoose, { Schema, Document } from 'mongoose';

export interface IChatConversation extends Document {
  userId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  title: string;
  lastMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const chatConversationSchema = new Schema<IChatConversation>(
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
      maxlength: 100,
    },
    lastMessage: {
      type: String,
      maxlength: 200,
    },
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt
  }
);

// Compound index for user-project conversation queries
chatConversationSchema.index({ userId: 1, projectId: 1 });
chatConversationSchema.index({ userId: 1, updatedAt: -1 }); // For sorting by recent

// Static method to generate title from first message
chatConversationSchema.statics.generateTitle = function (firstMessage: string): string {
  // Take first 50 characters, break at word boundary
  const maxLength = 50;
  let title = firstMessage.trim();
  
  if (title.length <= maxLength) {
    return title;
  }
  
  title = title.substring(0, maxLength);
  const lastSpace = title.lastIndexOf(' ');
  
  if (lastSpace > 20) {
    // Break at last word if it's not too early
    title = title.substring(0, lastSpace);
  }
  
  return title + '...';
};

// Instance method to update last message
chatConversationSchema.methods.updateLastMessage = function (message: string) {
  const maxLength = 200;
  this.lastMessage = message.length > maxLength 
    ? message.substring(0, maxLength) + '...'
    : message;
  this.updatedAt = new Date();
};

export const ChatConversation = mongoose.model<IChatConversation>(
  'ChatConversation',
  chatConversationSchema
);
