import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    _id: string;
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token, authorization denied' });
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key';
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    req.user = { 
      id: decoded.userId,
      _id: decoded.userId 
    };
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};
