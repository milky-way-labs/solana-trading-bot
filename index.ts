import { MarketCache, PoolCache } from './cache';
import { Listeners } from './listeners';
import { Connection, KeyedAccountInfo, Keypair, PublicKey } from '@solana/web3.js';
import { LIQUIDITY_STATE_LAYOUT_V4, MARKET_STATE_LAYOUT_V3, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { AccountLayout, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Bot, BotConfig } from './bot';
import { DefaultTransactionExecutor, TransactionExecutor } from './transactions';
import {
  AUTO_BUY_DELAY,
  AUTO_SELL,
  AUTO_SELL_DELAY,
  AUTO_SELL_WITHOUT_SELL_SIGNAL,
  BLACKLIST_REFRESH_INTERVAL,
  BUY_SIGNAL_FRACTION_TIME_TO_WAIT,
  BUY_SIGNAL_LOW_VOLUME_THRESHOLD,
  BUY_SIGNAL_PRICE_INTERVAL,
  BUY_SIGNAL_TIME_TO_WAIT,
  BUY_SLIPPAGE,
  CACHE_NEW_MARKETS,
  CHECK_ABNORMAL_DISTRIBUTION,
  CHECK_HOLDERS,
  CHECK_IF_BURNED,
  CHECK_IF_FREEZABLE,
  CHECK_IF_MINT_IS_RENOUNCED,
  CHECK_IF_MUTABLE,
  CHECK_IF_SOCIALS,
  CHECK_TOKEN_DISTRIBUTION,
  COMMITMENT_LEVEL,
  COMPUTE_UNIT_LIMIT,
  COMPUTE_UNIT_PRICE,
  CONSECUTIVE_FILTER_MATCHES,
  CUSTOM_FEE,
  FILTER_CHECK_DURATION,
  FILTER_CHECK_INTERVAL,
  getToken,
  getWallet,
  LOG_LEVEL,
  logger,
  MACD_LONG_PERIOD,
  MACD_SHORT_PERIOD,
  MACD_SIGNAL_PERIOD,
  MAX_BUY_DURATION,
  MAX_BUY_RETRIES,
  MAX_LAG,
  MAX_POOL_SIZE,
  MAX_SELL_RETRIES,
  MAX_TOKENS_AT_THE_TIME,
  MIN_INITIAL_LIQUIDITY_VALUE,
  MIN_POOL_SIZE,
  PRE_LOAD_EXISTING_MARKETS,
  PRICE_CHECK_DURATION,
  PRICE_CHECK_INTERVAL,
  PRIVATE_KEY,
  QUOTE_AMOUNT,
  QUOTE_MINT,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  RSI_PERIOD,
  SELL_SLIPPAGE,
  SKIP_SELLING_IF_LOST_MORE_THAN,
  SNIPE_LIST_REFRESH_INTERVAL,
  STOP_LOSS,
  TAKE_PROFIT,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TELEGRAM_THREAD_ID,
  TRAILING_STOP_LOSS,
  TRANSACTION_EXECUTOR,
  USE_SNIPE_LIST,
  USE_TA,
  USE_TELEGRAM,
  ENABLE_PUMP_FUN_LISTENER,
  PUMP_FUN_DETAILED_PARSING,
} from './helpers';
import { WarpTransactionExecutor } from './transactions/warp-transaction-executor';
import { JitoTransactionExecutor } from './transactions/jito-rpc-transaction-executor';
import { TechnicalAnalysisCache } from './cache/technical-analysis.cache';
import { logFind } from './db';

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  commitment: COMMITMENT_LEVEL,
});

