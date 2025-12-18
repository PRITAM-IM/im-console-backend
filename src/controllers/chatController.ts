import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import chatService from '../services/chatService';

/**
 * Chat Controller
 * Handles HTTP requests for chat functionality
 */

/**
 * @route   POST /api/chat/message
 * @desc    Send a message to Avi and get a response
 * @access  Private
 */
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, message, conversationId, dateRange } = req.body;
  const userId = (req as any).user._id.toString();

  // Validation
  if (!projectId || !message) {
    res.status(400).json({
      success: false,
      message: 'Project ID and message are required',
    });
    return;
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({
      success: false,
      message: 'Message must be a non-empty string',
    });
    return;
  }

  if (message.length > 2000) {
    res.status(400).json({
      success: false,
      message: 'Message is too long (max 2000 characters)',
    });
    return;
  }

  try {
    const result = await chatService.sendMessage({
      userId,
      projectId,
      message: message.trim(),
      conversationId,
      dateRange,
    });

    res.status(200).json({
      success: true,
      data: result,
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
 * @route   GET /api/chat/conversations
 * @desc    Get user's conversations (optionally filtered by project)
 * @access  Private
 */
export const getConversations = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user._id.toString();
  const { projectId, limit = '10', skip = '0' } = req.query;

  try {
    const conversations = await chatService.getUserConversations(
      userId,
      projectId as string | undefined,
      parseInt(limit as string, 10),
      parseInt(skip as string, 10)
    );

    res.status(200).json({
      success: true,
      data: conversations,
      count: conversations.length,
    });
  } catch (error: any) {
    console.error('[ChatController] Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch conversations',
    });
  }
});

/**
 * @route   GET /api/chat/conversations/:conversationId
 * @desc    Get a specific conversation with all messages
 * @access  Private
 */
export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const { limit = '50' } = req.query;

  try {
    const messages = await chatService.getConversation(
      conversationId,
      parseInt(limit as string, 10)
    );

    res.status(200).json({
      success: true,
      data: messages,
      count: messages.length,
    });
  } catch (error: any) {
    console.error('[ChatController] Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch conversation',
    });
  }
});

/**
 * @route   DELETE /api/chat/conversations/:conversationId
 * @desc    Delete a conversation
 * @access  Private
 */
export const deleteConversation = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId } = req.params;
  const userId = (req as any).user._id.toString();

  try {
    await chatService.deleteConversation(conversationId, userId);

    res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully',
    });
  } catch (error: any) {
    console.error('[ChatController] Error deleting conversation:', error);
    
    if (error.message.includes('not found') || error.message.includes('unauthorized')) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete conversation',
      });
    }
  }
});

/**
 * @route   POST /api/chat/reindex/:projectId
 * @desc    Manually re-index project metrics to vector database
 * @access  Private
 */
export const reindexProject = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { startDate, endDate } = req.body;
  const userId = (req as any).user._id.toString();

  // Validation
  if (!startDate || !endDate) {
    res.status(400).json({
      success: false,
      message: 'Start date and end date are required',
    });
    return;
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    res.status(400).json({
      success: false,
      message: 'Invalid date format. Use YYYY-MM-DD',
    });
    return;
  }

  try {
    console.log(`[ChatController] 🔄 Re-indexing project ${projectId} for user ${userId}`);

    const result = await chatService.reindexProjectMetrics(projectId, startDate, endDate);

    res.status(200).json({
      success: true,
      message: `Successfully re-indexed project metrics`,
      data: {
        projectId,
        dateRange: { startDate, endDate },
        chunksIndexed: result.chunksIndexed,
      },
    });
  } catch (error: any) {
    console.error('[ChatController] Error re-indexing project:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to re-index project',
    });
  }
});

export default {
  sendMessage,
  getConversations,
  getConversation,
  deleteConversation,
  reindexProject,
};
