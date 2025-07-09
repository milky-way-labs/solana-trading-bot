import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { DatabaseService } from './DatabaseService';
import { Logger } from './Logger';
import { ConfigService } from './ConfigService';
import { MetricsService } from './MetricsService';
import { WebSocketService } from './WebSocketService';

export interface BotConfig {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  config: {
    // Bot configuration parameters
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
    // Filters
    enableSymbolBlacklist: boolean;
    enableAutoBlacklistRugs: boolean;
    autoBlacklistLossThreshold: number;
    // Technical Analysis
    useTechnicalAnalysis: boolean;
    // Telegram
    useTelegram: boolean;
    telegramBotToken?: string;
    telegramChatId?: number;
    telegramThreadId?: number;
    // Additional parameters
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
  process?: ChildProcess;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  pid?: number;
  startedAt?: Date;
  error?: string;
  logs: string[];
  metrics: {
    totalTrades: number;
    successfulTrades: number;
    totalProfit: number;
    totalLoss: number;
    currentPositions: number;
    uptime: number;
    lastActivity: Date;
  };
}

export class BotManager {
  private instances: Map<string, BotInstance> = new Map();
  private botProjectPath: string;

  constructor(
    private database: DatabaseService,
    private logger: Logger,
    private config: ConfigService,
    private metrics: MetricsService,
    private websocket: WebSocketService
  ) {
    this.botProjectPath = path.resolve(__dirname, '../../'); // Path to bot project
    this.initializeManager();
  }

  private async initializeManager() {
    this.logger.info('Initializing BotManager...');
    
    // Load existing configurations from database
    const savedConfigs = await this.database.getAllBotConfigs();
    
    for (const config of savedConfigs) {
      const instance: BotInstance = {
        id: config.id,
        config,
        status: 'stopped',
        logs: [],
        metrics: {
          totalTrades: 0,
          successfulTrades: 0,
          totalProfit: 0,
          totalLoss: 0,
          currentPositions: 0,
          uptime: 0,
          lastActivity: new Date()
        }
      };
      
      this.instances.set(config.id, instance);
    }

    // Start monitoring for metrics collection
    this.startMetricsCollection();
    
    this.logger.info(`BotManager initialized with ${this.instances.size} bot configurations`);
  }

  public async createBot(botConfig: Partial<BotConfig>): Promise<BotInstance> {
    const id = uuidv4();
    const now = new Date();
    
    const config: BotConfig = {
      id,
      name: botConfig.name || `Bot_${id.slice(0, 8)}`,
      description: botConfig.description || '',
      enabled: botConfig.enabled ?? true,
      config: {
        privateKey: botConfig.config?.privateKey || '',
        rpcEndpoint: botConfig.config?.rpcEndpoint || 'https://api.mainnet-beta.solana.com',
        rpcWebsocketEndpoint: botConfig.config?.rpcWebsocketEndpoint || 'wss://api.mainnet-beta.solana.com',
        quoteMint: botConfig.config?.quoteMint || 'WSOL',
        quoteAmount: botConfig.config?.quoteAmount || '0.002',
        maxTokensAtTheTime: botConfig.config?.maxTokensAtTheTime || 3,
        autoSell: botConfig.config?.autoSell ?? true,
        takeProfit: botConfig.config?.takeProfit || 40,
        stopLoss: botConfig.config?.stopLoss || 100,
        buySlippage: botConfig.config?.buySlippage || 20,
        sellSlippage: botConfig.config?.sellSlippage || 50,
        enableSymbolBlacklist: botConfig.config?.enableSymbolBlacklist ?? true,
        enableAutoBlacklistRugs: botConfig.config?.enableAutoBlacklistRugs ?? true,
        autoBlacklistLossThreshold: botConfig.config?.autoBlacklistLossThreshold || 80,
        useTechnicalAnalysis: botConfig.config?.useTechnicalAnalysis ?? false,
        useTelegram: botConfig.config?.useTelegram ?? false,
        telegramBotToken: botConfig.config?.telegramBotToken || '',
        telegramChatId: botConfig.config?.telegramChatId || 0,
        telegramThreadId: botConfig.config?.telegramThreadId || 0,
        ...botConfig.config
      },
      createdAt: now,
      updatedAt: now
    };

    const instance: BotInstance = {
      id,
      config,
      status: 'stopped',
      logs: [],
      metrics: {
        totalTrades: 0,
        successfulTrades: 0,
        totalProfit: 0,
        totalLoss: 0,
        currentPositions: 0,
        uptime: 0,
        lastActivity: new Date()
      }
    };

    // Save to database
    await this.database.saveBotConfig(config);
    
    // Add to instances
    this.instances.set(id, instance);
    
    this.logger.info(`Bot created: ${config.name} (${id})`);
    
    // Notify via WebSocket
    this.websocket.broadcast('bot_created', {
      id,
      config: this.sanitizeConfig(config)
    });

    return instance;
  }

