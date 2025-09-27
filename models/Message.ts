import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  _id: string;
  chat: string;
  sender: string;
  username: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'video';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  replyTo?: string; // Message ID being replied to
  readBy: Array<{
    user: string;
    readAt: Date;
  }>;
  editedAt?: Date;
  isEdited: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  reactions: Array<{
    user: string;
    emoji: string;
    createdAt: Date;
  }>;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema = new Schema({
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'audio', 'video'],
    default: 'text'
  },
  fileUrl: {
    type: String
  },
  fileName: {
    type: String
  },
  fileSize: {
    type: Number
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  editedAt: {
    type: Date
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

export default mongoose.model<IMessage>('Message', MessageSchema);