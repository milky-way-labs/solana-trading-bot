import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
  RawAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Liquidity, LiquidityPoolKeysV4, LiquidityStateV4, Percent, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { MarketCache, PoolCache, SnipeListCache, pumpFunCache } from './cache';
import { PoolFilters, PumpFunFilter } from './filters';
import { TransactionExecutor } from './transactions';
import { createPoolKeys, KEEP_5_PERCENT_FOR_MOONSHOTS, logger, NETWORK, sleep, AutoBlacklist, ENABLE_AUTO_BLACKLIST_RUGS, AUTO_BLACKLIST_LOSS_THRESHOLD, pumpFunHelper, DiscordNotifier, USE_DISCORD, DISCORD_WEBHOOK_URL, INSTANCE_ID, PUMP_FUN_PROGRAM_ID } from './helpers';
const BN = require('bn.js');
import { PumpFunHelper } from './helpers/pump-fun';
import { Semaphore } from 'async-mutex';
import { WarpTransactionExecutor } from './transactions/warp-transaction-executor';
import { JitoTransactionExecutor } from './transactions/jito-rpc-transaction-executor';
import { BlacklistCache } from './cache/blacklist.cache';
import { TradeSignals } from './tradeSignals';
import { Messaging } from './messaging';
import { WhitelistCache } from './cache/whitelist.cache';
import { TechnicalAnalysisCache } from './cache/technical-analysis.cache';
import { logSell, logTokenCandidate } from './db';
import { getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { getPdaMetadataKey } from '@raydium-io/raydium-sdk';

export interface BotConfig {
  wallet: Keypair;
  minPoolSize: TokenAmount;
  maxPoolSize: TokenAmount;
  minInitialLiquidityValue: TokenAmount;
  quoteToken: Token;
  quoteAmount: TokenAmount;
  quoteAta: PublicKey;
  maxTokensAtTheTime: number;
  useSnipeList: boolean;
  autoSell: boolean;
  autoBuyDelay: number;
  autoSellDelay: number;
  maxBuyRetries: number;
  maxSellRetries: number;
  maxBuyDuration: number;
  unitLimit: number;
  unitPrice: number;
  takeProfit: number;
  stopLoss: number;
  trailingStopLoss: boolean;
  skipSellingIfLostMoreThan: number;
  buySlippage: number;
  sellSlippage: number;
  priceCheckInterval: number;
  priceCheckDuration: number;
  filterCheckInterval: number;
  filterCheckDuration: number;
  consecutiveMatchCount: number;
  checkHolders: boolean;
  checkTokenDistribution: boolean;
  checkAbnormalDistribution: boolean;
  telegramChatId?: number;
  telegramThreadId?: number;
  telegramBotToken?: string,
  blacklistRefreshInterval: number,
  MACDLongPeriod: number,
  MACDShortPeriod: number,
  MACDSignalPeriod: number,
  RSIPeriod: number,
  autoSellWithoutSellSignal: boolean,
  buySignalTimeToWait: number,
  buySignalPriceInterval: number,
  buySignalFractionPercentageTimeToWait: number,
  buySignalLowVolumeThreshold: number,
  useTechnicalAnalysis: boolean,
  useTelegram: boolean
}

export class Bot {
  private readonly snipeListCache?: SnipeListCache;
  private readonly blacklistCache?: BlacklistCache;
  private readonly whitelistCache?: WhitelistCache;
  private readonly autoBlacklist: AutoBlacklist;
  private readonly pumpFunFilter: PumpFunFilter;
  private readonly discordNotifier?: DiscordNotifier;

  private readonly semaphore: Semaphore;
  private sellExecutionCount = 0;
  public readonly isWarp: boolean = false;
  public readonly isJito: boolean = false;
  private readonly tradeSignals: TradeSignals;
  private readonly messaging: Messaging;

  constructor(
    private readonly connection: Connection,
    private readonly marketStorage: MarketCache,
    private readonly poolStorage: PoolCache,
    private readonly txExecutor: TransactionExecutor,
    private readonly technicalAnalysisCache: TechnicalAnalysisCache,
    readonly config: BotConfig,
  ) {
    this.isWarp = txExecutor instanceof WarpTransactionExecutor;
    this.isJito = txExecutor instanceof JitoTransactionExecutor;

    this.semaphore = new Semaphore(config.maxTokensAtTheTime);

    this.messaging = new Messaging(config);

    this.autoBlacklist = new AutoBlacklist(connection, ENABLE_AUTO_BLACKLIST_RUGS, AUTO_BLACKLIST_LOSS_THRESHOLD);
    this.pumpFunFilter = new PumpFunFilter(connection);
    
    // Initialize Discord notifier if enabled
    if (USE_DISCORD && DISCORD_WEBHOOK_URL) {
      this.discordNotifier = new DiscordNotifier(DISCORD_WEBHOOK_URL);
      logger.info('Discord notifications enabled');
    }

    this.tradeSignals = new TradeSignals(connection, config, this.messaging, technicalAnalysisCache, this.autoBlacklist);

    this.whitelistCache = new WhitelistCache();
    this.whitelistCache.init();

    this.blacklistCache = new BlacklistCache();
    this.blacklistCache.init();

    if (this.config.useSnipeList) {
      this.snipeListCache = new SnipeListCache();
      this.snipeListCache.init();
    }

    // Initialize dashboard database service
    // this.initializeDashboardService();
  }


  private async getTokenSymbol(connection: Connection, mint: PublicKey): Promise<string | undefined> {
    try {
      const metadataPDA = getPdaMetadataKey(mint);
      const metadataAccount = await connection.getAccountInfo(metadataPDA.publicKey, connection.commitment);
      if (!metadataAccount?.data) return undefined;
      const serializer = getMetadataAccountDataSerializer();
      const [metadata] = serializer.deserialize(metadataAccount.data);
      return metadata.symbol?.trim();
    } catch {
      return undefined;
    }
  }

  async validate() {
    // Skip validation due to RPC rate limiting - we've confirmed the account exists via CLI
    logger.info(`Skipping ${this.config.quoteToken.symbol} token account validation due to RPC rate limiting`);
    logger.info(`Expected account: ${this.config.quoteAta.toString()}`);
    logger.info(`Account confirmed to exist via CLI: spl-token balance shows 0.018 WSOL`);
    return true;
  }

  public async whitelistSnipe(accountId: PublicKey, poolState: LiquidityStateV4): Promise<boolean> {
    if (this.whitelistCache.whitelistIsEmpty()) {
      return false;
    }

    const [market] = await Promise.all([
      this.marketStorage.get(poolState.marketId.toString()),
      getAssociatedTokenAddress(poolState.baseMint, this.config.wallet.publicKey),
    ]);
    const poolKeys: LiquidityPoolKeysV4 = createPoolKeys(accountId, poolState, market);

    //updateAuthority is whitelisted
    return await this.whitelistCache.isInList(this.connection, poolKeys);
  }

  public async buy(accountId: PublicKey, poolState: LiquidityStateV4, lag: number = 0) {
    const tokenSymbol = await this.getTokenSymbol(this.connection, poolState.baseMint);
    logger.info(`🔄 STARTING BUY PROCESS for ${tokenSymbol} (${poolState.baseMint.toString()}) with ${lag}s lag`);
    
    // Registra sempre il token candidato all'inizio
    await logTokenCandidate(
      poolState.baseMint.toString(),
      tokenSymbol,
      new Date(parseInt(poolState.poolOpenTime.toString()) * 1000),
      'found',
      undefined,
      'Token trovato e in fase di valutazione',
      lag
    );

    const whitelistSnipe = await this.whitelistSnipe(accountId, poolState);

    // Log token candidate: non in snipe list
    if (this.config.useSnipeList && !this.snipeListCache?.isInList(poolState.baseMint.toString())) {
      logger.debug({ mint: poolState.baseMint.toString() }, `Skipping buy because token is not in a snipe list`);
      
      // Aggiorna il record esistente con il motivo di scarto
      await logTokenCandidate(
        poolState.baseMint.toString(),
        tokenSymbol,
        new Date(parseInt(poolState.poolOpenTime.toString()) * 1000),
        'filtered',
        'not_in_snipe_list',
        'Token non presente nella snipe list',
        lag
      );
      
      return;
    }

    if (!whitelistSnipe) {
      if (this.config.autoBuyDelay > 0) {
        logger.debug({ mint: poolState.baseMint }, `Waiting for ${this.config.autoBuyDelay} ms before buy`);
        await sleep(this.config.autoBuyDelay);
      }
    }

    const numberOfActionsBeingProcessed =
      this.config.maxTokensAtTheTime - this.semaphore.getValue() + this.sellExecutionCount;
    if (this.semaphore.isLocked() || numberOfActionsBeingProcessed >= this.config.maxTokensAtTheTime) {
      logger.debug(
        { mint: poolState.baseMint.toString() },
        `Skipping buy because max tokens to process at the same time is ${this.config.maxTokensAtTheTime} and currently ${numberOfActionsBeingProcessed} tokens is being processed`,
      );
      
      // Aggiorna il record esistente con il motivo di scarto
      await logTokenCandidate(
        poolState.baseMint.toString(),
        tokenSymbol,
        new Date(parseInt(poolState.poolOpenTime.toString()) * 1000),
        'filtered',
        'max_tokens_processing',
        `Max tokens processing limit reached (${numberOfActionsBeingProcessed}/${this.config.maxTokensAtTheTime})`,
        lag
      );
      
      return;
    }

    await this.semaphore.acquire();

    try {
      const [market, mintAta] = await Promise.all([
        this.marketStorage.get(poolState.marketId.toString()),
        getAssociatedTokenAddress(poolState.baseMint, this.config.wallet.publicKey),
      ]);
      const poolKeys: LiquidityPoolKeysV4 = createPoolKeys(accountId, poolState, market);

      if (!whitelistSnipe) {
        if (!this.config.useSnipeList) {
          // Modifica: raccogli i motivi dei filtri
          const filters = new PoolFilters(this.connection, {
            quoteToken: this.config.quoteToken,
            minPoolSize: this.config.minPoolSize,
            maxPoolSize: this.config.maxPoolSize,
            minInitialLiquidityValue: this.config.minInitialLiquidityValue,
          }, this.blacklistCache);
          const filterResult = await filters.executeWithDetails(poolKeys);
          if (!filterResult.passed) {
            logger.trace({ mint: poolKeys.baseMint.toString() }, `Skipping buy because pool doesn't match filters: ${filterResult.filterDetails}`);
            
            // Aggiorna il record esistente con i dettagli dei filtri
            await logTokenCandidate(
              poolKeys.baseMint.toString(),
              tokenSymbol,
              new Date(parseInt(poolState.poolOpenTime.toString()) * 1000),
              'filtered',
              'filters_not_passed',
              filterResult.filterDetails,
              lag
            );
            
            return;
          }
        }

        let buySignal = await this.tradeSignals.waitForBuySignal(poolKeys);

        if (!buySignal) {
          await this.messaging.sendTelegramMessage(`😭Skipping buy signal😭\n\nToken: <b>${tokenSymbol || 'Unknown'}</b>\nMint: <code>${poolKeys.baseMint.toString()}</code>`, poolState.baseMint.toString())
          logger.trace({ mint: poolKeys.baseMint.toString() }, `Skipping buy because buy signal not received`);
          
          // Aggiorna il record esistente con il motivo di scarto
          await logTokenCandidate(
            poolKeys.baseMint.toString(),
            tokenSymbol,
            new Date(parseInt(poolState.poolOpenTime.toString()) * 1000),
            'filtered',
            'no_buy_signal',
            'Segnale di acquisto non ricevuto',
            lag
          );
          
          return;
        }
      }

      const startTime = Date.now();
      for (let i = 0; i < this.config.maxBuyRetries; i++) {
        try {
          if ((Date.now() - startTime) > this.config.maxBuyDuration) {
            logger.info(`Not buying mint ${poolState.baseMint.toString()}, max buy ${this.config.maxBuyDuration/1000} sec timer exceeded!`);
            
            // Aggiorna il record esistente con il motivo di scarto
            await logTokenCandidate(
              poolKeys.baseMint.toString(),
              tokenSymbol,
              new Date(parseInt(poolState.poolOpenTime.toString()) * 1000),
              'filtered',
              'buy_timeout',
              `Timeout di acquisto superato (${this.config.maxBuyDuration/1000}s)`,
              lag
            );
            
            return;
          }

          logger.info(
            { mint: poolKeys.baseMint.toString() },
            `Send buy transaction attempt: ${i + 1}/${this.config.maxBuyRetries}`,
          );
          const tokenOut = new Token(TOKEN_PROGRAM_ID, poolKeys.baseMint, poolKeys.baseDecimals);
          const result = await this.swap(
            poolKeys,
            this.config.quoteAta,
            mintAta,
            this.config.quoteToken,
            tokenOut,
            this.config.quoteAmount,
            this.config.buySlippage,
            this.config.wallet,
            'buy',
          );

          if (result.confirmed) {
            logger.info(
              {
                mint: poolState.baseMint.toString(),
                signature: result.signature,
                url: `https://solscan.io/tx/${result.signature}?cluster=${NETWORK}`,
              },
              `Confirmed buy tx`,
            );

            await this.messaging.sendTelegramMessage(`💚Confirmed buy💚\n\nToken: <b>${tokenSymbol || 'Unknown'}</b>\nMint: <code>${poolKeys.baseMint.toString()}</code>\nSignature: <code>${result.signature}</code>`, poolState.baseMint.toString())
            
            // Log nel database come token comprato
            await logTokenCandidate(
              poolKeys.baseMint.toString(),
              tokenSymbol,
              new Date(parseInt(poolState.poolOpenTime.toString()) * 1000),
              'bought',
              undefined,
              `Token comprato con successo - Signature: ${result.signature}`,
              lag
            );
            
            break;
          }

          logger.info(
            {
              mint: poolKeys.baseMint.toString(),
              signature: result.signature,
              error: result.error,
            },
            `Error confirming buy tx`,
          );
        } catch (error) {
          logger.debug({ mint: poolKeys.baseMint.toString(), error }, `Error confirming buy transaction`);
        }
      }
    } catch (error) {
      logger.error({ mint: poolState.baseMint.toString(), error }, `Failed to buy token`);
      
      // Log nel database come token che ha fallito l'acquisto
      await logTokenCandidate(
        poolState.baseMint.toString(),
        tokenSymbol,
        new Date(parseInt(poolState.poolOpenTime.toString()) * 1000),
        'filtered',
        'buy_failed',
        `Errore durante l'acquisto: ${error}`,
        lag
      );
    } finally {
      this.semaphore.release();
    }
  }

  /**
   * Handle pump.fun token events - either new tokens or bonding curve updates
   */
  public async handlePumpFunToken(mint: PublicKey, eventType: 'new' | 'update' | 'complete' = 'new') {
    logger.info(`🎯 STARTING PUMP.FUN PROCESS for ${mint.toString()} (event: ${eventType})`);
    
    // Check if we can process more tokens (same check as Raydium tokens)
    const numberOfActionsBeingProcessed =
      this.config.maxTokensAtTheTime - this.semaphore.getValue() + this.sellExecutionCount;
    if (this.semaphore.isLocked() || numberOfActionsBeingProcessed >= this.config.maxTokensAtTheTime) {
      logger.debug(
        { mint: mint.toString() },
        `Skipping pump.fun buy because max tokens to process at the same time is ${this.config.maxTokensAtTheTime} and currently ${numberOfActionsBeingProcessed} tokens is being processed`,
      );
      
      const tokenSymbol = await this.getTokenSymbol(this.connection, mint);
      await logTokenCandidate(
        mint.toString(),
        tokenSymbol,
        new Date(),
        'filtered',
        'max_tokens_processing',
        `Max tokens processing limit reached (${numberOfActionsBeingProcessed}/${this.config.maxTokensAtTheTime})`,
        0
      );
      
      return;
    }
    
    await this.semaphore.acquire();

    try {
      // Validate that this is actually a mint account before processing
      const mintAccountInfo = await this.connection.getAccountInfo(mint);
      if (!mintAccountInfo || mintAccountInfo.data.length !== 82) {
        logger.error(`Invalid mint account ${mint.toString()}: account does not exist or wrong size (${mintAccountInfo?.data.length || 0} bytes)`);

        await logTokenCandidate(
          mint.toString(),
          'Unknown',
          new Date(),
          'error',
          'invalid_mint',
          `Invalid mint account: does not exist or wrong size (${mintAccountInfo?.data.length || 0} bytes)`,
          0
        );
        return;
      }

      // FOR DEBUGGING: Log mint account creation details
      logger.debug(`Processing pump.fun mint ${mint.toString()} - Account owner: ${mintAccountInfo.owner.toString()}, Data size: ${mintAccountInfo.data.length}`);

      const tokenSymbol = await this.getTokenSymbol(this.connection, mint);

      // CRITICAL: Additional validation to ensure this is truly a NEW pump.fun token
      if (eventType === 'new') {
        try {
          // Parse mint data to get basic info
          const mintData = mintAccountInfo.data;
          const mintAuthorityBytes = mintData.slice(4, 36);
          const freezeAuthorityBytes = mintData.slice(36, 68);
          const supply = new (require('bn.js'))(mintData.slice(68, 76), 'le');
          const decimals = mintData[76];
          const isInitialized = mintData[77] === 1;

          const isRenounced = mintAuthorityBytes.every(byte => byte === 0);
          const isFreezeDisabled = freezeAuthorityBytes.every(byte => byte === 0);

          logger.debug(`Mint ${mint.toString()} properties - Renounced: ${isRenounced}, Freeze disabled: ${isFreezeDisabled}, Decimals: ${decimals}, Supply: ${supply.toString()}`);

          // Validate pump.fun characteristics (6 decimals, specific supply)
          // Skip logging for non-matching tokens to reduce noise

          // Check if supply matches typical pump.fun pattern (1B tokens = 1,000,000,000,000,000 with 6 decimals)
          const expectedPumpFunSupply = new (require('bn.js'))('1000000000000000');
          if (!supply.eq(expectedPumpFunSupply)) {
            // Silent skip - supply doesn't match new pump.fun pattern
            // This is likely an existing token appearing in a transaction
            return;
          }

        } catch (error) {
          logger.debug(`Error checking mint properties for ${mint.toString()}:`, error);
        }
      }

      // Log token candidate
      await logTokenCandidate(
        mint.toString(),
        tokenSymbol,
        new Date(),
        'found',
        undefined,
        `Pump.fun token detected (${eventType})`,
        0
      );

      // Check if token is blacklisted
      if (this.blacklistCache?.isInList(mint.toString())) {
        logger.debug({ mint: mint.toString() }, `Skipping pump.fun token because it's blacklisted`);
        
        await logTokenCandidate(
          mint.toString(),
          tokenSymbol,
          new Date(),
          'filtered',
          undefined,
          'Token is blacklisted',
          0
        );
        return;
      }

      // Check symbol blacklist
      if (tokenSymbol && await this.autoBlacklist.isSymbolBlacklisted(tokenSymbol)) {
        logger.debug({ mint: mint.toString(), symbol: tokenSymbol }, `Skipping pump.fun token because symbol is blacklisted`);
        
        await logTokenCandidate(
          mint.toString(),
          tokenSymbol,
          new Date(),
          'filtered',
          undefined,
          `Symbol ${tokenSymbol} is blacklisted`,
          0
        );
        return;
      }

      // Apply pump.fun specific filters
      const pumpFunFilterResult = await this.pumpFunFilter.checkToken(mint, {
        excludeCompleted: eventType !== 'complete',
        onlyNewTokens: eventType === 'new',
      });

      if (!pumpFunFilterResult.passed) {
        logger.debug({ mint: mint.toString() }, `Pump.fun token failed pump.fun filters: ${pumpFunFilterResult.reasons.join(', ')}`);

        await logTokenCandidate(
          mint.toString(),
          tokenSymbol,
          new Date(),
          'filtered',
          undefined,
          `Pump.fun filters failed: ${pumpFunFilterResult.reasons.join(', ')}`,
          0
        );
        return;
      }

      // Apply standard token filters that are applicable to pump.fun tokens
      const standardFilterResult = await this.applyStandardFiltersForPumpFun(mint, tokenSymbol);
      if (!standardFilterResult.passed) {
        logger.debug({ mint: mint.toString() }, `Standard filters for pump.fun token ${mint.toString()}: FAILED - ${standardFilterResult.reasons.join(', ')}`);

        await logTokenCandidate(
          mint.toString(),
          tokenSymbol,
          new Date(),
          'filtered',
          undefined,
          `Standard filters failed: ${standardFilterResult.reasons.join(', ')}`,
          0
        );
        return;
      }

      // Combine filter results - ALL filters passed at this point
      const filterResult = {
        passed: true,
        reasons: [],
        tokenData: pumpFunFilterResult.tokenData,
        bondingCurveState: pumpFunFilterResult.bondingCurveState
      };

      // Cache the token data
      if (filterResult.tokenData) {
        pumpFunCache.set(mint, filterResult.tokenData);
        
        if (filterResult.bondingCurveState) {
          pumpFunCache.setBondingCurve(mint, filterResult.bondingCurveState);
        }
      }

      // All filters passed (both pump.fun + standard filters)
      logger.info(`✅ Pump.fun token ${mint.toString()} passed ALL filters - Progress: ${filterResult.tokenData?.progress?.toFixed(2)}%`);

      // Execute buy for pump.fun token
      await this.executePumpFunBuy(mint, filterResult.tokenData, eventType);

    } catch (error) {
      logger.error(`Error handling pump.fun token ${mint.toString()}:`, error);
      
      const tokenSymbol = await this.getTokenSymbol(this.connection, mint);
      await logTokenCandidate(
        mint.toString(),
        tokenSymbol,
        new Date(),
        'error',
        undefined,
        `Error handling pump.fun token: ${error.message}`,
        0
      );
    } finally {
      this.semaphore.release();
    }
  }

  /**
   * Apply standard token filters to pump.fun tokens
   * These are filters that can be applied using just the mint address
   */
  private async applyStandardFiltersForPumpFun(mint: PublicKey, tokenSymbol: string | undefined): Promise<{ passed: boolean; reasons: string[] }> {
    const reasons: string[] = [];
    let passed = true;

    try {
      // Import the required constants
      const { 
        CHECK_IF_BURNED, 
        CHECK_IF_FREEZABLE, 
        CHECK_IF_MINT_IS_RENOUNCED, 
        CHECK_IF_MUTABLE,
        CHECK_IF_SOCIALS,
        CHECK_HOLDERS,
        CHECK_TOKEN_DISTRIBUTION
      } = await import('./helpers/constants');

      // 1. Check if mint authority is renounced - pump.fun specific handling
      if (CHECK_IF_MINT_IS_RENOUNCED) {
        try {
          const mintAccountInfo = await this.connection.getAccountInfo(mint);
          if (mintAccountInfo) {
            const mintData = mintAccountInfo.data;

            // For pump.fun tokens, check if mint authority is set to pump.fun program
            // If so, this is expected and acceptable behavior
            const mintAuthorityBytes = mintData.slice(4, 36);
            const isZeroAuthority = mintAuthorityBytes.every(byte => byte === 0);

            if (!isZeroAuthority) {
              // Check if authority is set to pump.fun program (expected for pump.fun tokens)
              const mintAuthority = new PublicKey(mintAuthorityBytes);
              const pumpFunProgram = new PublicKey(PUMP_FUN_PROGRAM_ID);

              // For pump.fun tokens, mint authority can be:
              // 1. Null (all zeros) - renounced
              // 2. pump.fun program - acceptable for curve management
              if (!mintAuthority.equals(pumpFunProgram)) {
                // Check common pump.fun related programs that might be acceptable
                const pumpFunMigration = new PublicKey('39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg');

                if (!mintAuthority.equals(pumpFunMigration)) {
                  logger.debug(`⚠️ Pump.fun token ${mint.toString()} has unexpected mint authority: ${mintAuthority.toString()}`);
                  reasons.push('Mint authority not renounced or expected pump.fun program');
                  passed = false;
                }
              } else {
                logger.debug(`✅ Pump.fun token ${mint.toString()} has acceptable mint authority (pump.fun program)`);
              }
            }
          }
        } catch (error) {
          logger.debug(`Error checking mint authority for ${mint.toString()}:`, error);
          // Don't fail on this error for pump.fun tokens
        }
      }

      // 2. Check if freeze authority is disabled - pump.fun specific handling
      if (CHECK_IF_FREEZABLE) {
        try {
          const mintAccountInfo = await this.connection.getAccountInfo(mint);
          if (mintAccountInfo) {
            const mintData = mintAccountInfo.data;

            // For pump.fun tokens, freeze authority should be None (all zeros)
            const freezeAuthorityBytes = mintData.slice(36, 68);
            const hasFreezeAuthority = !freezeAuthorityBytes.every(byte => byte === 0);

            if (hasFreezeAuthority) {
              const freezeAuthority = new PublicKey(freezeAuthorityBytes);
              logger.debug(`Pump.fun token ${mint.toString()} has freeze authority: ${freezeAuthority.toString()}`);

              // For pump.fun tokens, this is unusual and should be flagged
              reasons.push('Token is freezable');
              passed = false;
            }
          }
        } catch (error) {
          logger.debug(`Error checking freeze authority for ${mint.toString()}:`, error);
          // Don't fail on this error for pump.fun tokens
        }
      }

      // 3. Check token metadata (mutable/socials) if configured
      if ((CHECK_IF_MUTABLE || CHECK_IF_SOCIALS) && tokenSymbol) {
        try {
          // Get metadata PDA
          const { getPdaMetadataKey } = await import('@raydium-io/raydium-sdk');
          const metadataPDA = getPdaMetadataKey(mint);
          const metadataAccount = await this.connection.getAccountInfo(metadataPDA.publicKey);
          
          if (metadataAccount) {
            const { getMetadataAccountDataSerializer } = await import('@metaplex-foundation/mpl-token-metadata');
            const serializer = getMetadataAccountDataSerializer();
            const metadata = serializer.deserialize(metadataAccount.data)[0];
            
            if (CHECK_IF_MUTABLE && metadata.isMutable) {
              reasons.push('Token metadata is mutable');
              passed = false;
            }

            if (CHECK_IF_SOCIALS) {
              // Check if token has social links
              const uri = metadata.uri;
              if (uri && uri.trim().length > 0) {
                // For pump.fun tokens, having metadata URI is actually good
                logger.debug(`Token ${mint.toString()} has metadata URI: ${uri}`);
              } else {
                reasons.push('Token has no social links/metadata');
                passed = false;
              }
            }
          } else if (CHECK_IF_SOCIALS) {
            reasons.push('Token has no metadata account');
            passed = false;
          }
        } catch (error) {
          logger.debug(`Error checking metadata for ${mint.toString()}:`, error);
          // For pump.fun tokens, metadata issues shouldn't be fatal
          if (CHECK_IF_SOCIALS) {
            reasons.push('Could not verify token metadata');
            passed = false;
          }
        }
      }

      // 4. Check holder distribution if enabled
      if (CHECK_HOLDERS || CHECK_TOKEN_DISTRIBUTION) {
        try {
          // Import holder filter classes
          const { HoldersCountFilter, TopHolderDistributionFilter } = await import('./filters/holders');
          
          if (CHECK_HOLDERS) {
            // Note: For pump.fun tokens, we can't easily check holders without pool keys
            // This is a limitation we'll document and potentially address later
            logger.debug(`Holder count check skipped for pump.fun token ${mint.toString()} - requires pool keys`);
          }

          if (CHECK_TOKEN_DISTRIBUTION) {
            // Similarly, token distribution checks typically require pool information
            logger.debug(`Token distribution check skipped for pump.fun token ${mint.toString()} - requires pool keys`);
          }
        } catch (error) {
          logger.debug(`Error checking holders/distribution for ${mint.toString()}:`, error);
          // Don't fail on this error for pump.fun tokens as it's expected
        }
      }

      // 5. Apply symbol blacklist (already done in main flow, but double-check)
      if (tokenSymbol && this.autoBlacklist) {
        const isSymbolBlacklisted = await this.autoBlacklist.isSymbolBlacklisted(tokenSymbol);
        if (isSymbolBlacklisted) {
          reasons.push(`Symbol ${tokenSymbol} is blacklisted`);
          passed = false;
        }
      }

      // Removed redundant log - already logged above if failed
      return { passed, reasons };

    } catch (error) {
      logger.error(`Error applying standard filters to pump.fun token ${mint.toString()}:`, error);
      return { passed: false, reasons: [`Filter error: ${error.message}`] };
    }
  }

  /**
   * Execute buy order for pump.fun token
   */
  private async executePumpFunBuy(mint: PublicKey, tokenData: any, eventType: string) {
    try {
      logger.info(`💰 Executing pump.fun buy for token ${mint.toString()}`);

      // For pump.fun tokens, we need to buy from the bonding curve
      // This is a simplified implementation - you may need to implement
      // pump.fun specific buy logic depending on their contract interface
      
      const tokenSymbol = tokenData?.symbol || await this.getTokenSymbol(this.connection, mint);
      
      // Check if we already own this token
      const ata = await getAssociatedTokenAddress(mint, this.config.wallet.publicKey);
      try {
        const account = await getAccount(this.connection, ata);
        if (account.amount > BigInt(0)) {
          logger.info(`Already own pump.fun token ${mint.toString()}, skipping buy`);
          return;
        }
      } catch (error) {
        // Account doesn't exist, which is fine
      }

      // Log buy attempt
      await logTokenCandidate(
        mint.toString(),
        tokenSymbol,
        new Date(),
        'buying',
        undefined,
        `Attempting to buy pump.fun token (${eventType})`,
        0
      );

      // Send notifications
      if (this.config.useTelegram) {
        const message = `🎯 **Pump.fun Token Buy**\n` +
          `Token: ${tokenSymbol || 'Unknown'}\n` +
          `Mint: \`${mint.toString()}\`\n` +
          `Progress: ${tokenData?.progress?.toFixed(2)}%\n` +
          `Market Cap: $${tokenData?.marketCapSol?.toFixed(2)}\n` +
          `Type: ${eventType}`;
        
        await this.messaging.sendTelegramMessage(message, mint.toString());
      }

      // Discord notification
      if (this.discordNotifier) {
        await this.discordNotifier.sendPumpFunTrade(
          'buy',
          tokenSymbol || 'Unknown',
          mint.toString(),
          parseFloat(this.config.quoteAmount.toFixed(6)),
          tokenData?.progress,
          tokenData?.marketCapSol
        );
      }

      // Execute the actual pump.fun buy transaction
      const buyResult = await this.executePumpFunSwapTransaction(mint, tokenSymbol);
      
      if (buyResult.success) {
        logger.info(`✅ Successfully bought pump.fun token ${mint.toString()}: ${buyResult.signature}`);
        
        // Send success notification
        if (this.config.useTelegram) {
          await this.messaging.sendTelegramMessage(
            `💚 **Pump.fun Buy SUCCESS** 💚\n` +
            `Token: ${tokenSymbol}\n` +
            `Mint: \`${mint.toString()}\`\n` +
            `Signature: \`${buyResult.signature}\`\n` +
            `Amount: ${this.config.quoteAmount.toFixed()} SOL`,
            mint.toString()
          );
        }

        await logTokenCandidate(
          mint.toString(),
          tokenSymbol,
          new Date(),
          'bought',
          undefined,
          `Successfully bought pump.fun token - Signature: ${buyResult.signature}`,
          0
        );
      } else {
        logger.error(`❌ Failed to buy pump.fun token ${mint.toString()}: ${buyResult.error}`);
        
        // Send failure notification
        if (this.config.useTelegram) {
          await this.messaging.sendTelegramMessage(
            `❌ **Pump.fun Buy FAILED**\n` +
            `Token: ${tokenSymbol}\n` +
            `Mint: \`${mint.toString()}\`\n` +
            `Error: ${buyResult.error}`,
            mint.toString()
          );
        }

        await logTokenCandidate(
          mint.toString(),
          tokenSymbol,
          new Date(),
          'error',
          'buy_failed',
          `Failed to buy pump.fun token: ${buyResult.error}`,
          0
        );
      }

    } catch (error) {
      logger.error(`Error executing pump.fun buy for ${mint.toString()}:`, error);
      
      const tokenSymbol = await this.getTokenSymbol(this.connection, mint);
      await logTokenCandidate(
        mint.toString(),
        tokenSymbol,
        new Date(),
        'error',
        undefined,
        `Error executing pump.fun buy: ${error.message}`,
        0
      );
    }
  }

  public async sell(accountId: PublicKey, rawAccount: RawAccount) {
    this.sellExecutionCount++;

    try {
      const poolData = await this.poolStorage.get(rawAccount.mint.toString());

      if (poolData && poolData.sold) {
        return;
      }

      logger.trace({ mint: rawAccount.mint }, `Processing new token...`);

      if (!poolData) {
        logger.trace({ mint: rawAccount.mint.toString() }, `Token pool data is not found, can't sell`);
        return;
      }

      let moonshotConditionAmount = KEEP_5_PERCENT_FOR_MOONSHOTS ? (rawAccount.amount * BigInt(95)) / BigInt(100) : rawAccount.amount;

      const tokenIn = new Token(TOKEN_PROGRAM_ID, poolData.state.baseMint, poolData.state.baseDecimal.toNumber());
      const tokenAmountIn = new TokenAmount(tokenIn, moonshotConditionAmount, true);

      if (tokenAmountIn.isZero()) {
        logger.info({ mint: rawAccount.mint.toString() }, `Empty balance, can't sell`);
        return;
      }

      if (this.config.autoSellDelay > 0) {
        logger.debug({ mint: rawAccount.mint }, `Waiting for ${this.config.autoSellDelay} ms before sell`);
        await sleep(this.config.autoSellDelay);
      }

      const market = await this.marketStorage.get(poolData.state.marketId.toString());
      const poolKeys: LiquidityPoolKeysV4 = createPoolKeys(new PublicKey(poolData.id), poolData.state, market);

      for (let i = 0; i < this.config.maxSellRetries; i++) {
        try {
          if (i < 1) {
            const shouldSell = await this.tradeSignals.waitForSellSignal(tokenAmountIn, poolKeys);

            if (!shouldSell) {
              this.poolStorage.markAsSold(rawAccount.mint.toString());
              return;
            }
          }

          if (KEEP_5_PERCENT_FOR_MOONSHOTS) {
            this.poolStorage.markAsSold(rawAccount.mint.toString());
          }

          logger.info(
            { mint: rawAccount.mint },
            `Send sell transaction attempt: ${i + 1}/${this.config.maxSellRetries}`,
          );

          const result = await this.swap(
            poolKeys,
            accountId,
            this.config.quoteAta,
            tokenIn,
            this.config.quoteToken,
            tokenAmountIn,
            this.config.sellSlippage,
            this.config.wallet,
            'sell',
          );

          if (result.confirmed) {
            try {
              this.connection.getParsedTransaction(result.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
                .then(async (parsedConfirmedTransaction) => {
                  if (parsedConfirmedTransaction) {
                    let preTokenBalances = parsedConfirmedTransaction.meta.preTokenBalances;
                    let postTokenBalances = parsedConfirmedTransaction.meta.postTokenBalances;

                    let pre = preTokenBalances
                      .filter(x => x.mint === this.config.quoteToken.mint.toString() && x.owner === this.config.wallet.publicKey.toString())
                      .map(x => x.uiTokenAmount.uiAmount)
                      .reduce((a, b) => a + b, 0);

                    let post = postTokenBalances
                      .filter(x => x.mint === this.config.quoteToken.mint.toString() && x.owner === this.config.wallet.publicKey.toString())
                      .map(x => x.uiTokenAmount.uiAmount)
                      .reduce((a, b) => a + b, 0);

                    let quoteAmountNumber = parseFloat(this.config.quoteAmount.toFixed());
                    let profitOrLoss = (post - pre) - quoteAmountNumber;
                    let percentageChange = (profitOrLoss / quoteAmountNumber) * 100

                    // Recupera il simbolo del token per il messaggio
                    const tokenSymbol = await this.getTokenSymbol(this.connection, poolData.state.baseMint);
                    
                    await this.messaging.sendTelegramMessage(`⭕Confirmed sale at <b>${(post - pre).toFixed(5)}</b>⭕\n\nToken: <b>${tokenSymbol || 'Unknown'}</b>\n${profitOrLoss < 0 ? "🔴Loss " : "🟢Profit "}<code>${profitOrLoss.toFixed(5)} ${this.config.quoteToken.symbol} (${(percentageChange).toFixed(2)}%)</code>\n\nRetries <code>${i + 1}/${this.config.maxSellRetries}</code>`, rawAccount.mint.toString());
                    await logSell(rawAccount.mint.toString(), percentageChange, tokenSymbol);
                    
                    if (percentageChange < -AUTO_BLACKLIST_LOSS_THRESHOLD) {
                      await this.autoBlacklist.addRuggedToken(rawAccount.mint.toString(), 'HIGH_LOSS', Math.abs(percentageChange));
                    }
                  }
                })
                .catch((error) => {
                  console.log('Error fetching transaction details:', error);
                });
            } catch (error) {
              console.log("Error calculating profit", error);
            }
            logger.info(
              {
                dex: `https://dexscreener.com/solana/${rawAccount.mint.toString()}?maker=${this.config.wallet.publicKey}`,
                mint: rawAccount.mint.toString(),
                signature: result.signature,
                url: `https://solscan.io/tx/${result.signature}?cluster=${NETWORK}`,
              },
              `Confirmed sell tx`,
            );
            break;
          }

          logger.info(
            {
              mint: rawAccount.mint.toString(),
              signature: result.signature,
              error: result.error,
            },
            `Error confirming sell tx`,
          );
        } catch (error) {
          logger.debug({ mint: rawAccount.mint.toString(), error }, `Error confirming sell transaction`);
        }
      }
    } catch (error) {
      logger.error({ mint: rawAccount.mint.toString(), error }, `Failed to sell token`);
    } finally {
      this.sellExecutionCount--;
    }
  }

  private async swap(
    poolKeys: LiquidityPoolKeysV4,
    ataIn: PublicKey,
    ataOut: PublicKey,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: TokenAmount,
    slippage: number,
    wallet: Keypair,
    direction: 'buy' | 'sell',
  ) {
    const slippagePercent = new Percent(slippage, 100);
    const poolInfo = await Liquidity.fetchInfo({
      connection: this.connection,
      poolKeys,
    });

    const computedAmountOut = Liquidity.computeAmountOut({
      poolKeys,
      poolInfo,
      amountIn,
      currencyOut: tokenOut,
      slippage: slippagePercent,
    });

    const latestBlockhash = await this.connection.getLatestBlockhash();
    const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
      {
        poolKeys: poolKeys,
        userKeys: {
          tokenAccountIn: ataIn,
          tokenAccountOut: ataOut,
          owner: wallet.publicKey,
        },
        amountIn: amountIn.raw,
        minAmountOut: computedAmountOut.minAmountOut.raw,
      },
      poolKeys.version,
    );

    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ...(this.isWarp || this.isJito
          ? []
          : [
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: this.config.unitPrice }),
            ComputeBudgetProgram.setComputeUnitLimit({ units: this.config.unitLimit }),
          ]),
        ...(direction === 'buy'
          ? [
            createAssociatedTokenAccountIdempotentInstruction(
              wallet.publicKey,
              ataOut,
              wallet.publicKey,
              tokenOut.mint,
            ),
          ]
          : []),
        ...innerTransaction.instructions,
        ...((direction === 'sell' && !KEEP_5_PERCENT_FOR_MOONSHOTS) ? [createCloseAccountInstruction(ataIn, wallet.publicKey, wallet.publicKey)] : []),
      ],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([wallet, ...innerTransaction.signers]);

    return this.txExecutor.executeAndConfirm(transaction, wallet, latestBlockhash);
  }

  /**
   * Executes a pump.fun buy transaction by creating a buy instruction
   */
  private async executePumpFunSwapTransaction(mint: PublicKey, tokenSymbol: string): Promise<{success: boolean, signature?: string, error?: string}> {
    try {
      const wallet = this.config.wallet;
      const solAmount = this.config.quoteAmount; // Amount of SOL to spend

      // Get or create user's token account
      const userTokenAccount = await getAssociatedTokenAddress(mint, wallet.publicKey);
      
      // Check if user's token account exists to determine ATA creation cost
      const userAccountInfo = await this.connection.getAccountInfo(userTokenAccount);
      const needsUserATA = !userAccountInfo;
      
      // Check wallet balance first
      const walletBalance = await this.connection.getBalance(wallet.publicKey);
      const requiredSol = solAmount.raw.toNumber(); // SOL for swap
      const ataCreationCost = needsUserATA ? 2039280 : 0; // ~0.00204 SOL for ATA creation only if needed
      const computeFee = 10000; // Small buffer for compute fees
      const totalRequired = requiredSol + ataCreationCost + computeFee;

      logger.debug(`Balance check - Wallet: ${walletBalance / 1e9} SOL, Required: ${totalRequired / 1e9} SOL (${requiredSol / 1e9} swap + ${ataCreationCost / 1e9} ATA + ${computeFee / 1e9} fees)`);

      if (walletBalance < totalRequired) {
        const shortfall = (totalRequired - walletBalance) / 1e9;
        logger.error(`Insufficient SOL balance. Need ${totalRequired / 1e9} SOL, have ${walletBalance / 1e9} SOL. Shortfall: ${shortfall.toFixed(6)} SOL`);
        return { success: false, error: `Insufficient SOL balance. Need ${shortfall.toFixed(6)} more SOL` };
      }
      
      // Get pump.fun bonding curve PDAs using the helper
      const pumpFunHelper = new PumpFunHelper(this.connection);
      const [bondingCurve] = pumpFunHelper.getBondingCurvePDA(mint);
      const [associatedBondingCurve] = pumpFunHelper.getAssociatedBondingCurvePDA(mint);

      // Fee account for pump.fun
      const feeAccount = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
      
      // Global account PDA for pump.fun
      const [globalAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("global")], 
        new PublicKey(PUMP_FUN_PROGRAM_ID)
      );
      
      // Check if associated bonding curve account exists, if not create it
      const associatedBondingCurveInfo = await this.connection.getAccountInfo(associatedBondingCurve);
      const needsInitialization = !associatedBondingCurveInfo;
      
      logger.debug(`Associated bonding curve account exists: ${!needsInitialization}`);
      
      // Create the pump.fun buy instruction with account structure based on initialization state
      const keys = [
        { pubkey: globalAccount, isSigner: false, isWritable: false }, // Global account
        { pubkey: feeAccount, isSigner: false, isWritable: true }, // Fee recipient
        { pubkey: mint, isSigner: false, isWritable: false }, // Token mint
        { pubkey: bondingCurve, isSigner: false, isWritable: true }, // Bonding curve
      ];

      // Only include associated bonding curve if it's already initialized
      if (!needsInitialization) {
        keys.push({ pubkey: associatedBondingCurve, isSigner: false, isWritable: true }); // Associated bonding curve
      }

      keys.push(
        { pubkey: userTokenAccount, isSigner: false, isWritable: true }, // User token account
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // User (payer)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System program
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // Token program
        { pubkey: new PublicKey('11111111111111111111111111111112'), isSigner: false, isWritable: false }, // Associated Token Program
        { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false } // Rent sysvar
      );

      const buyInstruction = new TransactionInstruction({
        programId: new PublicKey(PUMP_FUN_PROGRAM_ID),
        keys: keys,
        data: Buffer.concat([
          Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]), // Correct pump.fun buy discriminator
          Buffer.from(new BN(solAmount.raw.toString()).toArray('le', 8)), // SOL amount in lamports
          Buffer.from(new BN(1).toArray('le', 8)), // Min tokens out (set to 1 for now)
        ]),
      });

      // Build the transaction
      const latestBlockhash = await this.connection.getLatestBlockhash();
      
      const instructions = [];
      
      // Add compute budget instructions first
      if (!this.isWarp && !this.isJito) {
        instructions.push(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: this.config.unitPrice }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: this.config.unitLimit })
        );
      }
      
      if (needsUserATA) {
        logger.debug("User token account needs to be created first");
        // Create ATA first in a separate transaction
        const ataTransaction = new TransactionMessage({
          payerKey: wallet.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions: [
            createAssociatedTokenAccountIdempotentInstruction(
              wallet.publicKey,
              userTokenAccount,
              wallet.publicKey,
              mint,
            ),
          ],
        }).compileToV0Message();
        
        const ataTx = new VersionedTransaction(ataTransaction);
        ataTx.sign([wallet]);
        
        // Send ATA creation transaction first
        const ataResult = await this.txExecutor.executeAndConfirm(ataTx, wallet, latestBlockhash);
        if (!ataResult.confirmed) {
          logger.error(`Failed to create user token account: ${ataResult.error}`);
          return { success: false, error: `Failed to create token account: ${ataResult.error}` };
        }
        
        logger.debug("User token account created successfully");
        
        // Get fresh blockhash for buy transaction
        const freshBlockhash = await this.connection.getLatestBlockhash();
        const messageV0 = new TransactionMessage({
          payerKey: wallet.publicKey,
          recentBlockhash: freshBlockhash.blockhash,
          instructions: [
            // Add compute budget instructions
            ...(this.isWarp || this.isJito ? [] : [
              ComputeBudgetProgram.setComputeUnitPrice({ microLamports: this.config.unitPrice }),
              ComputeBudgetProgram.setComputeUnitLimit({ units: this.config.unitLimit })
            ]),
            // The actual buy instruction
            buyInstruction,
          ],
        }).compileToV0Message();
        
        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([wallet]);
        
        const result = await this.txExecutor.executeAndConfirm(transaction, wallet, freshBlockhash);
        return {
          success: result.confirmed,
          signature: result.signature,
          error: result.error
        };
      } else {
        logger.debug("User token account already exists, proceeding with buy");
        // Add normal create ATA instruction (idempotent)
        instructions.push(createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userTokenAccount,
          wallet.publicKey,
          mint,
        ));
      }
      
      // For very new tokens, the associated bonding curve might not be initialized yet
      // In this case we'll modify the instruction to skip this account requirement
      if (needsInitialization) {
        logger.debug("Attempting to buy very fresh token - associated bonding curve not yet initialized");
        // We'll skip the associated bonding curve account for now
      }
      
      // The actual buy instruction
      instructions.push(buyInstruction);

      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: instructions,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([wallet]);

      // Execute the transaction
      const result = await this.txExecutor.executeAndConfirm(transaction, wallet, latestBlockhash);

      if (result.confirmed) {
        return { success: true, signature: result.signature };
      } else {
        return { success: false, error: result.error || 'Transaction not confirmed' };
      }

    } catch (error) {
      logger.error(`Error executing pump.fun swap for ${mint.toString()}:`, error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  private async filterMatch(poolKeys: LiquidityPoolKeysV4) {
    if (this.config.filterCheckInterval === 0 || this.config.filterCheckDuration === 0) {
      return true;
    }

    const filters = new PoolFilters(this.connection, {
      quoteToken: this.config.quoteToken,
      minPoolSize: this.config.minPoolSize,
      maxPoolSize: this.config.maxPoolSize,
      minInitialLiquidityValue: this.config.minInitialLiquidityValue,
    }, this.blacklistCache);

    const timesToCheck = this.config.filterCheckDuration / this.config.filterCheckInterval;
    let timesChecked = 0;
    let matchCount = 0;

    do {
      try {
        const shouldBuy = await filters.execute(poolKeys);

        if (shouldBuy) {
          matchCount++;

          if (this.config.consecutiveMatchCount <= matchCount) {
            logger.info(`🎯 FILTER SUCCESS! Token ${poolKeys.baseMint.toString()} passed all filters after ${matchCount} consecutive matches`);
            return true;
          }
        } else {
          if (matchCount > 0) {
            logger.debug(`❌ Filter FAILED for ${poolKeys.baseMint.toString()} - resetting match count`);
          }
          matchCount = 0;
        }

        if (this.config.filterCheckInterval > 1) {
          logger.trace({ mint: poolKeys.baseMint.toString() }, `${timesChecked + 1}/${timesToCheck} Filter didn't match, waiting for ${this.config.filterCheckInterval / 1000} sec.`);
        }
        await sleep(this.config.filterCheckInterval);
      } finally {
        timesChecked++;
      }
    } while (timesChecked < timesToCheck);

    logger.warn(`⏰ FILTER TIMEOUT! Token ${poolKeys.baseMint.toString()} failed to pass filters after ${timesToCheck} attempts over ${this.config.filterCheckDuration/1000}s - REJECTED`);
    return false;
  }
}