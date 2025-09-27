import express from 'express';
import { AuthRequest, authMiddleware } from '../middleware/authMiddleware';
import User from '../models/User';

const router = express.Router();

// Get all users (for demo purposes)
router.get('/all', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const currentUserId = req.user?.id;
    
    const users = await User.find({
      _id: { $ne: currentUserId }
    })
    .select('username email avatar status isOnline lastSeen bio')
    .limit(50); // Limit to prevent large responses

    res.json({ users });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile
router.get('/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    
    const user = await User.findById(userId)
      .select('username email avatar status lastSeen bio');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    const { avatar, bio, status } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update fields
    if (avatar !== undefined) user.avatar = avatar;
    if (bio !== undefined) user.bio = bio;
    if (status !== undefined) user.status = status;

    await user.save();

    res.json({ 
      message: 'Profile updated successfully',
      user: {
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;