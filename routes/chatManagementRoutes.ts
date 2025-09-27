import express from 'express';
import mongoose from 'mongoose';
import { AuthRequest, authMiddleware } from '../middleware/authMiddleware';
import Chat from '../models/Chat';
import Message from '../models/Message';
import User from '../models/User';

const router = express.Router();

// Get all chats for a user
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    
    const chats = await Chat.find({
      participants: userId,
      isActive: true
    })
    .populate('participants', 'username email avatar status isOnline lastSeen')
    .populate('lastMessage')
    .populate('createdBy', 'username')
    .populate('admin', 'username')
    .sort({ lastMessageTime: -1 });

    // Transform chats for frontend
    const transformedChats = chats.map(chat => {
      const chatObj = chat.toObject();
      
      if (chat.type === 'private') {
        // For private chats, find the other participant
        const otherParticipant = chatObj.participants.find((p: any) => p._id.toString() !== userId);
        return {
          ...chatObj,
          name: otherParticipant?.username,
          avatar: otherParticipant?.avatar,
          isOnline: otherParticipant?.isOnline,
          lastSeen: otherParticipant?.lastSeen,
          status: otherParticipant?.status
        };
      }
      
      return chatObj;
    });

    res.json({ chats: transformedChats });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new chat (private or group)
router.post('/create', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { type, participants, name, description } = req.body;
    const userId = req.user?.id;

    if (!type || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ message: 'Invalid chat data' });
    }

    // Validate participants exist (exclude creator from validation)
    const validParticipants = await User.find({
      _id: { $in: participants.filter(p => p !== userId) }
    });

    if (validParticipants.length !== participants.filter(p => p !== userId).length) {
      return res.status(400).json({ message: 'Some participants not found' });
    }

    // Add creator to participants
    const allParticipants = [userId, ...participants];

    // For private chats, check if chat already exists
    if (type === 'private') {
      if (participants.length !== 1) {
        return res.status(400).json({ message: 'Private chat must have exactly one other participant' });
      }

      const existingChat = await Chat.findOne({
        type: 'private',
        participants: { $all: allParticipants, $size: 2 }
      });

      if (existingChat) {
        return res.status(400).json({ message: 'Private chat already exists' });
      }
    }

    // Create new chat
    const newChat = new Chat({
      type,
      participants: allParticipants,
      name: type === 'group' ? name : undefined,
      description: type === 'group' ? description : undefined,
      admin: type === 'group' ? [userId] : undefined,
      createdBy: userId,
      unreadCount: new Map(allParticipants.map(p => [p.toString(), 0]))
    });

    await newChat.save();

    const populatedChat = await Chat.findById(newChat._id)
      .populate('participants', 'username email avatar status isOnline lastSeen')
      .populate('createdBy', 'username')
      .populate('admin', 'username');

    res.status(201).json({ chat: populatedChat });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get messages for a specific chat
router.get('/:chatId/messages', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user?.id;

    // Verify user is participant of this chat
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.participants.includes(userId as any)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const messages = await Message.find({
      chat: chatId,
      isDeleted: false
    })
    .populate('sender', 'username avatar')
    .populate('replyTo', 'content sender')
    .sort({ timestamp: -1 })
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit));

    // Mark messages as read
    await Message.updateMany(
      {
        chat: chatId,
        sender: { $ne: userId },
        'readBy.user': { $ne: userId }
      },
      {
        $push: {
          readBy: {
            user: userId,
            readAt: new Date()
          }
        }
      }
    );

    // Update unread count
    chat.unreadCount.set(userId as string, 0);
    await chat.save();

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send a message to a chat
router.post('/:chatId/messages', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { chatId } = req.params;
    const { content, type = 'text', replyTo } = req.body;
    const userId = req.user?.id;

    // Verify user is participant of this chat
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.participants.includes(userId as any)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newMessage = new Message({
      chat: chatId,
      sender: userId,
      username: user.username,
      content,
      type,
      replyTo: replyTo || undefined,
      readBy: [{
        user: userId,
        readAt: new Date()
      }]
    });

    await newMessage.save();

    // Update chat's last message
    chat.lastMessage = newMessage._id as any;
    chat.lastMessageTime = new Date();
    
    // Increment unread count for other participants
    chat.participants.forEach(participantId => {
      if (participantId.toString() !== userId) {
        const currentCount = chat.unreadCount.get(participantId.toString()) || 0;
        chat.unreadCount.set(participantId.toString(), currentCount + 1);
      }
    });

    await chat.save();

    const populatedMessage = await Message.findById(newMessage._id)
      .populate('sender', 'username avatar')
      .populate('replyTo', 'content sender');

    res.status(201).json({ message: populatedMessage });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a message
router.delete('/messages/:messageId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Only sender can delete message
    if (message.sender.toString() !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search users to start a chat
router.get('/search/users', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { query } = req.query;
    const userId = req.user?.id;

    if (!query) {
      return res.status(400).json({ message: 'Search query required' });
    }

    const users = await User.find({
      _id: { $ne: userId },
      $or: [
        { username: new RegExp(query as string, 'i') },
        { email: new RegExp(query as string, 'i') }
      ]
    })
    .select('username email avatar status isOnline lastSeen')
    .limit(20);

    res.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add reaction to message
router.post('/messages/:messageId/react', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user?.id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Remove existing reaction from this user
    message.reactions = message.reactions.filter(r => r.user.toString() !== userId);

    // Add new reaction
    message.reactions.push({
      user: userId as any,
      emoji,
      createdAt: new Date()
    });

    await message.save();

    res.json({ message: 'Reaction added successfully' });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;