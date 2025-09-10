import { logger } from './logger';

export interface TradeNotification {
  type: 'buy' | 'sell' | 'error' | 'info';
  symbol?: string;
  mint?: string;
  amount?: number;
  price?: number;
  profit?: number;
  message: string;
  timestamp?: Date;
}

export interface DiscordBotConfig {
  webhookUrl: string;
  instanceId?: string;
  username?: string;
  avatarUrl?: string;
  color?: number;
  emoji?: string;
}

export class DiscordNotifier {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }


  private getEmbedColor(type: string): number {
    switch (type) {
      case 'buy': return 0x00ff00;      // Verde
      case 'sell': return 0xff6b00;     // Arancione  
      case 'error': return 0xff0000;    // Rosso
      case 'info': return 0x9945FF;     // Purple
      default: return 0x808080;         // Grigio
    }
  }

  private getEmoji(type: string): string {
    switch (type) {
      case 'buy': return '💰';
      case 'sell': return '📈';
      case 'error': return '🚨';
      case 'info': return 'ℹ️';
      default: return '📊';
    }
  }

  async sendTradeNotification(trade: TradeNotification): Promise<void> {
    if (!this.webhookUrl) {
      logger.warn('Discord webhook URL not configured');
      return;
    }

    try {
      const embed = {
        title: `🤖 ${this.getEmoji(trade.type)} ${trade.type.toUpperCase()}${trade.symbol ? ` - ${trade.symbol}` : ''}`,
        description: trade.message,
        color: this.getEmbedColor(trade.type),
        timestamp: (trade.timestamp || new Date()).toISOString(),
        fields: [] as any[],
        footer: {
          text: 'Solana Trading Bot',
          icon_url: 'https://cryptologos.cc/logos/solana-sol-logo.png'
        }
      };

      // Aggiungi campi se disponibili
      if (trade.mint) {
        embed.fields.push({
          name: '🔗 Mint Address',
          value: `\`${trade.mint}\``,
          inline: false
        });
      }

      if (trade.amount !== undefined) {
        embed.fields.push({
          name: '💎 Amount',
          value: `${trade.amount.toFixed(6)} SOL`,
          inline: true
        });
      }

      if (trade.price !== undefined) {
        embed.fields.push({
          name: '💵 Price',
          value: `$${trade.price.toFixed(8)}`,
          inline: true
        });
      }

      if (trade.profit !== undefined) {
        const profitEmoji = trade.profit >= 0 ? '🟢' : '🔴';
        const profitText = trade.profit >= 0 ? 'Profit' : 'Loss';
        embed.fields.push({
          name: `${profitEmoji} ${profitText}`,
          value: `${trade.profit.toFixed(6)} SOL (${((trade.profit / (trade.amount || 1)) * 100).toFixed(2)}%)`,
          inline: true
        });
      }

      const payload = {
        embeds: [embed],
        username: 'Solana Trading Bot',
        avatar_url: 'https://cryptologos.cc/logos/solana-sol-logo.png'
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
      }

      logger.debug(`Discord notification sent: ${trade.type} - ${trade.symbol || 'Unknown'}`);

    } catch (error) {
      logger.error('Failed to send Discord notification:', error);
    }
  }

  // Metodi di convenienza
  async sendBuy(symbol: string, mint: string, amount: number, price: number): Promise<void> {
    await this.sendTradeNotification({
      type: 'buy',
      symbol,
      mint,
      amount,
      price,
      message: `🎯 **BUY EXECUTED**\nSuccessfully purchased ${symbol}`,
      timestamp: new Date()
    });
  }

  async sendSell(symbol: string, mint: string, amount: number, price: number, profit: number): Promise<void> {
    const profitText = profit >= 0 ? 'PROFITABLE SELL' : 'STOP LOSS TRIGGERED';
    await this.sendTradeNotification({
      type: 'sell',
      symbol,
      mint,
      amount,
      price,
      profit,
      message: `📈 **${profitText}**\nSold ${symbol} ${profit >= 0 ? 'at profit' : 'at loss'}`,
      timestamp: new Date()
    });
  }

  async sendError(message: string, mint?: string): Promise<void> {
    await this.sendTradeNotification({
      type: 'error',
      mint,
      message: `🚨 **ERROR**\n${message}`,
      timestamp: new Date()
    });
  }

  async sendInfo(message: string): Promise<void> {
    await this.sendTradeNotification({
      type: 'info',
      message: `ℹ️ **INFO**\n${message}`,
      timestamp: new Date()
    });
  }

  // Metodo per pump.fun specifico
  async sendPumpFunTrade(type: 'buy' | 'sell', symbol: string, mint: string, amount: number, progress?: number, marketCap?: number): Promise<void> {
    let message = `🎯 **PUMP.FUN ${type.toUpperCase()}**\n${type === 'buy' ? 'Bought' : 'Sold'} ${symbol}`;
    
    if (progress !== undefined) {
      message += `\n📊 Bonding Curve: ${progress.toFixed(1)}%`;
    }
    
    if (marketCap !== undefined) {
      message += `\n💰 Market Cap: $${marketCap.toFixed(0)}`;
    }

    await this.sendTradeNotification({
      type,
      symbol: `${symbol} (Pump.fun)`,
      mint,
      amount,
      message,
      timestamp: new Date()
    });
  }
}