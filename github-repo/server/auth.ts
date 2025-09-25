// Simple authentication middleware for demo purposes
// In production, use proper JWT/session-based authentication

import { Request, Response, NextFunction } from 'express';

// Demo user ID - will be created if doesn't exist
// In production this would come from JWT/session
// NOTE: This should match the ID of the user created in the database
const DEMO_USER_ID = "demo_user_001";

// Middleware to inject demo user ID
export function injectDemoUser(req: Request, res: Response, next: NextFunction) {
  // In production, extract user ID from JWT token or session
  req.userId = DEMO_USER_ID;
  next();
}

// Type augmentation for Request
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export { DEMO_USER_ID };