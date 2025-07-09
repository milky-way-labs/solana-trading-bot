import { io, Socket } from 'socket.io-client';
import { WebSocketMessage } from '../types';

export type WebSocketEventType = 
  | 'bot_created'
  | 'bot_updated'
  | 'bot_deleted'
  | 'bot_started'
  | 'bot_stopped'
  | 'bot_log'
  | 'bot_error'
  | 'bot_trade'
  | 'bot_status_changed'
  | 'bot_metrics_updated'
  | 'system_metrics_updated'
  | 'system_alert'
  | 'dashboard_update'
  | 'heartbeat'
  | 'subscription_updated'
  | 'connect'
  | 'disconnect'
  | 'connect_error';

export type WebSocketCallback = (data: any) => void;

class WebSocketService {
  private socket: Socket | null = null;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private eventHandlers: Map<WebSocketEventType, Set<WebSocketCallback>> = new Map();
  private subscriptions: {
    topics: string[];
    botIds: string[];
  } = {
    topics: [],
    botIds: []
  };

  constructor() {
    this.initializeEventHandlers();
  }

  private initializeEventHandlers(): void {
    // Initialize handler sets for all event types
    const eventTypes: WebSocketEventType[] = [
      'bot_created', 'bot_updated', 'bot_deleted', 'bot_started', 'bot_stopped',
      'bot_log', 'bot_error', 'bot_trade', 'bot_status_changed', 'bot_metrics_updated',
      'system_metrics_updated', 'system_alert', 'dashboard_update', 'heartbeat',
      'subscription_updated', 'connect', 'disconnect', 'connect_error'
    ];

    eventTypes.forEach(eventType => {
      this.eventHandlers.set(eventType, new Set());
    });
  }

  public connect(token?: string): void {
    if (this.socket?.connected) {
      console.log('WebSocket already connected');
      return;
    }

    const url = process.env.REACT_APP_WS_URL || 'http://localhost:3000';
    
    this.socket = io(url, {
      auth: token ? { token } : undefined,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.setupSocketEventListeners();
  }

  private setupSocketEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      
      // Restore subscriptions on reconnect
      if (this.subscriptions.topics.length > 0 || this.subscriptions.botIds.length > 0) {
        this.updateSubscriptions(this.subscriptions.topics, this.subscriptions.botIds);
      }

      this.emitToHandlers('connect', { connected: true });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.connected = false;
      this.emitToHandlers('disconnect', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.connected = false;
      this.reconnectAttempts++;
      this.emitToHandlers('connect_error', { error, attempts: this.reconnectAttempts });
    });

    // Bot events
    this.socket.on('bot_created', (data: WebSocketMessage) => {
      this.emitToHandlers('bot_created', data);
    });

    this.socket.on('bot_updated', (data: WebSocketMessage) => {
      this.emitToHandlers('bot_updated', data);
    });

    this.socket.on('bot_deleted', (data: WebSocketMessage) => {
      this.emitToHandlers('bot_deleted', data);
    });

    this.socket.on('bot_started', (data: WebSocketMessage) => {
      this.emitToHandlers('bot_started', data);
    });

    this.socket.on('bot_stopped', (data: WebSocketMessage) => {
      this.emitToHandlers('bot_stopped', data);
    });

    this.socket.on('bot_log', (data: WebSocketMessage) => {
      this.emitToHandlers('bot_log', data);
    });

    this.socket.on('bot_error', (data: WebSocketMessage) => {
      this.emitToHandlers('bot_error', data);
    });

    this.socket.on('bot_trade', (data: WebSocketMessage) => {
      this.emitToHandlers('bot_trade', data);
    });

    this.socket.on('bot_status_changed', (data: WebSocketMessage) => {
      this.emitToHandlers('bot_status_changed', data);
    });

    this.socket.on('bot_metrics_updated', (data: WebSocketMessage) => {
      this.emitToHandlers('bot_metrics_updated', data);
    });

    // System events
    this.socket.on('system_metrics_updated', (data: WebSocketMessage) => {
      this.emitToHandlers('system_metrics_updated', data);
    });

    this.socket.on('system_alert', (data: WebSocketMessage) => {
      this.emitToHandlers('system_alert', data);
    });

    this.socket.on('dashboard_update', (data: WebSocketMessage) => {
      this.emitToHandlers('dashboard_update', data);
    });

    this.socket.on('heartbeat', (data: WebSocketMessage) => {
      this.emitToHandlers('heartbeat', data);
    });

    this.socket.on('subscription_updated', (data: any) => {
      console.log('Subscription updated:', data);
      this.emitToHandlers('subscription_updated', data);
    });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  public subscribe(topics: string[] = [], botIds: string[] = []): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, cannot subscribe');
      return;
    }

    // Merge with existing subscriptions
    const newTopics = Array.from(new Set([...this.subscriptions.topics, ...topics]));
    const newBotIds = Array.from(new Set([...this.subscriptions.botIds, ...botIds]));

    this.updateSubscriptions(newTopics, newBotIds);
  }

  public unsubscribe(topics: string[] = [], botIds: string[] = []): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, cannot unsubscribe');
      return;
    }

    // Remove from existing subscriptions
    const newTopics = this.subscriptions.topics.filter(topic => !topics.includes(topic));
    const newBotIds = this.subscriptions.botIds.filter(botId => !botIds.includes(botId));

    this.updateSubscriptions(newTopics, newBotIds);
  }

  private updateSubscriptions(topics: string[], botIds: string[]): void {
    if (!this.socket?.connected) return;

    this.subscriptions = { topics, botIds };
    
    this.socket.emit('subscribe', {
      topics,
      botIds
    });
  }

  public subscribeToAll(): void {
    this.subscribe(['all_bots', 'system_metrics', 'system_alerts', 'dashboard']);
  }

  public subscribeToBot(botId: string): void {
    this.subscribe([], [botId]);
  }

  public subscribeToTopic(topic: string): void {
    this.subscribe([topic], []);
  }

  // Event handler management
  public on(eventType: WebSocketEventType, callback: WebSocketCallback): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.add(callback);
    }
  }

  public off(eventType: WebSocketEventType, callback: WebSocketCallback): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(callback);
    }
  }

  public once(eventType: WebSocketEventType, callback: WebSocketCallback): void {
    const wrappedCallback = (data: any) => {
      callback(data);
      this.off(eventType, wrappedCallback);
    };
    this.on(eventType, wrappedCallback);
  }

  private emitToHandlers(eventType: WebSocketEventType, data: any): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in WebSocket event handler for ${eventType}:`, error);
        }
      });
    }
  }

  // Utility methods
  public isConnected(): boolean {
    return this.connected && !!this.socket?.connected;
  }

  public getConnectionStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    subscriptions: { topics: string[]; botIds: string[] };
  } {
    return {
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: { ...this.subscriptions }
    };
  }

  public forceReconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      setTimeout(() => {
        this.socket?.connect();
      }, 1000);
    }
  }

  // Send custom events (if needed)
  public emit(eventName: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(eventName, data);
    }
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

export default websocketService; 