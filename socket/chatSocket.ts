import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import Chat from '../models/Chat';
import Message from '../models/Message';
import User from '../models/User';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  user?: any;
}

export const setupChatSocket = (io: Server): void => {
  // Authentication middleware for socket connections
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key';
      const decoded = jwt.verify(token, jwtSecret) as { userId: string };
      
      const user = await User.findById(decoded.userId);
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user._id.toString();
      socket.username = user.username;
      socket.user = user;
      
      // Update user online status
      await User.findByIdAndUpdate(decoded.userId, {
        isOnline: true,
        status: 'online',
        socketId: socket.id
      });

      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User ${socket.username} connected`);

    // Join user-specific room for direct messaging
    socket.join(`user_${socket.userId}`);

    // Join user's active chats
    socket.on('join_chats', async () => {
      try {
        const userChats = await Chat.find({
          participants: socket.userId,
          isActive: true
        });

        userChats.forEach(chat => {
          socket.join(`chat_${chat._id}`);
        });

        // Emit user came online to their contacts
        socket.broadcast.emit('user_online', {
          userId: socket.userId,
          username: socket.username,
          status: 'online'
        });
      } catch (error) {
        console.error('Join chats error:', error);
      }
    });

    // Handle joining a specific chat
    socket.on('join_chat', async (data: { chatId: string }) => {
      try {
        const { chatId } = data;
        
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.includes(socket.userId as any)) {
          socket.emit('error', { message: 'Access denied to this chat' });
          return;
        }

        socket.join(`chat_${chatId}`);
        
        // Mark messages as read
        await Message.updateMany(
          {
            chat: chatId,
            sender: { $ne: socket.userId },
            'readBy.user': { $ne: socket.userId }
          },
          {
            $push: {
              readBy: {
                user: socket.userId,
                readAt: new Date()
              }
            }
          }
        );

        socket.emit('joined_chat', { chatId });
      } catch (error) {
        console.error('Join chat error:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });

    // Handle new message in specific chat
    socket.on('send_message', async (data: { chatId: string; content: string; type?: string; replyTo?: string }) => {
      try {
        const { chatId, content, type = 'text', replyTo } = data;

        if (!content || content.trim().length === 0) {
          socket.emit('error', { message: 'Message content cannot be empty' });
          return;
        }

        if (content.length > 1000) {
          socket.emit('error', { message: 'Message is too long' });
          return;
        }

        // Verify user has access to this chat
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.includes(socket.userId as any)) {
          socket.emit('error', { message: 'Access denied to this chat' });
          return;
        }

        // Save message to database
        const newMessage = new Message({
          chat: chatId,
          sender: socket.userId,
          username: socket.username,
          content: content.trim(),
          type,
          replyTo: replyTo || undefined,
          timestamp: new Date(),
          readBy: [{
            user: socket.userId,
            readAt: new Date()
          }]
        });

        await newMessage.save();

        // Update chat's last message
        chat.lastMessage = newMessage._id as any;
        chat.lastMessageTime = new Date();
        
        // Increment unread count for other participants
        chat.participants.forEach(participantId => {
          if (participantId.toString() !== socket.userId) {
            const currentCount = chat.unreadCount.get(participantId.toString()) || 0;
            chat.unreadCount.set(participantId.toString(), currentCount + 1);
          }
        });

        await chat.save();

        const populatedMessage = await Message.findById(newMessage._id)
          .populate('sender', 'username avatar')
          .populate('replyTo', 'content sender');

        // Broadcast message to all users in the chat
        io.to(`chat_${chatId}`).emit('new_message', populatedMessage);

        // Send push notification to offline users (if needed)
        // This would be implemented with a push notification service

      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle message deletion
    socket.on('delete_message', async (data: { messageId: string }) => {
      try {
        const { messageId } = data;
        
        const message = await Message.findById(messageId);
        
        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        // Check if user is the sender
        if (message.sender.toString() !== socket.userId) {
          socket.emit('error', { message: 'Not authorized to delete this message' });
          return;
        }

        message.isDeleted = true;
        message.deletedAt = new Date();
        await message.save();

        // Broadcast message deletion to chat participants
        io.to(`chat_${message.chat}`).emit('message_deleted', {
          messageId,
          chatId: message.chat,
          deletedBy: socket.username
        });

      } catch (error) {
        console.error('Delete message error:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Handle typing indicators for specific chats
    socket.on('typing_start', (data: { chatId: string }) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit('user_typing', {
        chatId,
        userId: socket.userId,
        username: socket.username,
        isTyping: true
      });
    });

    socket.on('typing_stop', (data: { chatId: string }) => {
      const { chatId } = data;
      socket.to(`chat_${chatId}`).emit('user_typing', {
        chatId,
        userId: socket.userId,
        username: socket.username,
        isTyping: false
      });
    });

    // Handle message reactions
    socket.on('add_reaction', async (data: { messageId: string; emoji: string }) => {
      try {
        const { messageId, emoji } = data;
        
        const message = await Message.findById(messageId);
        if (!message) {
          socket.emit('error', { message: 'Message not found' });
          return;
        }

        // Remove existing reaction from this user
        message.reactions = message.reactions.filter(r => r.user.toString() !== socket.userId);

        // Add new reaction
        message.reactions.push({
          user: socket.userId as any,
          emoji,
          createdAt: new Date()
        });

        await message.save();

        // Broadcast reaction to chat participants
        io.to(`chat_${message.chat}`).emit('message_reaction', {
          messageId,
          reactions: message.reactions,
          addedBy: socket.username
        });

      } catch (error) {
        console.error('Add reaction error:', error);
        socket.emit('error', { message: 'Failed to add reaction' });
      }
    });

    // Handle user status updates
    socket.on('update_status', async (data: { status: 'online' | 'away' | 'offline' }) => {
      try {
        const { status } = data;
        
        await User.findByIdAndUpdate(socket.userId, { 
          status,
          lastSeen: new Date()
        });

        // Broadcast status update
        socket.broadcast.emit('user_status_update', {
          userId: socket.userId,
          username: socket.username,
          status,
          lastSeen: new Date()
        });
      } catch (error) {
        console.error('Update status error:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`User ${socket.username} disconnected`);
      
      try {
        // Update user offline status
        await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          status: 'offline',
          lastSeen: new Date(),
          socketId: null
        });

        // Broadcast user went offline
        socket.broadcast.emit('user_offline', {
          userId: socket.userId,
          username: socket.username,
          status: 'offline',
          lastSeen: new Date()
        });
      } catch (error) {
        console.error('Disconnect handler error:', error);
      }
    });
  });
};