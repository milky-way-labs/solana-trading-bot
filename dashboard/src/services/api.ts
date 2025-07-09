import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { 
  ApiResponse, 
  AuthResponse, 
  BotInstance, 
  BotFormData, 
  SystemMetrics, 
  PerformanceMetrics, 
  Alert, 
  DetailedBotMetrics,
  TradesSummary,
  ApiConfig,
  HealthStatus
} from '../types';

class ApiService {
  private api: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Load token from localStorage
    this.token = localStorage.getItem('auth_token');
    if (this.token) {
      this.setAuthToken(this.token);
    }

    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.clearAuth();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth methods
  async login(username: string, password: string): Promise<AuthResponse> {
    const response = await this.api.post<AuthResponse>('/api/auth/login', {
      username,
      password,
    });
    
    if (response.data.success && response.data.data.token) {
      this.setAuthToken(response.data.data.token);
    }
    
    return response.data;
  }

  async register(username: string, password: string, role: string = 'user'): Promise<ApiResponse> {
    const response = await this.api.post<ApiResponse>('/api/auth/register', {
      username,
      password,
      role,
    });
    return response.data;
  }

  async getCurrentUser(): Promise<ApiResponse> {
    const response = await this.api.get<ApiResponse>('/api/auth/me');
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse> {
    const response = await this.api.post<ApiResponse>('/api/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  }

  setAuthToken(token: string): void {
    this.token = token;
    localStorage.setItem('auth_token', token);
    this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearAuth(): void {
    this.token = null;
    localStorage.removeItem('auth_token');
    delete this.api.defaults.headers.common['Authorization'];
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  // Bot management methods
  async getBots(): Promise<ApiResponse<BotInstance[]>> {
    const response = await this.api.get<ApiResponse<BotInstance[]>>('/api/bots');
    return response.data;
  }

  async getBot(id: string): Promise<ApiResponse<BotInstance>> {
    const response = await this.api.get<ApiResponse<BotInstance>>(`/api/bots/${id}`);
    return response.data;
  }

  async createBot(botData: BotFormData): Promise<ApiResponse<BotInstance>> {
    const response = await this.api.post<ApiResponse<BotInstance>>('/api/bots', botData);
    return response.data;
  }

  async updateBot(id: string, botData: Partial<BotFormData>): Promise<ApiResponse<BotInstance>> {
    const response = await this.api.put<ApiResponse<BotInstance>>(`/api/bots/${id}`, botData);
    return response.data;
  }

  async deleteBot(id: string): Promise<ApiResponse> {
    const response = await this.api.delete<ApiResponse>(`/api/bots/${id}`);
    return response.data;
  }

  async startBot(id: string): Promise<ApiResponse> {
    const response = await this.api.post<ApiResponse>(`/api/bots/${id}/start`);
    return response.data;
  }

  async stopBot(id: string): Promise<ApiResponse> {
    const response = await this.api.post<ApiResponse>(`/api/bots/${id}/stop`);
    return response.data;
  }

  async restartBot(id: string): Promise<ApiResponse> {
    const response = await this.api.post<ApiResponse>(`/api/bots/${id}/restart`);
    return response.data;
  }

  async getBotLogs(id: string, limit: number = 100): Promise<ApiResponse<string[]>> {
    const response = await this.api.get<ApiResponse<string[]>>(`/api/bots/${id}/logs?limit=${limit}`);
    return response.data;
  }

  async bulkBotAction(action: 'start' | 'stop' | 'restart', botIds: string[]): Promise<ApiResponse> {
    const response = await this.api.post<ApiResponse>('/api/bots/bulk-action', {
      action,
      botIds,
    });
    return response.data;
  }

  // Metrics methods
  async getSystemMetrics(): Promise<ApiResponse<SystemMetrics>> {
    const response = await this.api.get<ApiResponse<SystemMetrics>>('/api/metrics/system');
    return response.data;
  }

  async getSystemMetricsHistory(limit: number = 50): Promise<ApiResponse<SystemMetrics[]>> {
    const response = await this.api.get<ApiResponse<SystemMetrics[]>>(`/api/metrics/system/history?limit=${limit}`);
    return response.data;
  }

  async getBotMetrics(): Promise<ApiResponse<DetailedBotMetrics[]>> {
    const response = await this.api.get<ApiResponse<DetailedBotMetrics[]>>('/api/metrics/bots');
    return response.data;
  }

  async getBotMetricsById(id: string): Promise<ApiResponse<DetailedBotMetrics>> {
    const response = await this.api.get<ApiResponse<DetailedBotMetrics>>(`/api/metrics/bots/${id}`);
    return response.data;
  }

  async getBotMetricsHistory(id: string, limit: number = 100): Promise<ApiResponse<any[]>> {
    const response = await this.api.get<ApiResponse<any[]>>(`/api/metrics/bots/${id}/history?limit=${limit}`);
    return response.data;
  }

  async getBotTradesSummary(id: string): Promise<ApiResponse<TradesSummary>> {
    const response = await this.api.get<ApiResponse<TradesSummary>>(`/api/metrics/bots/${id}/trades`);
    return response.data;
  }

  async getPerformanceMetrics(): Promise<ApiResponse<PerformanceMetrics>> {
    const response = await this.api.get<ApiResponse<PerformanceMetrics>>('/api/metrics/performance');
    return response.data;
  }

  async getAlerts(): Promise<ApiResponse<Alert[]>> {
    const response = await this.api.get<ApiResponse<Alert[]>>('/api/metrics/alerts');
    return response.data;
  }

  // Configuration methods
  async getConfig(): Promise<ApiResponse<ApiConfig>> {
    const response = await this.api.get<ApiResponse<ApiConfig>>('/api/config');
    return response.data;
  }

  async updateConfig(config: Partial<ApiConfig>): Promise<ApiResponse<ApiConfig>> {
    const response = await this.api.put<ApiResponse<ApiConfig>>('/api/config', config);
    return response.data;
  }

  async validateConfig(): Promise<ApiResponse<{ isValid: boolean }>> {
    const response = await this.api.post<ApiResponse<{ isValid: boolean }>>('/api/config/validate');
    return response.data;
  }

  async resetConfig(): Promise<ApiResponse<ApiConfig>> {
    const response = await this.api.post<ApiResponse<ApiConfig>>('/api/config/reset');
    return response.data;
  }

  // Health check
  async getHealth(): Promise<HealthStatus> {
    const response = await this.api.get<HealthStatus>('/health');
    return response.data;
  }

  // Generic request method for custom calls
  async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    switch (method) {
      case 'GET':
        return this.api.get<T>(url, config);
      case 'POST':
        return this.api.post<T>(url, data, config);
      case 'PUT':
        return this.api.put<T>(url, data, config);
      case 'DELETE':
        return this.api.delete<T>(url, config);
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }
}

// Create singleton instance
const apiService = new ApiService();

export default apiService; 