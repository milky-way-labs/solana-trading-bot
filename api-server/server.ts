import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { BotManager } from './services/BotManager';
import { DatabaseService } from './services/DatabaseService';
import { AuthMiddleware } from './middleware/AuthMiddleware';
import { Logger } from './services/Logger';
import { ConfigService } from './services/ConfigService';
import { MetricsService } from './services/MetricsService';
import { WebSocketService } from './services/WebSocketService';

// Route imports
import { botRoutes } from './routes/botRoutes';
import { configRoutes } from './routes/configRoutes';
import { metricsRoutes } from './routes/metricsRoutes';
import { authRoutes } from './routes/authRoutes';

class ApiServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private botManager!: BotManager;
  private database!: DatabaseService;
  private logger!: Logger;
  private config!: ConfigService;
  private metrics!: MetricsService;
  private websocket!: WebSocketService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.initializeServices();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeWebSocket();
    this.initializeErrorHandling();
  }

  private async initializeServices() {
    this.logger = new Logger();
    this.config = new ConfigService();
    this.database = new DatabaseService();
    
    // Initialize database first
    await this.database.initialize();
    
    // Create default admin user if not exists
    await this.createDefaultUser();
    
    this.websocket = new WebSocketService(this.io);
    this.metrics = new MetricsService(this.database, this.logger);
    
    // Initialize bot manager with dependencies after database is ready
    this.botManager = new BotManager(
      this.database,
      this.logger,
      this.config,
      this.metrics,
      this.websocket
    );

    this.logger.info('Services initialized successfully');
  }

  private async createDefaultUser(): Promise<void> {
    try {
      // Check if admin user already exists
      const existingAdmin = await this.database.getUserByUsername('admin');
      
      if (!existingAdmin) {
        // Create default admin user
        const bcrypt = require('bcrypt');
        const { v4: uuidv4 } = require('uuid');
        
        const defaultPassword = 'admin123';
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        const adminId = uuidv4();
        
        await this.database.createUser(adminId, 'admin', passwordHash, 'admin');
        
        this.logger.info('Default admin user created - Username: admin, Password: admin123');
        this.logger.info('IMPORTANT: Change the default password after first login!');
      } else {
        this.logger.info('Admin user already exists');
      }
      
      this.logger.info('Database initialized and ready');
    } catch (error) {
      this.logger.error('Failed to create default user:', error);
    }
  }

  private initializeMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors());
    
    // Body parsing middleware
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });

    // Rate limiting could be added here
    this.logger.info('Middleware initialized');
  }

  private initializeRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        activeBots: this.botManager.getActiveBotCount()
      });
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/bots', AuthMiddleware.authenticate, botRoutes(this.botManager));
    this.app.use('/api/config', AuthMiddleware.authenticate, configRoutes(this.config));
    this.app.use('/api/metrics', AuthMiddleware.authenticate, metricsRoutes(this.metrics));

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl
      });
    });

    this.logger.info('Routes initialized');
  }

  private initializeWebSocket() {
    this.io.on('connection', (socket) => {
      this.logger.info(`WebSocket client connected: ${socket.id}`);
      
      socket.on('subscribe', (data) => {
        this.websocket.handleSubscription(socket, data);
      });

      socket.on('unsubscribe', (data) => {
        this.websocket.handleUnsubscription(socket, data);
      });

      socket.on('disconnect', () => {
        this.logger.info(`WebSocket client disconnected: ${socket.id}`);
      });
    });

    this.logger.info('WebSocket initialized');
  }

  private initializeErrorHandling() {
    // Global error handler
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Unhandled error:', err);
      
      res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
        timestamp: new Date().toISOString(),
        path: req.path
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      this.logger.error('Uncaught Exception:', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (err) => {
      this.logger.error('Unhandled Rejection:', err);
      process.exit(1);
    });

    this.logger.info('Error handling initialized');
  }

  public async start(port: number = 3000) {
    try {
      this.server.listen(port, () => {
        this.logger.info(`API Server running on port ${port}`);
        this.logger.info(`WebSocket server running on port ${port}`);
        this.logger.info(`Health check: http://localhost:${port}/health`);
      });
    } catch (error) {
      this.logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public async stop() {
    this.logger.info('Shutting down server...');
    
    // Stop all bot instances
    await this.botManager.stopAllBots();
    
    // Close database connection
    await this.database.close();
    
    // Close server
    this.server.close(() => {
      this.logger.info('Server shut down successfully');
      process.exit(0);
    });
  }
}

// Initialize and start server
const server = new ApiServer();
const PORT = process.env.API_PORT || 3000;

server.start(Number(PORT));

// Graceful shutdown
process.on('SIGTERM', () => server.stop());
process.on('SIGINT', () => server.stop()); 