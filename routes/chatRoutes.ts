import express from 'express';
import { deleteMessage, getChatHistory } from '../controllers/chatController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = express.Router();

// GET /api/chat/history - Get chat history with pagination
router.get('/history', authMiddleware, getChatHistory);

// DELETE /api/chat/message/:messageId - Delete a message (only by sender)
router.delete('/message/:messageId', authMiddleware, deleteMessage);

export default router;