function printDetails(wallet: Keypair, quoteToken: Token, bot: Bot) {
  logger.info(`  
                                        ..   :-===++++-     
                                .-==+++++++- =+++++++++-    
            ..:::--===+=.=:     .+++++++++++:=+++++++++:    
    .==+++++++++++++++=:+++:    .+++++++++++.=++++++++-.    
    .-+++++++++++++++=:=++++-   .+++++++++=:.=+++++-::-.    
     -:+++++++++++++=:+++++++-  .++++++++-:- =+++++=-:      
      -:++++++=++++=:++++=++++= .++++++++++- =+++++:        
       -:++++-:=++=:++++=:-+++++:+++++====--:::::::.        
        ::=+-:::==:=+++=::-:--::::::::::---------::.        
         ::-:  .::::::::.  --------:::..                    
          :-    .:.-:::.                                    

          WARP DRIVE ACTIVATED 🚀🐟
          Made with ❤️ by humans.
  `);

  const botConfig = bot.config;

  logger.info('------- CONFIGURATION START -------');
  logger.info(`Wallet: ${wallet.publicKey.toString()}`);

  logger.info('- Bot -');
  logger.info(`Using transaction executor: ${TRANSACTION_EXECUTOR}`);

  if (bot.isWarp || bot.isJito) {
    logger.info(`${TRANSACTION_EXECUTOR} fee: ${CUSTOM_FEE}`);
  } else {
    logger.info(`Compute Unit limit: ${botConfig.unitLimit}`);
    logger.info(`Compute Unit price (micro lamports): ${botConfig.unitPrice}`);
  }

  logger.info(`Max tokens at the time: ${botConfig.maxTokensAtTheTime}`);
  logger.info(`Pre load existing markets: ${PRE_LOAD_EXISTING_MARKETS}`);
  logger.info(`Cache new markets: ${CACHE_NEW_MARKETS}`);
  logger.info(`Log level: ${LOG_LEVEL}`);
  logger.info(`Max lag: ${MAX_LAG}`);

  logger.info('- Buy -');
  logger.info(`Buy amount: ${botConfig.quoteAmount.toFixed()} ${botConfig.quoteToken.name}`);
  logger.info(`Auto buy delay: ${botConfig.autoBuyDelay} ms`);
  logger.info(`Max buy retries: ${botConfig.maxBuyRetries}`);
  logger.info(`Buy amount (${quoteToken.symbol}): ${botConfig.quoteAmount.toFixed()}`);
  logger.info(`Buy slippage: ${botConfig.buySlippage}%`);

  logger.info('- Sell -');
  logger.info(`Auto sell: ${AUTO_SELL}`);
  logger.info(`Auto sell delay: ${botConfig.autoSellDelay} ms`);
  logger.info(`Max sell retries: ${botConfig.maxSellRetries}`);
  logger.info(`Sell slippage: ${botConfig.sellSlippage}%`);
  logger.info(`Price check interval: ${botConfig.priceCheckInterval} ms`);
  logger.info(`Price check duration: ${botConfig.priceCheckDuration} ms`);
  logger.info(`Take profit: ${botConfig.takeProfit}%`);
  logger.info(`Stop loss: ${botConfig.stopLoss}%`);
  logger.info(`Trailing stop loss: ${botConfig.trailingStopLoss}`);
  logger.info(`Skip selling if lost more than: ${botConfig.skipSellingIfLostMoreThan}%`);

  logger.info('- Snipe list -');
  logger.info(`Snipe list: ${botConfig.useSnipeList}`);
  logger.info(`Snipe list refresh interval: ${SNIPE_LIST_REFRESH_INTERVAL} ms`);

  if (botConfig.useSnipeList) {
    logger.info('- Filters -');
    logger.info(`Filters are disabled when snipe list is on`);
  } else {
    logger.info('- Filters -');
    logger.info(`Filter check interval: ${botConfig.filterCheckInterval} ms`);
    logger.info(`Filter check duration: ${botConfig.filterCheckDuration} ms`);
    logger.info(`Consecutive filter matches: ${botConfig.consecutiveMatchCount}`);
    logger.info(`Check renounced: ${CHECK_IF_MINT_IS_RENOUNCED}`);
    logger.info(`Check freezable: ${CHECK_IF_FREEZABLE}`);
    logger.info(`Check burned: ${CHECK_IF_BURNED}`);
    logger.info(`Check mutable: ${CHECK_IF_MUTABLE}`);
    logger.info(`Check socials: ${CHECK_IF_SOCIALS}`);
    logger.info(`Min pool size: ${botConfig.minPoolSize.toFixed()}`);
    logger.info(`Max pool size: ${botConfig.maxPoolSize.toFixed()}`);
    logger.info(`Min initial liquidity value: ${botConfig.minInitialLiquidityValue.toFixed()}`);
  }

  logger.info(`Check Holders: ${botConfig.checkHolders}`);
  logger.info(`Check Token Distribution: ${botConfig.checkTokenDistribution}`);
  logger.info(`Check Abnormal Distribution: ${botConfig.checkAbnormalDistribution}`);
  logger.info(`Blacklist refresh interval: ${BLACKLIST_REFRESH_INTERVAL}`);

  logger.info(`Buy signal MACD: ${MACD_SHORT_PERIOD}/${MACD_LONG_PERIOD}/${MACD_SIGNAL_PERIOD}`);
  logger.info(`Buy signal RSI: ${RSI_PERIOD}`);

  logger.info('------- CONFIGURATION END -------');

  logger.info('Bot is running! Press CTRL + C to stop it.');
}

