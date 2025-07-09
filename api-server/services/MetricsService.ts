import { BotInstance } from './BotManager';
import { DatabaseService, DatabaseMetrics } from './DatabaseService';
import { Logger } from './Logger';

export interface SystemMetrics {
  timestamp: Date;
  totalBots: number;
  runningBots: number;
  stoppedBots: number;
  errorBots: number;
  totalTrades: number;
  totalProfit: number;
  totalLoss: number;
  systemUptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
}

export interface BotMetrics {
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

export class MetricsService {
  private metricsHistory: SystemMetrics[] = [];
  private botMetricsCache: Map<string, BotMetrics> = new Map();
  private startTime: Date;
  private lastCpuUsage: NodeJS.CpuUsage;

  constructor(
    private database: DatabaseService,
    private logger: Logger
  ) {
    this.startTime = new Date();
    this.lastCpuUsage = process.cpuUsage();
    this.startPeriodicCollection();
  }

  private startPeriodicCollection(): void {
    // Collect metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Save metrics to database every 5 minutes
    setInterval(() => {
      this.saveMetricsToDatabase();
    }, 300000);

    // Cleanup old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000);
  }

  public collectSystemMetrics(): SystemMetrics {
    const now = new Date();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    this.lastCpuUsage = process.cpuUsage();

    const systemMetrics: SystemMetrics = {
      timestamp: now,
      totalBots: this.botMetricsCache.size,
      runningBots: Array.from(this.botMetricsCache.values()).filter(m => m.status === 'running').length,
      stoppedBots: Array.from(this.botMetricsCache.values()).filter(m => m.status === 'stopped').length,
      errorBots: Array.from(this.botMetricsCache.values()).filter(m => m.status === 'error').length,
      totalTrades: Array.from(this.botMetricsCache.values()).reduce((sum, m) => sum + m.totalTrades, 0),
      totalProfit: Array.from(this.botMetricsCache.values()).reduce((sum, m) => sum + m.totalProfit, 0),
      totalLoss: Array.from(this.botMetricsCache.values()).reduce((sum, m) => sum + m.totalLoss, 0),
      systemUptime: Date.now() - this.startTime.getTime(),
      memoryUsage,
      cpuUsage
    };

    // Store in memory (keep last 100 entries)
    this.metricsHistory.push(systemMetrics);
    if (this.metricsHistory.length > 100) {
      this.metricsHistory.shift();
    }

    return systemMetrics;
  }

  public updateBotMetrics(instance: BotInstance): void {
    const botMetrics: BotMetrics = {
      botId: instance.id,
      botName: instance.config.name,
      status: instance.status,
      uptime: instance.metrics.uptime,
      totalTrades: instance.metrics.totalTrades,
      successfulTrades: instance.metrics.successfulTrades,
      failedTrades: instance.metrics.totalTrades - instance.metrics.successfulTrades,
      totalProfit: instance.metrics.totalProfit,
      totalLoss: instance.metrics.totalLoss,
      currentPositions: instance.metrics.currentPositions,
      lastActivity: instance.metrics.lastActivity,
      winRate: instance.metrics.totalTrades > 0 ? 
        (instance.metrics.successfulTrades / instance.metrics.totalTrades) * 100 : 0,
      avgTradeTime: this.calculateAvgTradeTime(instance),
      profitPerHour: this.calculateProfitPerHour(instance)
    };

    this.botMetricsCache.set(instance.id, botMetrics);
  }

  public getBotMetrics(botId: string): BotMetrics | undefined {
    return this.botMetricsCache.get(botId);
  }

  public getAllBotMetrics(): BotMetrics[] {
    return Array.from(this.botMetricsCache.values());
  }

  public getSystemMetrics(): SystemMetrics {
    return this.collectSystemMetrics();
  }

  public getSystemMetricsHistory(limit: number = 50): SystemMetrics[] {
    return this.metricsHistory.slice(-limit);
  }

  public async getBotMetricsHistory(botId: string, limit: number = 100): Promise<DatabaseMetrics[]> {
    try {
      return await this.database.getMetrics(botId, limit);
    } catch (error) {
      this.logger.error('Failed to get bot metrics history:', error);
      return [];
    }
  }

  public async getBotTradesSummary(botId: string): Promise<any> {
    try {
      return await this.database.getTradesSummary(botId);
    } catch (error) {
      this.logger.error('Failed to get bot trades summary:', error);
      return {
        totalTrades: 0,
        successfulTrades: 0,
        totalProfit: 0,
        totalVolume: 0,
        winRate: 0
      };
    }
  }

