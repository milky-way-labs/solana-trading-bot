import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID, MARKET_STATE_LAYOUT_V3, Token } from '@raydium-io/raydium-sdk';
import bs58 from 'bs58';
import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { EventEmitter } from 'events';
import { PUMP_FUN_PROGRAM_ID, PUMP_FUN_MIGRATION_PROGRAM, ENABLE_PUMP_FUN_LISTENER, ENABLE_RAYDIUM_LISTENER } from '../helpers/constants';
import { PumpFunHelper, PumpFunCreateEvent, PumpFunTradeEvent, PumpFunCompleteEvent } from '../helpers/pump-fun';
import { logger } from '../helpers/logger';

export class Listeners extends EventEmitter {
  private subscriptions: number[] = [];
  private pumpFunHelper: PumpFunHelper;

  constructor(private readonly connection: Connection) {
    super();
    this.pumpFunHelper = new PumpFunHelper(connection);
  }

  public async start(config: {
    walletPublicKey: PublicKey;
    quoteToken: Token;
    autoSell: boolean;
    cacheNewMarkets: boolean;
  }) {
    logger.info('Starting listeners...');

    // Protocol selection logging
    logger.info(`🔧 Protocol configuration:`);
    logger.info(`   - Raydium listener: ${ENABLE_RAYDIUM_LISTENER ? 'ENABLED' : 'DISABLED'}`);
    logger.info(`   - Pump.fun listener: ${ENABLE_PUMP_FUN_LISTENER ? 'ENABLED' : 'DISABLED'}`);

    if (config.cacheNewMarkets && ENABLE_RAYDIUM_LISTENER) {
      const openBookSubscription = await this.subscribeToOpenBookMarkets(config);
      this.subscriptions.push(openBookSubscription);
      logger.info('OpenBook markets listener started');
    }

    // Subscribe to Raydium pools if enabled
    if (ENABLE_RAYDIUM_LISTENER) {
      const raydiumSubscription = await this.subscribeToRaydiumPools(config);
      this.subscriptions.push(raydiumSubscription);
      logger.info('Raydium pools listener started');
    } else {
      logger.info('Raydium pools listener DISABLED - skipping');
    }

    // Subscribe to pump.fun if enabled
    if (ENABLE_PUMP_FUN_LISTENER) {
      const pumpFunSubscription = await this.subscribeToPumpFun(config);
      this.subscriptions.push(pumpFunSubscription);
      logger.info('Pump.fun listener started');

      const pumpFunMigrationSubscription = await this.subscribeToPumpFunMigrations();
      this.subscriptions.push(pumpFunMigrationSubscription);
      logger.info('Pump.fun migrations listener started');
    } else {
      logger.info('Pump.fun listeners DISABLED - skipping');
    }

    if (config.autoSell) {
      const walletSubscription = await this.subscribeToWalletChanges(config);
      this.subscriptions.push(walletSubscription);
      logger.info('Wallet changes listener started');
    }

    logger.info(`Total listeners started: ${this.subscriptions.length}`);

    // Add heartbeat to verify WebSocket connectivity
    setInterval(() => {
      logger.info(`🔄 WebSocket heartbeat - ${this.subscriptions.length} active subscriptions`);
    }, 30000); // Every 30 seconds

    // Protocol status summary
    const enabledProtocols = [];
    if (ENABLE_RAYDIUM_LISTENER) enabledProtocols.push('Raydium');
    if (ENABLE_PUMP_FUN_LISTENER) enabledProtocols.push('Pump.fun');

    if (enabledProtocols.length === 0) {
      logger.warn('⚠️ NO PROTOCOLS ENABLED - Bot will not detect any tokens!');
    } else {
      logger.info(`🎯 Enabled protocols: ${enabledProtocols.join(', ')}`);
    }
  }

  public getActiveListenerCount(): number {
    return this.subscriptions.length;
  }

