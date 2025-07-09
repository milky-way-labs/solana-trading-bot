import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthResponse } from '../types';
import apiService from '../services/api';
import websocketService from '../services/websocket';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  register: (username: string, password: string, role?: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  isAuthenticated: boolean;
  hasRole: (role: string) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated on app start
    const checkAuth = async () => {
      try {
        if (apiService.isAuthenticated()) {
          const response = await apiService.getCurrentUser();
          if (response.success && response.data) {
            setUser(response.data);
            // Connect websocket with auth token
            const token = localStorage.getItem('auth_token');
            if (token) {
              websocketService.connect(token);
            }
          } else {
            // Clear invalid token
            apiService.clearAuth();
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        apiService.clearAuth();
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setLoading(true);
      const response: AuthResponse = await apiService.login(username, password);
      
      if (response.success && response.data) {
        setUser(response.data.user);
        // Connect websocket with auth token
        websocketService.connect(response.data.token);
        return { success: true };
      } else {
        return { success: false, error: 'Invalid credentials' };
      }
    } catch (error: any) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Login failed' 
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    apiService.clearAuth();
    websocketService.disconnect();
    // Redirect to login page
    window.location.href = '/login';
  };

  const register = async (username: string, password: string, role: string = 'user'): Promise<{ success: boolean; error?: string }> => {
    try {
      setLoading(true);
      const response = await apiService.register(username, password, role);
      
      if (response.success) {
        return { success: true };
      } else {
        return { success: false, error: response.error || 'Registration failed' };
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Registration failed' 
      };
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setLoading(true);
      const response = await apiService.changePassword(currentPassword, newPassword);
      
      if (response.success) {
        return { success: true };
      } else {
        return { success: false, error: response.error || 'Password change failed' };
      }
    } catch (error: any) {
      console.error('Password change error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Password change failed' 
      };
    } finally {
      setLoading(false);
    }
  };

  const isAuthenticated = !!user;
  const hasRole = (role: string): boolean => user?.role === role;
  const isAdmin = user?.role === 'admin';

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    register,
    changePassword,
    isAuthenticated,
    hasRole,
    isAdmin
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 