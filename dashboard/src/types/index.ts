// Auth types
export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export interface AuthResponse {
  success: boolean;
  data: {
    token: string;
    user: User;
  };
}

// Bot types
export interface BotConfig {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  config: {
    privateKey: string;
    rpcEndpoint: string;
    rpcWebsocketEndpoint: string;
    quoteMint: string;
    quoteAmount: string;
    maxTokensAtTheTime: number;
    autoSell: boolean;
    takeProfit: number;
    stopLoss: number;
    buySlippage: number;
    sellSlippage: number;
    enableSymbolBlacklist: boolean;
    enableAutoBlacklistRugs: boolean;
    autoBlacklistLossThreshold: number;
    useTechnicalAnalysis: boolean;
    useTelegram: boolean;
    telegramBotToken?: string;
    telegramChatId?: number;
    telegramThreadId?: number;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
  lastStarted?: Date;
  lastStopped?: Date;
}

export interface BotInstance {
  id: string;
  config: BotConfig;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  pid?: number;
  startedAt?: Date;
  error?: string;
  logs: string[];
  metrics: BotMetrics;
}

export interface BotMetrics {
  totalTrades: number;
  successfulTrades: number;
  totalProfit: number;
  totalLoss: number;
  currentPositions: number;
  uptime: number;
  lastActivity: Date;
}

// System types
export interface SystemMetrics {
  timestamp: Date;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  totalBots: number;
  runningBots: number;
  stoppedBots: number;
  errorBots: number;
  totalTrades: number;
  totalProfit: number;
  totalLoss: number;
  systemUptime: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  cpuUsage: {
    user: number;
    system: number;
  };
}

export interface Alert {
  type: 'warning' | 'error' | 'info';
  message: string;
  botId?: string;
  timestamp: Date;
}

// Performance types
export interface PerformanceMetrics {
  topPerformers: DetailedBotMetrics[];
  worstPerformers: DetailedBotMetrics[];
  averageMetrics: Partial<DetailedBotMetrics>;
}

export interface DetailedBotMetrics {
  botId: string;
  botName: string;
  status: string;
  uptime: number;
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalProfit: number;
  totalLoss: number;
  currentPositions: number;
  lastActivity: Date;
  winRate: number;
  avgTradeTime: number;
  profitPerHour: number;
}

// Trade types
export interface Trade {
  id: string;
  botId: string;
  type: 'buy' | 'sell';
  tokenMint: string;
  tokenSymbol?: string;
  amount: number;
  price: number;
  profit?: number;
  timestamp: Date;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  transactionHash?: string;
}

export interface TradesSummary {
  totalTrades: number;
  successfulTrades: number;
  totalProfit: number;
  totalVolume: number;
  winRate: number;
}

// WebSocket types
export interface WebSocketMessage {
  timestamp: string;
  data: any;
  botId?: string;
  topic?: string;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Configuration types
export interface ApiConfig {
  port: number;
  database: {
    path: string;
    cleanupIntervalDays: number;
  };
  security: {
    jwtSecret: string;
    jwtExpiresIn: string;
    bcryptRounds: number;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  websocket: {
    enabled: boolean;
    maxConnections: number;
  };
  bot: {
    maxInstances: number;
    defaultRpcEndpoint: string;
    defaultRpcWebsocketEndpoint: string;
    dataRetentionDays: number;
  };
  monitoring: {
    metricsInterval: number;
    healthCheckInterval: number;
  };
}

// Chart data types
export interface ChartDataPoint {
  x: string | number;
  y: number;
  label?: string;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    fill?: boolean;
    tension?: number;
  }[];
}

// Form types
export interface BotFormData {
  name: string;
  description?: string;
  enabled: boolean;
  privateKey: string;
  rpcEndpoint: string;
  quoteMint: string;
  quoteAmount: string;
  maxTokensAtTheTime: number;
  autoSell: boolean;
  takeProfit: number;
  stopLoss: number;
  buySlippage: number;
  sellSlippage: number;
  enableAutoBlacklistRugs: boolean;
  autoBlacklistLossThreshold: number;
  useTechnicalAnalysis: boolean;
  useTelegram: boolean;
  telegramBotToken?: string;
  telegramChatId?: number;
  telegramThreadId?: number;
}

// UI State types
export interface UIState {
  sidebarOpen: boolean;
  darkMode: boolean;
  selectedBot?: string;
  loading: boolean;
  error?: string;
}

// Notification types
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

// Log types
export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  botId?: string;
  type?: 'stdout' | 'stderr';
}

// Pagination types
export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  activeBots: number;
  version?: string;
} 