  private async subscribeToOpenBookMarkets(config: { quoteToken: Token }) {
    return this.connection.onProgramAccountChange(
      MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
      async (updatedAccountInfo) => {
        this.emit('market', updatedAccountInfo);
      },
      this.connection.commitment,
      [
        { dataSize: MARKET_STATE_LAYOUT_V3.span },
        {
          memcmp: {
            offset: MARKET_STATE_LAYOUT_V3.offsetOf('quoteMint'),
            bytes: config.quoteToken.mint.toBase58(),
          },
        },
      ],
    );
  }

  private async subscribeToRaydiumPools(config: { quoteToken: Token }) {
    logger.info(`🔍 Subscribing to Raydium pools for quote token: ${config.quoteToken.symbol}`);
    
    return this.connection.onProgramAccountChange(
      MAINNET_PROGRAM_ID.AmmV4,
      async (updatedAccountInfo) => {
        logger.debug(`🏊 Raydium pool update: ${updatedAccountInfo.accountId.toString()}`);
        this.emit('pool', updatedAccountInfo);
      },
      this.connection.commitment,
      [
        { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
            bytes: config.quoteToken.mint.toBase58(),
          },
        },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
            bytes: MAINNET_PROGRAM_ID.OPENBOOK_MARKET.toBase58(),
          },
        },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('status'),
            bytes: bs58.encode([6, 0, 0, 0, 0, 0, 0, 0]),
          },
        },
      ],
    );
  }

  private async subscribeToWalletChanges(config: { walletPublicKey: PublicKey }) {
    return this.connection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      async (updatedAccountInfo) => {
        this.emit('wallet', updatedAccountInfo);
      },
      this.connection.commitment,
      [
        {
          dataSize: 165,
        },
        {
          memcmp: {
            offset: 32,
            bytes: config.walletPublicKey.toBase58(),
          },
        },
      ],
    );
  }

  private async subscribeToPumpFun(config: { quoteToken: Token }) {
    const pumpFunProgramId = new PublicKey(PUMP_FUN_PROGRAM_ID);
    logger.info(`🎯 Subscribing to Pump.fun logs for program: ${pumpFunProgramId.toString()}`);
    
    // Use onLogs instead of onProgramAccountChange to catch all pump.fun transactions
    return this.connection.onLogs(
      pumpFunProgramId,
      async (logs, ctx) => {
        try {
          // Log ALL pump.fun activity for debugging
          logger.info(`🎯 Pump.fun logs received: ${logs.signature} - ${logs.logs.length} logs`);

          // Check for CREATE transactions (more permissive approach)
          const hasCreateLog = logs.logs.some(log =>
            log.includes('Program log: Instruction: Create') ||
            log.includes('CreateTokenMetadata') ||
            log.includes('InitializeMint') ||
            log.toLowerCase().includes('create')
          );

          // Process ANY transaction that has create indicators
          if (hasCreateLog) {
            logger.info(`🚀 PUMP.FUN TOKEN CREATION detected in tx: ${logs.signature}`);
            // Emit create event with minimal processing for speed
            this.emit('pumpFunCreate', {
              signature: logs.signature,
              logs: logs.logs,
              ctx,
              slot: ctx.slot,
              timestamp: Date.now() // Add current timestamp for freshness check
            });
            return; // Process as create event
          }
          
          // Check for other events only if not a create event (but don't log them to keep output clean)
          const hasTradeLog = logs.logs.some(log => 
            log.includes('Program log: Instruction: Buy') || 
            log.includes('Program log: Instruction: Sell')
          );
          
          if (hasTradeLog) {
            const isBuy = logs.logs.some(log => log.includes('Buy'));
            this.emit('pumpFunTrade', { 
              signature: logs.signature,
              isBuy,
              logs: logs.logs,
              ctx 
            });
            return;
          }
          
          const hasCompleteLog = logs.logs.some(log => log.includes('Program log: Instruction: Complete'));
          if (hasCompleteLog) {
            logger.info(`🎯 PUMP.FUN BONDING CURVE COMPLETED in tx: ${logs.signature}`);
            this.emit('pumpFunComplete', { 
              signature: logs.signature,
              logs: logs.logs,
              ctx 
            });
            return;
          }
          
        } catch (error) {
          logger.error('Error processing pump.fun logs:', error);
        }
      },
      this.connection.commitment
    );
  }

  private async subscribeToPumpFunMigrations() {
    const migrationProgramId = new PublicKey(PUMP_FUN_MIGRATION_PROGRAM);
    
    return this.connection.onProgramAccountChange(
      migrationProgramId,
      async (updatedAccountInfo) => {
        try {
          logger.info(`Pump.fun migration detected: ${updatedAccountInfo.accountId.toString()}`);
          
          this.emit('pumpFunMigration', updatedAccountInfo);
        } catch (error) {
          logger.error('Error processing pump.fun migration:', error);
        }
      },
      this.connection.commitment
    );
  }

  private isPumpFunBondingCurve(pubkey: PublicKey, data: Buffer): boolean {
    // Basic check - you may need to implement more sophisticated logic
    // based on actual pump.fun account structure
    return data.length > 0 && data.length <= 1024;
  }

  private async subscribeToPumpFunLogs() {
    // Alternative method using logs subscription
    // This would be more comprehensive but requires more parsing
    try {
      const pumpFunProgramId = new PublicKey(PUMP_FUN_PROGRAM_ID);
      
      return this.connection.onLogs(
        pumpFunProgramId,
        async (logs, ctx) => {
          try {
            logger.debug('Pump.fun logs received:', logs.logs);
            
            // Look for specific log patterns
            const createEvent = this.parseCreateEventFromLogs(logs.logs);
            if (createEvent) {
              this.emit('pumpFunCreate', createEvent);
            }

            const tradeEvent = this.parseTradeEventFromLogs(logs.logs);
            if (tradeEvent) {
              this.emit('pumpFunTrade', tradeEvent);
            }

            const completeEvent = this.parseCompleteEventFromLogs(logs.logs);
            if (completeEvent) {
              this.emit('pumpFunComplete', completeEvent);
            }
          } catch (error) {
            logger.error('Error parsing pump.fun logs:', error);
          }
        },
        this.connection.commitment
      );
    } catch (error) {
      logger.error('Error setting up pump.fun logs subscription:', error);
      return -1;
    }
  }

  private parseCreateEventFromLogs(logs: string[]): PumpFunCreateEvent | null {
    // Look for token creation patterns in logs
    for (const log of logs) {
      if (log.includes('Created') || log.includes('Initialize')) {
        // Parse log to extract creation details
        // This is a simplified implementation
        try {
          // You would implement actual parsing logic here
          // based on pump.fun's log format
          return null;
        } catch (error) {
          logger.error('Error parsing create event:', error);
        }
      }
    }
    return null;
  }

  private parseTradeEventFromLogs(logs: string[]): PumpFunTradeEvent | null {
    // Look for buy/sell patterns in logs
    for (const log of logs) {
      if (log.includes('buy') || log.includes('sell') || log.includes('swap')) {
        try {
          // Implement actual parsing logic
          return null;
        } catch (error) {
          logger.error('Error parsing trade event:', error);
        }
      }
    }
    return null;
  }

  private parseCompleteEventFromLogs(logs: string[]): PumpFunCompleteEvent | null {
    // Look for completion/migration patterns
    for (const log of logs) {
      if (log.includes('Complete') || log.includes('Migrate')) {
        try {
          // Implement actual parsing logic
          return null;
        } catch (error) {
          logger.error('Error parsing complete event:', error);
        }
      }
    }
    return null;
  }

  public async stop() {
    logger.info('Stopping listeners...');
    
    for (let i = this.subscriptions.length - 1; i >= 0; i--) {
      const subscription = this.subscriptions[i];
      try {
        await this.connection.removeAccountChangeListener(subscription);
        this.subscriptions.splice(i, 1);
        logger.debug(`Removed subscription: ${subscription}`);
      } catch (error) {
        logger.error(`Error removing subscription ${subscription}:`, error);
      }
    }
    
    logger.info('All listeners stopped');
  }
}
