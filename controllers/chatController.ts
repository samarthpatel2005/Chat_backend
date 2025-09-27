import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import Message from '../models/Message';

export const getChatHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find()
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'username')
      .lean();

    // Reverse to show oldest first
    const reversedMessages = messages.reverse();

    const totalMessages = await Message.countDocuments();
    const totalPages = Math.ceil(totalMessages / limit);

    res.json({
      messages: reversedMessages,
      pagination: {
        currentPage: page,
        totalPages,
        totalMessages,
        hasMore: page < totalPages
      }
    });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const userId = req.user?._id;

    const message = await Message.findById(messageId);
    
    if (!message) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }

    // Check if user is the sender of the message
    if (message.sender.toString() !== userId) {
      res.status(403).json({ message: 'Not authorized to delete this message' });
      return;
    }

    await Message.findByIdAndDelete(messageId);
    
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};