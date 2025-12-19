import express from 'express';
import {
  sendMessage,
  getConversations,
  getMessages,
  deleteConversation,
  getPresetQuestions,
} from '../controllers/chatController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

/**
 * Chat Routes
 * All routes require authentication
 */

// Send a message and get AI response
router.post('/message', authenticate, sendMessage);

// Get preset questions for a project
router.get('/preset-questions/:projectId', authenticate, getPresetQuestions);

// Get all conversations for a project
router.get('/conversations/:projectId', authenticate, getConversations);

// Get all messages in a conversation
router.get('/conversations/:conversationId/messages', authenticate, getMessages);

// Delete a conversation
router.delete('/conversations/:conversationId', authenticate, deleteConversation);

export default router;