  public getPerformanceMetrics(): {
    topPerformers: BotMetrics[];
    worstPerformers: BotMetrics[];
    averageMetrics: Partial<BotMetrics>;
  } {
    const allMetrics = this.getAllBotMetrics();
    
    if (allMetrics.length === 0) {
      return {
        topPerformers: [],
        worstPerformers: [],
        averageMetrics: {}
      };
    }

    // Sort by profit
    const sortedByProfit = [...allMetrics].sort((a, b) => b.totalProfit - a.totalProfit);
    const topPerformers = sortedByProfit.slice(0, 5);
    const worstPerformers = sortedByProfit.slice(-5).reverse();

    // Calculate averages
    const averageMetrics = {
      totalTrades: allMetrics.reduce((sum, m) => sum + m.totalTrades, 0) / allMetrics.length,
      totalProfit: allMetrics.reduce((sum, m) => sum + m.totalProfit, 0) / allMetrics.length,
      winRate: allMetrics.reduce((sum, m) => sum + m.winRate, 0) / allMetrics.length,
      profitPerHour: allMetrics.reduce((sum, m) => sum + m.profitPerHour, 0) / allMetrics.length
    };

    return {
      topPerformers,
      worstPerformers,
      averageMetrics
    };
  }

  public getAlerts(): Array<{
    type: 'warning' | 'error' | 'info';
    message: string;
    botId?: string;
    timestamp: Date;
  }> {
    const alerts: Array<{
      type: 'warning' | 'error' | 'info';
      message: string;
      botId?: string;
      timestamp: Date;
    }> = [];

    const now = new Date();
    
    // Check for bots in error state
    this.botMetricsCache.forEach((metrics, botId) => {
      if (metrics.status === 'error') {
        alerts.push({
          type: 'error',
          message: `Bot ${metrics.botName} is in error state`,
          botId,
          timestamp: now
        });
      }

      // Check for low win rate
      if (metrics.totalTrades > 10 && metrics.winRate < 30) {
        alerts.push({
          type: 'warning',
          message: `Bot ${metrics.botName} has low win rate: ${metrics.winRate.toFixed(2)}%`,
          botId,
          timestamp: now
        });
      }

      // Check for inactive bots
      const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
      if (metrics.status === 'running' && 
          (now.getTime() - metrics.lastActivity.getTime()) > inactiveThreshold) {
        alerts.push({
          type: 'warning',
          message: `Bot ${metrics.botName} has been inactive for ${Math.floor((now.getTime() - metrics.lastActivity.getTime()) / 60000)} minutes`,
          botId,
          timestamp: now
        });
      }
    });

    // Check system metrics
    const systemMetrics = this.getSystemMetrics();
    if (systemMetrics.memoryUsage.heapUsed > 1000 * 1024 * 1024) { // 1GB
      alerts.push({
        type: 'warning',
        message: `High memory usage: ${(systemMetrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        timestamp: now
      });
    }

    return alerts;
  }

  private calculateAvgTradeTime(instance: BotInstance): number {
    // This would require tracking trade durations
    // For now, return a placeholder
    return 0;
  }

  private calculateProfitPerHour(instance: BotInstance): number {
    if (instance.metrics.uptime === 0) return 0;
    
    const hoursRunning = instance.metrics.uptime / (1000 * 60 * 60);
    const netProfit = instance.metrics.totalProfit - instance.metrics.totalLoss;
    
    return hoursRunning > 0 ? netProfit / hoursRunning : 0;
  }

  private async saveMetricsToDatabase(): Promise<void> {
    try {
      for (const [botId, metrics] of this.botMetricsCache) {
        const dbMetrics: DatabaseMetrics = {
          botId,
          timestamp: new Date(),
          totalTrades: metrics.totalTrades,
          successfulTrades: metrics.successfulTrades,
          totalProfit: metrics.totalProfit,
          totalLoss: metrics.totalLoss,
          currentPositions: metrics.currentPositions,
          uptime: metrics.uptime
        };

        await this.database.saveMetrics(dbMetrics);
      }
    } catch (error) {
      this.logger.error('Failed to save metrics to database:', error);
    }
  }

  private cleanupOldMetrics(): void {
    // Keep only last 100 entries in memory
    if (this.metricsHistory.length > 100) {
      this.metricsHistory = this.metricsHistory.slice(-100);
    }
  }

  public removeBotMetrics(botId: string): void {
    this.botMetricsCache.delete(botId);
  }
} 