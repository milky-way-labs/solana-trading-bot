import { Router, Request, Response } from 'express';
import { AuthMiddleware } from '../middleware/AuthMiddleware';

export const authRoutes = Router();

// Simple in-memory user storage for demo
// In production, use a proper database
const users = new Map<string, {
  id: string;
  username: string;
  password: string;
  role: string;
}>();

// Default admin user
users.set('admin', {
  id: 'admin',
  username: 'admin',
  password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password: 'password'
  role: 'admin'
});

// POST /api/auth/login - Login
authRoutes.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const user = users.get(username);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const isValidPassword = await AuthMiddleware.comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const token = AuthMiddleware.generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// POST /api/auth/register - Register (admin only)
authRoutes.post('/register', AuthMiddleware.authenticate, AuthMiddleware.authorize(['admin']), async (req: any, res: Response) => {
  try {
    const { username, password, role = 'user' } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    if (users.has(username)) {
      return res.status(409).json({
        success: false,
        error: 'Username already exists'
      });
    }

    const hashedPassword = await AuthMiddleware.hashPassword(password);
    const userId = `user_${Date.now()}`;

    users.set(username, {
      id: userId,
      username,
      password: hashedPassword,
      role
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: userId,
          username,
          role
        }
      },
      message: 'User created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// POST /api/auth/change-password - Change password
authRoutes.post('/change-password', AuthMiddleware.authenticate, async (req: any, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    const user = users.get(req.user.username);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const isValidPassword = await AuthMiddleware.comparePassword(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    const hashedNewPassword = await AuthMiddleware.hashPassword(newPassword);
    user.password = hashedNewPassword;
    users.set(req.user.username, user);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Password change failed'
    });
  }
});

// GET /api/auth/me - Get current user
authRoutes.get('/me', AuthMiddleware.authenticate, (req: any, res: Response) => {
  res.json({
    success: true,
    data: {
      user: req.user
    }
  });
});

// GET /api/auth/users - Get all users (admin only)
authRoutes.get('/users', AuthMiddleware.authenticate, AuthMiddleware.authorize(['admin']), (req: any, res: Response) => {
  const usersList = Array.from(users.values()).map(user => ({
    id: user.id,
    username: user.username,
    role: user.role
  }));

  res.json({
    success: true,
    data: usersList
  });
});

// DELETE /api/auth/users/:username - Delete user (admin only)
authRoutes.delete('/users/:username', AuthMiddleware.authenticate, AuthMiddleware.authorize(['admin']), (req: any, res: Response) => {
  const { username } = req.params;

  if (username === 'admin') {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete admin user'
    });
  }

  if (!users.has(username)) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  users.delete(username);

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
}); 