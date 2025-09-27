import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  _id: string;
  username: string;
  email: string;
  password: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
  lastSeen: Date;
  bio?: string;
  phoneNumber?: string;
  isOnline: boolean;
  socketId?: string;
  contacts: string[];
  blockedUsers: string[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  avatar: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'away'],
    default: 'offline'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  bio: {
    type: String,
    maxlength: 150,
    default: 'Hey there! I am using WizChat.'
  },
  phoneNumber: {
    type: String,
    sparse: true
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  socketId: {
    type: String
  },
  contacts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

export default mongoose.model<IUser>('User', UserSchema);