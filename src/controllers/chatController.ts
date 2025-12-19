import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import chatService from '../services/chatService';
import { ChatConversation } from '../models/ChatConversation';
import { ChatMessage } from '../models/ChatMessage';
import mongoose from 'mongoose';
import presetQuestionsService from '../services/presetQuestionsService';
import metricsAggregator from '../services/metricsAggregator';

/**
 * Chat Controller
 * Handles HTTP requests for chat functionality
 */

/**
 * @route   POST /api/chat/message
 * @desc    Send a chat message and get AI response
 * @access  Private
 */
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, message, conversationId, dateRange } = req.body;
  const userId = (req as any).user._id;

  // Validation
  if (!projectId || !message) {
    res.status(400);
    throw new Error('Project ID and message are required');
  }

  console.log(`[ChatController] Received message from user ${userId} for project ${projectId}`);

  try {
    const response = await chatService.sendMessage({
      userId,
      projectId,
      message,
      conversationId,
      dateRange,
    });

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    console.error('[ChatController] Error sending message:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send message',
    });
  }
});

/**
 * @route   GET /api/chat/conversations/:projectId
 * @desc    Get all conversations for a project
 * @access  Private
 */
export const getConversations = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const userId = (req as any).user._id;

  console.log(`[ChatController] Fetching conversations for user ${userId}, project ${projectId}`);

  try {
    const conversations = await ChatConversation.find({
      userId: new mongoose.Types.ObjectId(userId),
      projectId: new mongoose.Types.ObjectId(projectId),
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .select('_id title lastMessage createdAt updatedAt');

    res.status(200).json({
      success: true,
      data: conversations,
    });
  } catch (error: any) {
    console.error('[ChatController] Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations',
    });
  }
});

/**
 * @route   GET /api/chat/conversations/:conversationId/messages
 * @desc    Get all messages in a conversation
 * @access  Private
 */
export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const userId = (req as any).user._id;

  console.log(`[ChatController] Fetching messages for conversation ${conversationId}`);

  try {
    // Verify user owns this conversation
    const conversation = await ChatConversation.findOne({
      _id: new mongoose.Types.ObjectId(conversationId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!conversation) {
      res.status(404);
      throw new Error('Conversation not found');
    }

    const messages = await ChatMessage.find({
      conversationId: new mongoose.Types.ObjectId(conversationId),
    })
      .sort({ timestamp: 1 })
      .select('role content timestamp');

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error: any) {
    console.error('[ChatController] Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch messages',
    });
  }
});

/**
 * @route   DELETE /api/chat/conversations/:conversationId
 * @desc    Delete a conversation and all its messages
 * @access  Private
 */
export const deleteConversation = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const userId = (req as any).user._id;

  console.log(`[ChatController] Deleting conversation ${conversationId}`);

  try {
    // Verify user owns this conversation
    const conversation = await ChatConversation.findOne({
      _id: new mongoose.Types.ObjectId(conversationId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!conversation) {
      res.status(404);
      throw new Error('Conversation not found');
    }

    // Delete all messages in the conversation
    await ChatMessage.deleteMany({
      conversationId: new mongoose.Types.ObjectId(conversationId),
    });

    // Delete the conversation
    await ChatConversation.deleteOne({
      _id: new mongoose.Types.ObjectId(conversationId),
    });

    res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully',
    });
  } catch (error: any) {
    console.error('[ChatController] Error deleting conversation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete conversation',
    });
  }
});

/**
 * @route   GET /api/chat/preset-questions/:projectId
 * @desc    Get preset questions for a project (optionally context-aware)
 * @access  Private
 * @query   context - Page context (youtube, analytics, facebook, etc.)
 */
export const getPresetQuestions = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { context } = req.query;
  const userId = (req as any).user._id;

  console.log(`[ChatController] Fetching preset questions for project ${projectId}, context: ${context || 'general'}`);

  try {
    // Determine date range (last 7 days excluding today)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const endDate = yesterday.toISOString().split('T')[0];
    
    const sevenDaysAgo = new Date(yesterday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const startDate = sevenDaysAgo.toISOString().split('T')[0];

    // Try to fetch metrics for context-aware questions
    let questions;
    try {
      const metrics = await metricsAggregator.getProjectMetrics(projectId, startDate, endDate);
      questions = presetQuestionsService.generatePresetQuestions(metrics, context as string);
    } catch (error) {
      // If metrics fetch fails, return default questions
      console.log('[ChatController] Using default preset questions');
      questions = presetQuestionsService.getDefaultPresetQuestions();
    }

    res.status(200).json({
      success: true,
      data: questions,
    });
  } catch (error: any) {
    console.error('[ChatController] Error fetching preset questions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch preset questions',
    });
  }
});

export default {
  sendMessage,
  getConversations,
  getMessages,
  deleteConversation,
  getPresetQuestions,
};
