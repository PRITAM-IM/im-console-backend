import { Router } from 'express';
import chatController from '../controllers/chatController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

/**
 * All chat routes require authentication
 */
router.use(authenticate);

/**
 * @route   POST /api/chat/message
 * @desc    Send a message to Avi
 * @access  Private
 */
router.post('/message', chatController.sendMessage);

/**
 * @route   GET /api/chat/conversations
 * @desc    Get user's conversations
 * @access  Private
 * @query   projectId (optional) - Filter by project
 * @query   limit (optional, default: 10) - Number of conversations to return
 * @query   skip (optional, default: 0) - Number of conversations to skip
 */
router.get('/conversations', chatController.getConversations);

/**
 * @route   GET /api/chat/conversations/:conversationId
 * @desc    Get a specific conversation with all messages
 * @access  Private
 * @query   limit (optional, default: 50) - Number of messages to return
 */
router.get('/conversations/:conversationId', chatController.getConversation);

/**
 * @route   DELETE /api/chat/conversations/:conversationId
 * @desc    Delete a conversation
 * @access  Private
 */
router.delete('/conversations/:conversationId', chatController.deleteConversation);

/**
 * @route   POST /api/chat/reindex/:projectId
 * @desc    Manually re-index project metrics to vector database
 * @access  Private
 * @body    startDate (required) - Start date in YYYY-MM-DD format
 * @body    endDate (required) - End date in YYYY-MM-DD format
 */
router.post('/reindex/:projectId', chatController.reindexProject);

export default router;
