import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
}

export class AuthMiddleware {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

  public static authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: 'Access denied. No token provided.' });
      return;
    }

    try {
      const decoded = jwt.verify(token, AuthMiddleware.JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch (error) {
      res.status(400).json({ error: 'Invalid token.' });
    }
  }

  public static authorize(roles: string[] = ['admin', 'user']) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      if (!roles.includes(req.user.role)) {
        res.status(403).json({ error: 'Insufficient permissions.' });
        return;
      }

      next();
    };
  }

  public static generateToken(user: { id: string; username: string; role: string }): string {
    return jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role
      },
      AuthMiddleware.JWT_SECRET,
      { expiresIn: '24h' }
    );
  }

  public static async hashPassword(password: string): Promise<string> {
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
    return bcrypt.hash(password, rounds);
  }

  public static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
} 