// Helper function to parse token information from pump.fun creation transaction (DETAILED VERSION)
async function parseTokenFromTransactionDetailed(signature: string, connection: Connection) {
  try {
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const tx = await connection.getTransaction(signature, { 
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0 
    });
    
    if (!tx) {
      logger.debug(`Could not fetch transaction: ${signature}`);
      return null;
    }

    // Look for token creation patterns in logs
    const logs = tx.meta?.logMessages || [];
    let tokenName = 'Unknown';
    let tokenSymbol = 'UNKNOWN';
    let mintAddress = null;

    // Parse logs for token information
    for (const log of logs) {
      // Look for mint creation
      if (log.includes('Program log: Instruction: Create')) {
        // Try to extract token info from logs (this might need adjustment based on actual pump.fun log format)
        const nameMatch = log.match(/name:\s*"([^"]+)"/i);
        const symbolMatch = log.match(/symbol:\s*"([^"]+)"/i);
        
        if (nameMatch) tokenName = nameMatch[1];
        if (symbolMatch) tokenSymbol = symbolMatch[1];
      }
    }

    // Extract mint address from token balances (most reliable method)
    const postTokenBalances = tx.meta?.postTokenBalances || [];
    if (postTokenBalances.length > 0) {
      // Find the newly created token (usually has balance 0 initially or is the first one)
      const newToken = postTokenBalances.find(balance => balance.uiTokenAmount?.decimals === 6); // pump.fun tokens are 6 decimals
      if (newToken) {
        mintAddress = newToken.mint;
      } else {
        // Fallback to first token balance
        mintAddress = postTokenBalances[0]?.mint;
      }
    }

    // Additional fallback: try to extract from account keys if we have a VersionedTransaction
    if (!mintAddress) {
      try {
        const message = tx.transaction.message;
        if ('accountKeys' in message) {
          // Legacy transaction
          const accountKeys = message.accountKeys;
          if (accountKeys.length > 1) {
            mintAddress = accountKeys[1]?.toBase58();
          }
        } else {
          // Versioned transaction - we need to get loaded addresses
          const accountKeys = message.getAccountKeys();
          if (accountKeys.length > 1) {
            mintAddress = accountKeys.get(1)?.toBase58();
          }
        }
      } catch (e) {
        logger.debug('Could not extract account keys from transaction');
      }
    }

    return {
      name: tokenName,
      symbol: tokenSymbol,
      mint: mintAddress,
      signature,
      isPlaceholder: false
    };
  } catch (error) {
    logger.debug(`Error parsing token from transaction ${signature}:`, error);
    return null;
  }
}

// Helper function to parse token information from pump.fun creation transaction (OPTIMIZED VERSION)
async function parseTokenFromTransactionOptimized(signature: string, connection: Connection) {
  // Fast version: no RPC calls, just generate a placeholder mint from signature hash
  // This avoids rate limiting but doesn't give real token info
  
  // Generate a deterministic "mint" address from signature for display purposes
  // Note: This is NOT the real mint address, just for logging
  const hash = signature.substring(0, 44); // Take first 44 chars as pseudo-mint
  
  return {
    name: 'Pump.fun Token',
    symbol: 'PUMP',
    mint: hash, // This is NOT the real mint, just a placeholder
    signature,
    isPlaceholder: true
  };
}

