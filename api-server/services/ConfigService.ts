import fs from 'fs';
import path from 'path';

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

export class ConfigService {
  private config!: ApiConfig;
  private configPath: string;

  constructor() {
    this.configPath = path.join(__dirname, '../config/api.json');
    this.loadConfig();
  }

  private loadConfig(): void {
    const defaultConfig: ApiConfig = {
      port: parseInt(process.env.API_PORT || '3000'),
      database: {
        path: process.env.DATABASE_PATH || './data/bot_manager.db',
        cleanupIntervalDays: parseInt(process.env.DB_CLEANUP_DAYS || '30')
      },
      security: {
        jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-this',
        jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10')
      },
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX || '100')
      },
      websocket: {
        enabled: process.env.WEBSOCKET_ENABLED !== 'false',
        maxConnections: parseInt(process.env.WEBSOCKET_MAX_CONNECTIONS || '100')
      },
      bot: {
        maxInstances: parseInt(process.env.MAX_BOT_INSTANCES || '10'),
        defaultRpcEndpoint: process.env.DEFAULT_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
        defaultRpcWebsocketEndpoint: process.env.DEFAULT_RPC_WEBSOCKET_ENDPOINT || 'wss://api.mainnet-beta.solana.com',
        dataRetentionDays: parseInt(process.env.BOT_DATA_RETENTION_DAYS || '90')
      },
      monitoring: {
        metricsInterval: parseInt(process.env.METRICS_INTERVAL || '30000'), // 30 seconds
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '60000') // 1 minute
      }
    };

    // Try to load from file if it exists
    if (fs.existsSync(this.configPath)) {
      try {
        const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.config = { ...defaultConfig, ...fileConfig };
      } catch (error) {
        console.warn('Failed to load config file, using defaults:', error);
        this.config = defaultConfig;
      }
    } else {
      this.config = defaultConfig;
      this.saveConfig();
    }
  }

  private saveConfig(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save config file:', error);
    }
  }

  public getConfig(): ApiConfig {
    return this.config;
  }

  public updateConfig(updates: Partial<ApiConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  public getPort(): number {
    return this.config.port;
  }

  public getDatabaseConfig(): ApiConfig['database'] {
    return this.config.database;
  }

  public getSecurityConfig(): ApiConfig['security'] {
    return this.config.security;
  }

  public getRateLimitConfig(): ApiConfig['rateLimit'] {
    return this.config.rateLimit;
  }

  public getWebSocketConfig(): ApiConfig['websocket'] {
    return this.config.websocket;
  }

  public getBotConfig(): ApiConfig['bot'] {
    return this.config.bot;
  }

  public getMonitoringConfig(): ApiConfig['monitoring'] {
    return this.config.monitoring;
  }

  public validateConfig(): boolean {
    try {
      // Basic validation
      if (!this.config.port || this.config.port < 1 || this.config.port > 65535) {
        throw new Error('Invalid port number');
      }

      if (!this.config.security.jwtSecret || this.config.security.jwtSecret.length < 8) {
        throw new Error('JWT secret must be at least 8 characters long');
      }

      if (this.config.bot.maxInstances < 1 || this.config.bot.maxInstances > 100) {
        throw new Error('Max bot instances must be between 1 and 100');
      }

      return true;
    } catch (error) {
      console.error('Config validation failed:', error);
      return false;
    }
  }

  public resetToDefaults(): void {
    this.loadConfig();
  }
} 