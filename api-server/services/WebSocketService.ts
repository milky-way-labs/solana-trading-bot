import { Server as SocketIOServer, Socket } from 'socket.io';

export interface WebSocketSubscription {
  socketId: string;
  topics: string[];
  botIds: string[];
}

export class WebSocketService {
  private subscriptions: Map<string, WebSocketSubscription> = new Map();
  private connectedClients: Map<string, Socket> = new Map();

  constructor(private io: SocketIOServer) {
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.connectedClients.set(socket.id, socket);

      // Initialize subscription for new client
      this.subscriptions.set(socket.id, {
        socketId: socket.id,
        topics: [],
        botIds: []
      });

      socket.on('disconnect', () => {
        this.connectedClients.delete(socket.id);
        this.subscriptions.delete(socket.id);
      });
    });
  }

  public handleSubscription(socket: Socket, data: {
    topics?: string[];
    botIds?: string[];
  }): void {
    const subscription = this.subscriptions.get(socket.id);
    if (!subscription) return;

    // Update subscription
    if (data.topics) {
      subscription.topics = [...new Set([...subscription.topics, ...data.topics])];
    }
    if (data.botIds) {
      subscription.botIds = [...new Set([...subscription.botIds, ...data.botIds])];
    }

    this.subscriptions.set(socket.id, subscription);

    // Send acknowledgment
    socket.emit('subscription_updated', {
      topics: subscription.topics,
      botIds: subscription.botIds
    });
  }

  public handleUnsubscription(socket: Socket, data: {
    topics?: string[];
    botIds?: string[];
  }): void {
    const subscription = this.subscriptions.get(socket.id);
    if (!subscription) return;

    // Remove from subscription
    if (data.topics) {
      subscription.topics = subscription.topics.filter(topic => !data.topics!.includes(topic));
    }
    if (data.botIds) {
      subscription.botIds = subscription.botIds.filter(botId => !data.botIds!.includes(botId));
    }

    this.subscriptions.set(socket.id, subscription);

    // Send acknowledgment
    socket.emit('subscription_updated', {
      topics: subscription.topics,
      botIds: subscription.botIds
    });
  }

  public broadcast(event: string, data: any): void {
    this.io.emit(event, {
      timestamp: new Date().toISOString(),
      data
    });
  }

  public broadcastToTopic(topic: string, event: string, data: any): void {
    this.subscriptions.forEach((subscription, socketId) => {
      if (subscription.topics.includes(topic)) {
        const socket = this.connectedClients.get(socketId);
        if (socket) {
          socket.emit(event, {
            timestamp: new Date().toISOString(),
            topic,
            data
          });
        }
      }
    });
  }

  public broadcastToBotSubscribers(botId: string, event: string, data: any): void {
    this.subscriptions.forEach((subscription, socketId) => {
      if (subscription.botIds.includes(botId) || subscription.topics.includes('all_bots')) {
        const socket = this.connectedClients.get(socketId);
        if (socket) {
          socket.emit(event, {
            timestamp: new Date().toISOString(),
            botId,
            data
          });
        }
      }
    });
  }

  public sendToSocket(socketId: string, event: string, data: any): void {
    const socket = this.connectedClients.get(socketId);
    if (socket) {
      socket.emit(event, {
        timestamp: new Date().toISOString(),
        data
      });
    }
  }

  public getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  public getSubscriptionStats(): {
    totalClients: number;
    topicsSubscriptions: Record<string, number>;
    botSubscriptions: Record<string, number>;
  } {
    const topicsSubscriptions: Record<string, number> = {};
    const botSubscriptions: Record<string, number> = {};

    this.subscriptions.forEach((subscription) => {
      subscription.topics.forEach((topic) => {
        topicsSubscriptions[topic] = (topicsSubscriptions[topic] || 0) + 1;
      });
      subscription.botIds.forEach((botId) => {
        botSubscriptions[botId] = (botSubscriptions[botId] || 0) + 1;
      });
    });

    return {
      totalClients: this.connectedClients.size,
      topicsSubscriptions,
      botSubscriptions
    };
  }

  // Predefined events for common use cases
  public notifyBotStatusChange(botId: string, status: string, data?: any): void {
    this.broadcastToBotSubscribers(botId, 'bot_status_changed', {
      status,
      ...data
    });
  }

  public notifyBotMetricsUpdate(botId: string, metrics: any): void {
    this.broadcastToBotSubscribers(botId, 'bot_metrics_updated', metrics);
  }

  public notifyBotLog(botId: string, log: string, type: 'stdout' | 'stderr'): void {
    this.broadcastToBotSubscribers(botId, 'bot_log', {
      log,
      type
    });
  }

  public notifyBotTrade(botId: string, trade: any): void {
    this.broadcastToBotSubscribers(botId, 'bot_trade', trade);
  }

  public notifySystemAlert(alert: any): void {
    this.broadcastToTopic('system_alerts', 'system_alert', alert);
  }

  public notifySystemMetrics(metrics: any): void {
    this.broadcastToTopic('system_metrics', 'system_metrics_updated', metrics);
  }

  // Real-time dashboard updates
  public sendDashboardUpdate(update: {
    type: 'bot_created' | 'bot_updated' | 'bot_deleted' | 'bot_started' | 'bot_stopped' | 'bot_error';
    data: any;
  }): void {
    this.broadcastToTopic('dashboard', 'dashboard_update', update);
  }

  public sendHeartbeat(): void {
    this.broadcast('heartbeat', {
      serverTime: new Date().toISOString(),
      connectedClients: this.getConnectedClientsCount()
    });
  }

  // Start heartbeat to keep connections alive
  public startHeartbeat(): void {
    setInterval(() => {
      this.sendHeartbeat();
    }, 30000); // Every 30 seconds
  }
} 