// Main parser function that chooses based on configuration
async function parseTokenFromTransaction(signature: string, connection: Connection) {
  if (PUMP_FUN_DETAILED_PARSING) {
    return await parseTokenFromTransactionDetailed(signature, connection);
  } else {
    return await parseTokenFromTransactionOptimized(signature, connection);
  }
}

const runListener = async () => {
  logger.level = LOG_LEVEL;
  logger.info('Bot is starting...');

  const marketCache = new MarketCache(connection);
  const poolCache = new PoolCache();
  const technicalAnalysisCache = new TechnicalAnalysisCache();

  let txExecutor: TransactionExecutor;

  switch (TRANSACTION_EXECUTOR) {
    case 'warp': {
      txExecutor = new WarpTransactionExecutor(CUSTOM_FEE);
      break;
    }
    case 'jito': {
      txExecutor = new JitoTransactionExecutor(CUSTOM_FEE, connection);
      break;
    }
    default: {
      txExecutor = new DefaultTransactionExecutor(connection);
      break;
    }
  }

  const wallet = getWallet(PRIVATE_KEY.trim());
  const quoteToken = getToken(QUOTE_MINT);
  const botConfig = <BotConfig>{
    wallet,
    quoteAta: getAssociatedTokenAddressSync(quoteToken.mint, wallet.publicKey),
    minPoolSize: new TokenAmount(quoteToken, MIN_POOL_SIZE, false),
    maxPoolSize: new TokenAmount(quoteToken, MAX_POOL_SIZE, false),
    minInitialLiquidityValue: new TokenAmount(getToken('USDC'), MIN_INITIAL_LIQUIDITY_VALUE, false), // fixme: wsol
    quoteToken,
    quoteAmount: new TokenAmount(quoteToken, QUOTE_AMOUNT, false),
    maxTokensAtTheTime: MAX_TOKENS_AT_THE_TIME,
    useSnipeList: USE_SNIPE_LIST,
    autoSell: AUTO_SELL,
    autoSellDelay: AUTO_SELL_DELAY,
    maxSellRetries: MAX_SELL_RETRIES,
    autoBuyDelay: AUTO_BUY_DELAY,
    maxBuyRetries: MAX_BUY_RETRIES,
    maxBuyDuration: MAX_BUY_DURATION,
    unitLimit: COMPUTE_UNIT_LIMIT,
    unitPrice: COMPUTE_UNIT_PRICE,
    takeProfit: TAKE_PROFIT,
    stopLoss: STOP_LOSS,
    trailingStopLoss: TRAILING_STOP_LOSS,
    skipSellingIfLostMoreThan: SKIP_SELLING_IF_LOST_MORE_THAN,
    buySlippage: BUY_SLIPPAGE,
    sellSlippage: SELL_SLIPPAGE,
    priceCheckInterval: PRICE_CHECK_INTERVAL,
    priceCheckDuration: PRICE_CHECK_DURATION,
    filterCheckInterval: FILTER_CHECK_INTERVAL,
    filterCheckDuration: FILTER_CHECK_DURATION,
    consecutiveMatchCount: CONSECUTIVE_FILTER_MATCHES,
    checkHolders: CHECK_HOLDERS,
    checkTokenDistribution: CHECK_TOKEN_DISTRIBUTION,
    checkAbnormalDistribution: CHECK_ABNORMAL_DISTRIBUTION,
    telegramChatId: USE_TELEGRAM ? TELEGRAM_CHAT_ID : undefined,
    telegramThreadId: USE_TELEGRAM ? TELEGRAM_THREAD_ID : undefined,
    telegramBotToken: USE_TELEGRAM ? TELEGRAM_BOT_TOKEN : undefined,
    blacklistRefreshInterval: BLACKLIST_REFRESH_INTERVAL,
    MACDLongPeriod: MACD_LONG_PERIOD,
    MACDShortPeriod: MACD_SHORT_PERIOD,
    MACDSignalPeriod: MACD_SIGNAL_PERIOD,
    RSIPeriod: RSI_PERIOD,
    autoSellWithoutSellSignal: AUTO_SELL_WITHOUT_SELL_SIGNAL,
    buySignalTimeToWait: BUY_SIGNAL_TIME_TO_WAIT,
    buySignalPriceInterval: BUY_SIGNAL_PRICE_INTERVAL,
    buySignalFractionPercentageTimeToWait: BUY_SIGNAL_FRACTION_TIME_TO_WAIT,
    buySignalLowVolumeThreshold: BUY_SIGNAL_LOW_VOLUME_THRESHOLD,
    useTelegram: USE_TELEGRAM,
    useTechnicalAnalysis: USE_TA,
  };

  const bot = new Bot(connection, marketCache, poolCache, txExecutor, technicalAnalysisCache, botConfig);
  const valid = await bot.validate();

  if (!valid) {
    logger.info('Bot is exiting...');
    process.exit(1);
  }

  if (PRE_LOAD_EXISTING_MARKETS) {
    await marketCache.init({ quoteToken });
  }

  const runTimestamp = Math.floor(new Date().getTime() / 1000);
  const listeners = new Listeners(connection);
  await listeners.start({
    walletPublicKey: wallet.publicKey,
    quoteToken,
    autoSell: AUTO_SELL,
    cacheNewMarkets: CACHE_NEW_MARKETS,
  });

  listeners.on('market', (updatedAccountInfo: KeyedAccountInfo) => {
    const marketState = MARKET_STATE_LAYOUT_V3.decode(updatedAccountInfo.accountInfo.data);
    marketCache.save(updatedAccountInfo.accountId.toString(), marketState);
  });

  listeners.on('pool', async (updatedAccountInfo: KeyedAccountInfo) => {
    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
    const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
    const exists = await poolCache.get(poolState.baseMint.toString());
    const baseMint = poolState.baseMint.toString();
    const quoteMint = poolState.quoteMint.toString();

    let currentTimestamp = Math.floor(new Date().getTime() / 1000);
    let lag = currentTimestamp - poolOpenTime;
    
    if (exists) {
      return;
    }

    if (poolOpenTime <= runTimestamp) {
      return;
    }

    logger.info(`🟢 NEW POOL FOUND! Base: ${baseMint}, Lag: ${lag}s`);
    tokenFoundCount++;
    poolCache.save(updatedAccountInfo.accountId.toString(), poolState);
    await logFind(poolState.baseMint.toString(), new Date(poolOpenTime * 1000));

    if (MAX_LAG != 0 && lag > MAX_LAG) {
      logger.warn(`⚠️ Lag too high for ${baseMint}: ${lag}s (max: ${MAX_LAG}s) - SKIPPING`);
      return;
    }

    logger.info(`🚀 Processing new token: ${baseMint} (lag: ${lag}s)`);
    await bot.buy(updatedAccountInfo.accountId, poolState, lag);
  });

  listeners.on('wallet', async (updatedAccountInfo: KeyedAccountInfo) => {
    const accountData = AccountLayout.decode(updatedAccountInfo.accountInfo.data);

    if (accountData.mint.equals(quoteToken.mint)) {
      return;
    }

    await bot.sell(updatedAccountInfo.accountId, accountData);
  });

  // Pump.fun event listeners
  if (ENABLE_PUMP_FUN_LISTENER) {
    const parsingMode = PUMP_FUN_DETAILED_PARSING ? 'DETAILED' : 'OPTIMIZED';
    logger.info(`🎯 Pump.fun listeners enabled (${parsingMode} parsing mode)`);

    listeners.on('pumpFun', async (data: any) => {
      try {
        // Handle generic pump.fun transaction logs
      } catch (error) {
        logger.error('Error handling pump.fun transaction:', error);
      }
    });

    listeners.on('pumpFunBondingCurve', async (data: any) => {
      try {
        logger.info(`🎯 Pump.fun bonding curve update: ${data.bondingCurve.toString()}`);
        
        // Extract mint from bonding curve (you may need to implement this based on pump.fun structure)
        // For now, we'll use a placeholder approach
        const mint = data.bondingCurve; // This needs proper implementation
        
        logger.info(`🚀 Processing pump.fun token update: ${mint.toString()}`);
        await bot.handlePumpFunToken(mint, 'update');
      } catch (error) {
        logger.error('Error handling pump.fun bonding curve:', error);
      }
    });

    listeners.on('pumpFunCreate', async (createEvent: any) => {
      try {
        tokenFoundCount++;
        
        // Parse token information from transaction
        const tokenInfo = await parseTokenFromTransaction(createEvent.signature, connection);
        
        if (tokenInfo) {
          if (tokenInfo.isPlaceholder) {
            // Optimized mode - no real mint address
            const shortSig = createEvent.signature.substring(0, 8) + '...' + createEvent.signature.substring(-8);
            logger.info(`🎯 NEW PUMP.FUN TOKEN: "${tokenInfo.name}" (${tokenInfo.symbol}) | tx: ${shortSig} [OPTIMIZED MODE]`);
          } else {
            // Detailed mode - real mint address
            logger.info(`🎯 NEW PUMP.FUN TOKEN: "${tokenInfo.name}" (${tokenInfo.symbol}) | ${tokenInfo.mint} | tx: ${createEvent.signature}`);
            
            // Process the token if we have the real mint address
            if (tokenInfo.mint) {
              await bot.handlePumpFunToken(new PublicKey(tokenInfo.mint), 'new');
            }
          }
        } else {
          // Fallback if parsing fails - show truncated signature
          const shortSig = createEvent.signature.substring(0, 8) + '...' + createEvent.signature.substring(-8);
          logger.info(`🎯 NEW PUMP.FUN TOKEN | Unknown Token | tx: ${shortSig}`);
        }
      } catch (error) {
        logger.error('Error handling pump.fun create event:', error);
      }
    });

    listeners.on('pumpFunTrade', async (tradeEvent: any) => {
      try {
        
        // TODO: Extract mint from transaction logs if needed for trading updates
      } catch (error) {
        logger.error('Error handling pump.fun trade event:', error);
      }
    });

    listeners.on('pumpFunComplete', async (completeEvent: any) => {
      try {
        logger.info(`🎯 Pump.fun bonding curve completed in tx: ${completeEvent.signature}`);
        
        // TODO: Extract mint from transaction logs for completion handling
      } catch (error) {
        logger.error('Error handling pump.fun complete event:', error);
      }
    });

    listeners.on('pumpFunMigration', async (updatedAccountInfo: KeyedAccountInfo) => {
      try {
        logger.info(`Pump.fun migration detected: ${updatedAccountInfo.accountId.toString()}`);
        // Handle migration from bonding curve to Raydium
        // This could trigger final buy opportunities or sell signals
      } catch (error) {
        logger.error('Error handling pump.fun migration:', error);
      }
    });
  }

  printDetails(wallet, quoteToken, bot);

  // Periodic status log to show the bot is active
  let tokenFoundCount = 0;
  let poolEventsCount = 0;
  let pumpFunEventsCount = 0;

  // Count events
  listeners.on('pool', () => { poolEventsCount++; });
  listeners.on('pumpFun', () => { pumpFunEventsCount++; });

  setInterval(() => {
    const uptimeMinutes = Math.floor(process.uptime() / 60);
    logger.info(`📊 STATUS: ${uptimeMinutes}m uptime | ${listeners.getActiveListenerCount()} listeners active | Pools: ${poolEventsCount} | PumpFun: ${pumpFunEventsCount} | New tokens: ${tokenFoundCount}`);
    
    // Reset counters every hour
    if (uptimeMinutes % 60 === 0) {
      poolEventsCount = 0;
      pumpFunEventsCount = 0;
    }
  }, 600000); // Every 10 minutes
};

runListener();
