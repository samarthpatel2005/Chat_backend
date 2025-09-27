import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import Message from '../models/Message';
import User from '../models/User';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
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
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User ${socket.username} connected`);

    // Join user to the main chat room
    socket.join('main_chat');

    // Broadcast user joined message
    socket.to('main_chat').emit('user_joined', {
      username: socket.username,
      message: `${socket.username} joined the chat`
    });

    // Handle new message
    socket.on('send_message', async (data: { content: string }) => {
      try {
        const { content } = data;

        if (!content || content.trim().length === 0) {
          socket.emit('error', { message: 'Message content cannot be empty' });
          return;
        }

        if (content.length > 1000) {
          socket.emit('error', { message: 'Message is too long' });
          return;
        }

        // Save message to database
        const newMessage = new Message({
          sender: socket.userId,
          username: socket.username,
          content: content.trim(),
          timestamp: new Date()
        });

        await newMessage.save();

        // Broadcast message to all users in the chat room
        io.to('main_chat').emit('new_message', {
          _id: newMessage._id,
          sender: socket.userId,
          username: socket.username,
          content: newMessage.content,
          timestamp: newMessage.timestamp
        });

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

        await Message.findByIdAndDelete(messageId);

        // Broadcast message deletion to all users
        io.to('main_chat').emit('message_deleted', {
          messageId,
          deletedBy: socket.username
        });

      } catch (error) {
        console.error('Delete message error:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', () => {
      socket.to('main_chat').emit('user_typing', {
        username: socket.username,
        isTyping: true
      });
    });

    socket.on('typing_stop', () => {
      socket.to('main_chat').emit('user_typing', {
        username: socket.username,
        isTyping: false
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User ${socket.username} disconnected`);
      
      // Broadcast user left message
      socket.to('main_chat').emit('user_left', {
        username: socket.username,
        message: `${socket.username} left the chat`
      });
    });
  });
};