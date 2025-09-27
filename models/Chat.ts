import mongoose, { Document, Schema } from 'mongoose';

export interface IChat extends Document {
  _id: string;
  type: 'private' | 'group';
  participants: string[];
  name?: string; // For group chats
  description?: string; // For group chats
  avatar?: string; // For group chats
  admin?: string[]; // For group chats
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: Map<string, number>; // userId -> unread count
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChatSchema: Schema = new Schema({
  type: {
    type: String,
    enum: ['private', 'group'],
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  name: {
    type: String,
    trim: true,
    maxlength: 50
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200
  },
  avatar: {
    type: String,
    default: ''
  },
  admin: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageTime: {
    type: Date,
    default: Date.now
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: new Map()
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
ChatSchema.index({ participants: 1 });
ChatSchema.index({ type: 1, participants: 1 });
ChatSchema.index({ lastMessageTime: -1 });

export default mongoose.model<IChat>('Chat', ChatSchema);