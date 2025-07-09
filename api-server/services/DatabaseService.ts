import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { BotConfig } from './BotManager';

export interface DatabaseMetrics {
  botId: string;
  timestamp: Date;
  totalTrades: number;
  successfulTrades: number;
  totalProfit: number;
  totalLoss: number;
  currentPositions: number;
  uptime: number;
}

export interface DatabaseTrade {
  id: string;
  botId: string;
  type: 'buy' | 'sell';
  tokenMint: string;
  tokenSymbol?: string;
  amount: number;
  price: number;
  profit?: number;
  timestamp: Date;
  transactionHash?: string;
}

export class DatabaseService {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    // Create database directory if it doesn't exist
    const dbDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    this.dbPath = path.join(dbDir, 'bot_manager.db');
  }

  public async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        this.createTables()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  private async createTables(): Promise<void> {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `;

    const createBotConfigsTable = `
      CREATE TABLE IF NOT EXISTS bot_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        enabled BOOLEAN DEFAULT true,
        config TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_started DATETIME,
        last_stopped DATETIME
      )
    `;

    const createMetricsTable = `
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_trades INTEGER DEFAULT 0,
        successful_trades INTEGER DEFAULT 0,
        total_profit REAL DEFAULT 0,
        total_loss REAL DEFAULT 0,
        current_positions INTEGER DEFAULT 0,
        uptime INTEGER DEFAULT 0,
        FOREIGN KEY (bot_id) REFERENCES bot_configs (id) ON DELETE CASCADE
      )
    `;

    const createTradesTable = `
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
        token_mint TEXT NOT NULL,
        token_symbol TEXT,
        amount REAL NOT NULL,
        price REAL NOT NULL,
        profit REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        transaction_hash TEXT,
        FOREIGN KEY (bot_id) REFERENCES bot_configs (id) ON DELETE CASCADE
      )
    `;

    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_bot_configs_enabled ON bot_configs(enabled)',
      'CREATE INDEX IF NOT EXISTS idx_metrics_bot_id ON metrics(bot_id)',
      'CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_trades_bot_id ON trades(bot_id)',
      'CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_trades_type ON trades(type)'
    ];

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.serialize(() => {
        this.db!.run(createUsersTable);
        this.db!.run(createBotConfigsTable);
        this.db!.run(createMetricsTable);
        this.db!.run(createTradesTable);
        
        // Create indexes
        createIndexes.forEach(indexSql => {
          this.db!.run(indexSql);
        });
        
        resolve();
      });
    });
  }

  // User Methods
  public async createUser(id: string, username: string, passwordHash: string, role: string = 'user'): Promise<void> {
    const sql = `
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.run(sql, [
        id,
        username,
        passwordHash,
        role,
        new Date().toISOString()
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async getUserByUsername(username: string): Promise<any | null> {
    const sql = 'SELECT * FROM users WHERE username = ?';
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.get(sql, [username], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        resolve(row || null);
      });
    });
  }

  public async updateUserLastLogin(username: string): Promise<void> {
    const sql = 'UPDATE users SET last_login = ? WHERE username = ?';
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.run(sql, [new Date().toISOString(), username], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Bot Configuration Methods
  public async saveBotConfig(config: BotConfig): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO bot_configs 
      (id, name, description, enabled, config, created_at, updated_at, last_started, last_stopped)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.run(sql, [
        config.id,
        config.name,
        config.description || '',
        config.enabled ? 1 : 0,
        JSON.stringify(config.config),
        config.createdAt.toISOString(),
        config.updatedAt.toISOString(),
        config.lastStarted?.toISOString() || null,
        config.lastStopped?.toISOString() || null
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async getBotConfig(id: string): Promise<BotConfig | null> {
    const sql = 'SELECT * FROM bot_configs WHERE id = ?';
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.get(sql, [id], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!row) {
          resolve(null);
          return;
        }
        
        resolve(this.mapRowToBotConfig(row));
      });
    });
  }

  public async getAllBotConfigs(): Promise<BotConfig[]> {
    const sql = 'SELECT * FROM bot_configs ORDER BY created_at DESC';
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.all(sql, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        const configs = rows.map(row => this.mapRowToBotConfig(row));
        resolve(configs);
      });
    });
  }

  public async updateBotConfig(config: BotConfig): Promise<void> {
    config.updatedAt = new Date();
    return this.saveBotConfig(config);
  }

  public async deleteBotConfig(id: string): Promise<void> {
    const sql = 'DELETE FROM bot_configs WHERE id = ?';
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.run(sql, [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Metrics Methods
  public async saveMetrics(metrics: DatabaseMetrics): Promise<void> {
    const sql = `
      INSERT INTO metrics 
      (bot_id, timestamp, total_trades, successful_trades, total_profit, total_loss, current_positions, uptime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.run(sql, [
        metrics.botId,
        metrics.timestamp.toISOString(),
        metrics.totalTrades,
        metrics.successfulTrades,
        metrics.totalProfit,
        metrics.totalLoss,
        metrics.currentPositions,
        metrics.uptime
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async getMetrics(botId: string, limit: number = 100): Promise<DatabaseMetrics[]> {
    const sql = `
      SELECT * FROM metrics 
      WHERE bot_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `;
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.all(sql, [botId, limit], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        const metrics = rows.map(row => ({
          botId: row.bot_id,
          timestamp: new Date(row.timestamp),
          totalTrades: row.total_trades,
          successfulTrades: row.successful_trades,
          totalProfit: row.total_profit,
          totalLoss: row.total_loss,
          currentPositions: row.current_positions,
          uptime: row.uptime
        }));
        
        resolve(metrics);
      });
    });
  }

  // Trade Methods
  public async saveTrade(trade: DatabaseTrade): Promise<void> {
    const sql = `
      INSERT INTO trades 
      (id, bot_id, type, token_mint, token_symbol, amount, price, profit, timestamp, transaction_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.run(sql, [
        trade.id,
        trade.botId,
        trade.type,
        trade.tokenMint,
        trade.tokenSymbol || null,
        trade.amount,
        trade.price,
        trade.profit || null,
        trade.timestamp.toISOString(),
        trade.transactionHash || null
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public async getTrades(botId: string, limit: number = 100): Promise<DatabaseTrade[]> {
    const sql = `
      SELECT * FROM trades 
      WHERE bot_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `;
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.all(sql, [botId, limit], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        
        const trades = rows.map(row => ({
          id: row.id,
          botId: row.bot_id,
          type: row.type as 'buy' | 'sell',
          tokenMint: row.token_mint,
          tokenSymbol: row.token_symbol,
          amount: row.amount,
          price: row.price,
          profit: row.profit,
          timestamp: new Date(row.timestamp),
          transactionHash: row.transaction_hash
        }));
        
        resolve(trades);
      });
    });
  }

  public async getTradesSummary(botId: string): Promise<{
    totalTrades: number;
    successfulTrades: number;
    totalProfit: number;
    totalVolume: number;
    winRate: number;
  }> {
    const sql = `
      SELECT 
        COUNT(*) as total_trades,
        COUNT(CASE WHEN type = 'sell' AND profit > 0 THEN 1 END) as successful_trades,
        SUM(CASE WHEN type = 'sell' THEN COALESCE(profit, 0) ELSE 0 END) as total_profit,
        SUM(amount * price) as total_volume
      FROM trades 
      WHERE bot_id = ?
    `;
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.get(sql, [botId], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        const totalTrades = row.total_trades || 0;
        const successfulTrades = row.successful_trades || 0;
        const totalProfit = row.total_profit || 0;
        const totalVolume = row.total_volume || 0;
        const winRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;
        
        resolve({
          totalTrades,
          successfulTrades,
          totalProfit,
          totalVolume,
          winRate
        });
      });
    });
  }

  // Utility Methods
  public async cleanupOldData(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const cleanupSql = [
      'DELETE FROM metrics WHERE timestamp < ?',
      'DELETE FROM trades WHERE timestamp < ?'
    ];
    
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      this.db.serialize(() => {
        cleanupSql.forEach(sql => {
          this.db!.run(sql, [cutoffDate.toISOString()]);
        });
        resolve();
      });
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private mapRowToBotConfig(row: any): BotConfig {
    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      enabled: row.enabled === 1,
      config: JSON.parse(row.config),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastStarted: row.last_started ? new Date(row.last_started) : undefined,
      lastStopped: row.last_stopped ? new Date(row.last_stopped) : undefined
    };
  }
} 