import { MarketCache, PoolCache } from './cache';
import { Listeners } from './listeners';
import { Connection, KeyedAccountInfo, Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
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

// Known program IDs that should not be treated as tokens
const KNOWN_PROGRAM_IDS = new Set([
  // System programs
  '11111111111111111111111111111111', // System Program
  'ComputeBudget111111111111111111111111111111', // Compute Budget Program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
  'SysvarRent111111111111111111111111111111111', // Rent Sysvar
  'SysvarC1ock11111111111111111111111111111111', // Clock Sysvar
  // Pump.fun programs
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // Pump.fun Program
  '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg', // Pump.fun Migration Program
  // Raydium programs
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM Program
  '27haf8L6oxUeXrHrgEgsexjSY5hbVUWEmvv9Nyxg8vQv', // Raydium Liquidity Pool V4
  // OpenBook
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX', // Serum/OpenBook Program
  // Other common programs
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', // Token Metadata Program
  'auth9SigNpDKz4sJJ1DfCTuZrZNSAgh9sFD3rboVmgg' // Token Auth Rules
]);

// Known pump.fun account patterns that are NOT mint addresses
const PUMP_FUN_NON_MINT_PATTERNS = [
  'Dn8BWWfCn86',  // Bonding curve accounts pattern
  'Ce6TQqeHC1',   // Another common pump.fun account pattern
  'CebN5WGQ4j',   // Fee accounts
  // Add more patterns as discovered
];

// Function to check if an address is likely a pump.fun system account (not a mint)
function isPumpFunSystemAccount(address: string): boolean {
  return PUMP_FUN_NON_MINT_PATTERNS.some(pattern => address.startsWith(pattern));
}

// Helper function to extract mint address from pump.fun transaction using proper method
async function extractMintFromPumpFunTransaction(signature: string, connection: Connection): Promise<string | null> {
  try {
    // Get the complete transaction details
    const transaction = await connection.getParsedTransaction(signature, { 
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed' 
    });

    if (!transaction) {
      // Silent fail - transaction might not be available yet
      return null;
    }

    // CRITICAL FIX: Don't use postTokenBalances as it finds existing tokens in new transactions
    // Instead, look for NEW MINT CREATION in the account keys and pre/postBalances properly

    // Method 1: Look for truly NEW MINT creation by checking if mint exists in preTokenBalances
    if (transaction.meta?.postTokenBalances && transaction.meta?.preTokenBalances) {
      const preBalances = transaction.meta.preTokenBalances;
      const postBalances = transaction.meta.postTokenBalances;

      // Find mints that appear in postTokenBalances but NEVER appeared in any preTokenBalances
      const postMints = new Set(postBalances.map(b => b.mint).filter(Boolean));
      const preMints = new Set(preBalances.map(b => b.mint).filter(Boolean));

      for (const mint of postMints) {
        // Skip if this mint was already present before the transaction
        if (preMints.has(mint)) {
          continue;
        }

        // Skip known programs and pump.fun system accounts
        if (KNOWN_PROGRAM_IDS.has(mint!) || isPumpFunSystemAccount(mint!)) {
          continue;
        }

        // Additional validation: verify this is a new mint account created in this transaction
        try {
          const mintPubkey = new PublicKey(mint!);
          const mintInfo = await connection.getAccountInfo(mintPubkey);

          if (mintInfo && mintInfo.data.length === 82) {
            // CRITICAL: Check if this mint was created recently by examining the account
            // For pump.fun, the mint should have specific characteristics if truly new
            const mintData = mintInfo.data;
            const supply = new BN(mintData.slice(68, 76), 'le'); // Mint supply at bytes 68-76

            // New pump.fun tokens typically start with 1 billion tokens (1,000,000,000 * 1e6)
            const expectedSupply = new BN(1000000000).mul(new BN(1000000)); // 1B * 1e6 decimals

            if (supply.eq(expectedSupply)) {
              logger.debug(`Found potentially new pump.fun mint with expected supply: ${mint}`);
              return mint!;
            } else {
              logger.debug(`Skipping mint ${mint} - supply ${supply.toString()} doesn't match new pump.fun pattern`);
            }
          }
        } catch (error) {
          logger.debug(`Error validating mint ${mint}:`, error);
        }
      }
    }

    // Method 2: Look for mint in account keys for CREATE transactions (FALLBACK)
    if (transaction.meta?.logMessages && transaction.transaction.message.accountKeys) {
      const hasPumpFunCreate = transaction.meta.logMessages.some(log =>
        log.includes('Program log: Instruction: Create') &&
        log.includes('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
      );

      if (hasPumpFunCreate) {
        // For pump.fun CREATE transactions, the mint is usually in the first few account keys
        // Skip the first account (usually the user), look for mint accounts
        for (let i = 1; i < Math.min(transaction.transaction.message.accountKeys.length, 6); i++) {
          try {
            const accountKey = transaction.transaction.message.accountKeys[i];
            const accountAddress = accountKey.pubkey.toString();

            // Skip known system programs and pump.fun system accounts
            if (KNOWN_PROGRAM_IDS.has(accountAddress) || isPumpFunSystemAccount(accountAddress)) {
              continue;
            }

            // Check if this could be a mint account
            const mintInfo = await connection.getAccountInfo(new PublicKey(accountAddress));
            if (mintInfo && mintInfo.data.length === 82) {
              // Additional validation for pump.fun characteristics
              const mintData = mintInfo.data;
              const decimals = mintData[76];
              const supply = new BN(mintData.slice(68, 76), 'le');
              const expectedSupply = new BN('1000000000000000'); // 1B * 1e6

              if (decimals === 6 && supply.eq(expectedSupply)) {
                logger.debug(`Found fresh mint from account keys: ${accountAddress}`);
                return accountAddress;
              }
              // Skip silently if characteristics don't match
            }
          } catch (error) {
            // Continue to next account
            continue;
          }
        }
      }
    }

    // Method 3: DISABLED - Program data parsing was extracting wrong addresses
    // The program data method was unreliable and extracted bonding curve addresses
    logger.debug(`Could not extract mint from pump.fun transaction ${signature} - only postTokenBalances method succeeded`);

    return null;
  } catch (error) {
    // Silent fail - many transactions won't be parseable
    return null;
  }
}

// Simplified function for quick log-only parsing (fallback)
function extractMintFromLogs(logs: string[]): string | null {
  try {
    // FIRST: Check if this is a CREATE transaction (not BUY)
    const hasCreateInstruction = logs.some(log => log.includes('Program log: Instruction: Create'));
    if (!hasCreateInstruction) {
      return null; // Skip silently - probably Buy/Sell transaction
    }
    
    // SECOND: Look for "Program data:" and try basic parsing
    for (const log of logs) {
      if (log.includes('Program data:')) {
        try {
          const dataMatch = log.match(/Program data: ([A-Za-z0-9+/=]+)/);
          if (dataMatch && dataMatch[1]) {
            const base64Data = dataMatch[1];
            const buffer = Buffer.from(base64Data, 'base64');
            
            if (buffer.length >= 32) {
              // Try first 32 bytes as potential mint
              try {
                const potentialMint = new PublicKey(buffer.subarray(0, 32));
                const mintString = potentialMint.toString();
                
                if (!KNOWN_PROGRAM_IDS.has(mintString) && 
                    mintString !== '11111111111111111111111111111111') {
                  return mintString;
                }
              } catch {
                // Continue to next attempt
              }
              
              // Try at offset 32 if available
              if (buffer.length >= 64) {
                try {
                  const potentialMint = new PublicKey(buffer.subarray(32, 64));
                  const mintString = potentialMint.toString();
                  
                  if (!KNOWN_PROGRAM_IDS.has(mintString) && 
                      mintString !== '11111111111111111111111111111111') {
                    return mintString;
                  }
                } catch {
                  // Continue
                }
              }
            }
          }
        } catch (error) {
          logger.debug('Error parsing program data from logs:', error);
        }
      }
    }

    return null;
  } catch (error) {
    logger.debug('Error in extractMintFromLogs:', error);
    return null;
  }
}

// Helper function to parse token information from pump.fun creation transaction (OPTIMIZED VERSION)
async function parseTokenFromTransactionOptimized(signature: string, connection: Connection) {
  // Try to extract mint from event data that's already available in the logs
  // This is a light approach that tries to extract mint without full RPC calls
  try {
    // For pump.fun, we can try to decode mint from the signature or event data
    // Since we're in the logs listener, we might already have some info
    
    // As a fallback for now, we'll use a deterministic approach but try to make it look more like a mint
    // Generate a deterministic mint-like address from signature hash
    const base58chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let hash = signature;
    let mintLike = '';
    
    // Create a 44-character base58-like string from the signature
    for (let i = 0; i < 44; i++) {
      const charIndex = signature.charCodeAt(i % signature.length) % base58chars.length;
      mintLike += base58chars[charIndex];
    }
    
    return {
      name: 'Pump.fun Token',
      symbol: 'PUMP',
      mint: mintLike + 'pump', // Add 'pump' suffix to make it clearly identifiable
      signature,
      isPlaceholder: true
    };
  } catch (error) {
    logger.debug(`Error in optimized parsing for ${signature}:`, error);
    
    // Fallback to simple approach
    const hash = signature.substring(0, 44);
    return {
      name: 'Pump.fun Token', 
      symbol: 'PUMP',
      mint: hash,
      signature,
      isPlaceholder: true
    };
  }
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
        // Check transaction timestamp to filter only new tokens
        const currentTimestamp = Math.floor(new Date().getTime() / 1000);
        let transactionTimestamp = currentTimestamp; // Default to current if we can't get it
        
        // Try to get transaction timestamp from slot
        if (createEvent.ctx && createEvent.ctx.slot) {
          try {
            const blockTime = await connection.getBlockTime(createEvent.ctx.slot);
            if (blockTime) {
              transactionTimestamp = blockTime;
            }
          } catch (error) {
            logger.debug(`Could not get block time for slot ${createEvent.ctx.slot}`);
          }
        }
        
        // More aggressive timing filter - only process very fresh tokens
        const timeSinceStart = transactionTimestamp - runTimestamp;
        if (timeSinceStart < -10) { // Reduced from -30 to -10 seconds
          logger.debug(`⏰ Skipping old pump.fun token (${timeSinceStart}s before bot start)`);
          return;
        }
        
        // Also check if we have event timestamp and prioritize ultra-fresh tokens
        if (createEvent.timestamp) {
          const eventLag = Date.now() - createEvent.timestamp;
          if (eventLag > 5000) { // Skip if event is older than 5 seconds
            // Silent skip - event too old
            return;
          }
        }
        
        tokenFoundCount++;
        
        // Ultra-fast parsing for fresh tokens
        const lag = currentTimestamp - transactionTimestamp;
        const eventLag = createEvent.timestamp ? Date.now() - createEvent.timestamp : 0;
        
        // Use the proper method to extract mint address from transaction
        let mintAddress: string | null = null;
        
        // Always use full transaction parsing for accurate results
        // (Disable quick log parsing as it was extracting program IDs instead of mints)
        mintAddress = await extractMintFromPumpFunTransaction(createEvent.signature, connection);

        if (mintAddress) {
          // Validate the extracted mint address before processing
          try {
            const mintPubkey = new PublicKey(mintAddress);

            // Additional validation: check if it's a valid mint account with expected properties
            const mintAccountInfo = await connection.getAccountInfo(mintPubkey);
            if (!mintAccountInfo || mintAccountInfo.data.length !== 82) {
              logger.debug(`⚠️ Extracted address ${mintAddress} is not a valid mint account (size: ${mintAccountInfo?.data.length || 0}), skipping`);
              return;
            }

            // CRITICAL: Check if this is actually a fresh pump.fun token
            const mintData = mintAccountInfo.data;
            const supply = new BN(mintData.slice(68, 76), 'le');
            const decimals = mintData[76];
            const mintAuthorityBytes = mintData.slice(4, 36);

            // Validate pump.fun characteristics
            const expectedSupply = new BN('1000000000000000'); // 1B * 1e6
            const isCorrectDecimals = decimals === 6;
            const hasAuthority = !mintAuthorityBytes.every(byte => byte === 0);

            if (!isCorrectDecimals) {
              // Silent skip - wrong decimals (not pump.fun)
              return;
            }

            if (!supply.eq(expectedSupply)) {
              // Silent skip - token has wrong supply (likely existing token)
              return;
            }

            logger.info(`🎆 FRESH PUMP.FUN TOKEN | ${mintAddress} | Tx: ${createEvent.signature} | Lag: ${eventLag}ms`);
            await bot.handlePumpFunToken(mintPubkey, 'new');

          } catch (error) {
            logger.debug(`Error validating mint address ${mintAddress}:`, error);
            return;
          }
          return;
        } else {
          // Silent fail - could not extract mint from create event
          return;
        }
        
        // Legacy fallback (this should not be reached with the new implementation)
        const tokenInfo = await parseTokenFromTransactionOptimized(createEvent.signature, connection);
        
        if (tokenInfo) {
          if (tokenInfo.isPlaceholder) {
            // Optimized mode - show mint-like address instead of transaction
            logger.info(`🎯 NEW PUMP.FUN TOKEN: "${tokenInfo.name}" (${tokenInfo.symbol}) | Contract: ${tokenInfo.mint} | Lag: ${lag}s`);
          } else {
            // Detailed mode - real mint address
            logger.info(`🎯 NEW PUMP.FUN TOKEN: "${tokenInfo.name}" (${tokenInfo.symbol}) | Contract: ${tokenInfo.mint} | Lag: ${lag}s`);
            
            // Process the token if we have the real mint address and it's recent enough
            if (tokenInfo.mint && lag <= (MAX_LAG || 300)) { // Default 5min max lag if not set
              await bot.handlePumpFunToken(new PublicKey(tokenInfo.mint), 'new');
            } else if (lag > (MAX_LAG || 300)) {
              logger.warn(`⚠️ Pump.fun token lag too high: ${lag}s (max: ${MAX_LAG || 300}s) - SKIPPING`);
            }
          }
        } else {
          // Fallback if parsing fails - show placeholder mint
          const pseudoMint = createEvent.signature.substring(0, 40) + 'pump';
          logger.info(`🎯 NEW PUMP.FUN TOKEN | Unknown Token | Contract: ${pseudoMint}`);
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