  public async startBot(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Bot with id ${id} not found`);
    }

    if (instance.status === 'running') {
      throw new Error(`Bot ${id} is already running`);
    }

    if (!instance.config.enabled) {
      throw new Error(`Bot ${id} is disabled`);
    }

    try {
      instance.status = 'starting';
      instance.logs = [];
      instance.error = undefined;

      // Create environment variables from config
      const env = this.createEnvironmentForBot(instance.config);
      
      // Create unique data directory for this bot instance
      const botDataDir = path.join(this.botProjectPath, 'data', id);
      if (!fs.existsSync(botDataDir)) {
        fs.mkdirSync(botDataDir, { recursive: true });
      }

      // Spawn bot process
      const botProcess = spawn('npm', ['start'], {
        cwd: this.botProjectPath,
        env: { ...process.env, ...env, BOT_DATA_DIR: botDataDir },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      instance.process = botProcess;
      instance.pid = botProcess.pid;
      instance.startedAt = new Date();
      instance.config.lastStarted = new Date();

      // Handle process output
      botProcess.stdout?.on('data', (data) => {
        const log = data.toString();
        instance.logs.push(`[STDOUT] ${log}`);
        this.limitLogs(instance);
        this.websocket.broadcast('bot_log', { id, log, type: 'stdout' });
      });

      botProcess.stderr?.on('data', (data) => {
        const log = data.toString();
        instance.logs.push(`[STDERR] ${log}`);
        this.limitLogs(instance);
        this.websocket.broadcast('bot_log', { id, log, type: 'stderr' });
      });

      botProcess.on('error', (error) => {
        instance.status = 'error';
        instance.error = error.message;
        this.logger.error(`Bot ${id} process error:`, error);
        this.websocket.broadcast('bot_error', { id, error: error.message });
      });

      botProcess.on('exit', (code) => {
        instance.status = 'stopped';
        instance.config.lastStopped = new Date();
        instance.process = undefined;
        instance.pid = undefined;
        
        this.logger.info(`Bot ${id} exited with code ${code}`);
        this.websocket.broadcast('bot_stopped', { id, exitCode: code });
      });

      // Wait a bit to ensure process started successfully
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (instance.process && !instance.process.killed) {
        instance.status = 'running';
        await this.database.updateBotConfig(instance.config);
        
        this.logger.info(`Bot ${id} started successfully`);
        this.websocket.broadcast('bot_started', { id });
      } else {
        throw new Error('Bot process failed to start');
      }

    } catch (error) {
      instance.status = 'error';
      instance.error = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to start bot ${id}:`, error);
      throw error;
    }
  }

  public async stopBot(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Bot with id ${id} not found`);
    }

    if (instance.status !== 'running') {
      throw new Error(`Bot ${id} is not running`);
    }

    try {
      instance.status = 'stopping';
      
      if (instance.process) {
        // Send SIGTERM for graceful shutdown
        instance.process.kill('SIGTERM');
        
        // Wait for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Force kill if still running
        if (instance.process && !instance.process.killed) {
          instance.process.kill('SIGKILL');
        }
      }

      instance.status = 'stopped';
      instance.config.lastStopped = new Date();
      instance.process = undefined;
      instance.pid = undefined;
      
      await this.database.updateBotConfig(instance.config);
      
      this.logger.info(`Bot ${id} stopped successfully`);
      this.websocket.broadcast('bot_stopped', { id });

    } catch (error) {
      this.logger.error(`Failed to stop bot ${id}:`, error);
      throw error;
    }
  }

  public async restartBot(id: string): Promise<void> {
    await this.stopBot(id);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.startBot(id);
  }

  public async updateBot(id: string, updates: Partial<BotConfig>): Promise<BotInstance> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Bot with id ${id} not found`);
    }

    const wasRunning = instance.status === 'running';
    
    // Stop bot if running
    if (wasRunning) {
      await this.stopBot(id);
    }

    // Update configuration
    instance.config = {
      ...instance.config,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date()
    };

    // Save to database
    await this.database.updateBotConfig(instance.config);
    
    // Restart if was running
    if (wasRunning && instance.config.enabled) {
      await this.startBot(id);
    }

    this.logger.info(`Bot ${id} updated successfully`);
    this.websocket.broadcast('bot_updated', { id, config: this.sanitizeConfig(instance.config) });

    return instance;
  }

  public async deleteBot(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Bot with id ${id} not found`);
    }

    // Stop bot if running
    if (instance.status === 'running') {
      await this.stopBot(id);
    }

    // Remove from database
    await this.database.deleteBotConfig(id);
    
    // Remove from instances
    this.instances.delete(id);
    
    // Clean up data directory
    const botDataDir = path.join(this.botProjectPath, 'data', id);
    if (fs.existsSync(botDataDir)) {
      try {
        fs.rmdirSync(botDataDir, { recursive: true });
      } catch (error) {
        // Ignore errors when cleaning up
      }
    }

    this.logger.info(`Bot ${id} deleted successfully`);
    this.websocket.broadcast('bot_deleted', { id });
  }

  public getBotInstance(id: string): BotInstance | undefined {
    return this.instances.get(id);
  }

  public getAllBots(): BotInstance[] {
    return Array.from(this.instances.values());
  }

  public getActiveBotCount(): number {
    return Array.from(this.instances.values()).filter(instance => instance.status === 'running').length;
  }

  public async stopAllBots(): Promise<void> {
    const runningBots = Array.from(this.instances.values()).filter(instance => instance.status === 'running');
    
    await Promise.all(runningBots.map(instance => this.stopBot(instance.id)));
    
    this.logger.info(`Stopped ${runningBots.length} running bots`);
  }

  private createEnvironmentForBot(config: BotConfig): Record<string, string> {
    const env: Record<string, string> = {};
    
    // Map config to environment variables
    env.PRIVATE_KEY = config.config.privateKey;
    env.RPC_ENDPOINT = config.config.rpcEndpoint;
    env.RPC_WEBSOCKET_ENDPOINT = config.config.rpcWebsocketEndpoint;
    env.QUOTE_MINT = config.config.quoteMint;
    env.QUOTE_AMOUNT = config.config.quoteAmount;
    env.MAX_TOKENS_AT_THE_TIME = config.config.maxTokensAtTheTime.toString();
    env.AUTO_SELL = config.config.autoSell.toString();
    env.TAKE_PROFIT = config.config.takeProfit.toString();
    env.STOP_LOSS = config.config.stopLoss.toString();
    env.BUY_SLIPPAGE = config.config.buySlippage.toString();
    env.SELL_SLIPPAGE = config.config.sellSlippage.toString();
    env.ENABLE_AUTO_BLACKLIST_RUGS = config.config.enableAutoBlacklistRugs.toString();
    env.AUTO_BLACKLIST_LOSS_THRESHOLD = config.config.autoBlacklistLossThreshold.toString();
    env.USE_TA = config.config.useTechnicalAnalysis.toString();
    env.USE_TELEGRAM = config.config.useTelegram.toString();
    
    if (config.config.telegramBotToken) {
      env.TELEGRAM_BOT_TOKEN = config.config.telegramBotToken;
    }
    if (config.config.telegramChatId) {
      env.TELEGRAM_CHAT_ID = config.config.telegramChatId.toString();
    }
    if (config.config.telegramThreadId) {
      env.TELEGRAM_THREAD_ID = config.config.telegramThreadId.toString();
    }

    // Add instance ID for logging
    env.BOT_INSTANCE_ID = config.id;
    env.BOT_INSTANCE_NAME = config.name;

    return env;
  }

  private limitLogs(instance: BotInstance) {
    const maxLogs = 1000;
    if (instance.logs.length > maxLogs) {
      instance.logs = instance.logs.slice(-maxLogs);
    }
  }

  private sanitizeConfig(config: BotConfig): any {
    const sanitized = { ...config };
    // Remove sensitive information
    if (sanitized.config.privateKey) {
      sanitized.config.privateKey = '***HIDDEN***';
    }
    if (sanitized.config.telegramBotToken) {
      sanitized.config.telegramBotToken = '***HIDDEN***';
    }
    return sanitized;
  }

  private startMetricsCollection() {
    // Collect metrics every 30 seconds
    setInterval(() => {
      this.instances.forEach((instance) => {
        if (instance.status === 'running') {
          // Update uptime
          instance.metrics.uptime = instance.startedAt 
            ? Date.now() - instance.startedAt.getTime() 
            : 0;
          
          // This would typically parse logs or connect to bot metrics
          // For now, just update last activity
          instance.metrics.lastActivity = new Date();
        }
      });
    }, 30000);
  }
} 