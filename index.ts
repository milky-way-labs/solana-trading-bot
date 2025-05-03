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
} from './helpers';
import { WarpTransactionExecutor } from './transactions/warp-transaction-executor';
import { JitoTransactionExecutor } from './transactions/jito-rpc-transaction-executor';
import { TechnicalAnalysisCache } from './cache/technical-analysis.cache';
import { logFind } from './db';
import * as bs58 from 'bs58';

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  commitment: COMMITMENT_LEVEL,
});

// Program ID di Raydium CP-Swap
const CPMM_PROGRAM_ID = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');

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
    telegramChatId: TELEGRAM_CHAT_ID,
    telegramThreadId: TELEGRAM_THREAD_ID,
    telegramBotToken: TELEGRAM_BOT_TOKEN,
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
    try {
      // Determina la fonte dell'evento (programma)
      const programId = updatedAccountInfo.accountInfo.owner.toString();
      
      let poolState: any;
      let poolOpenTime: number;
      let baseMint: string;
      
      // Controlla se l'evento proviene dal programma CP-Swap
      const isCPSwapPool = programId === CPMM_PROGRAM_ID.toString();
      
      if (isCPSwapPool) {
        // CP-Swap pool (nuovo formato)
        logger.debug(`Processing CP-Swap pool: ${updatedAccountInfo.accountId.toString()}`);
        
        const accountData = updatedAccountInfo.accountInfo.data;
        
        // Salva l'intero account per analisi successiva (solo in caso di debug)
        if (logger.level === 'debug' || logger.level === 'trace') {
          const accountBase64 = Buffer.from(accountData).toString('base64');
          logger.debug(`CP-Swap account buffer completo (base64): ${accountBase64}`);
        }
        
        // Estraiamo baseMint (offset 16 come da precedenti analisi)
        const OFFSET_BASE_MINT = 16;
        if (accountData.length < OFFSET_BASE_MINT + 32) {
          logger.warn(`CP-Swap pool ${updatedAccountInfo.accountId.toString()} ha dati insufficienti per leggere baseMint`);
          return;
        }
        
        const baseMintData = accountData.slice(OFFSET_BASE_MINT, OFFSET_BASE_MINT + 32);
        baseMint = bs58.encode(baseMintData);
        
        // Strategia 1: Leggi il campo status (di solito all'offset 8)
        const OFFSET_STATUS = 8;
        let poolStatus = 0;
        
        if (accountData.length > OFFSET_STATUS) {
          poolStatus = accountData[OFFSET_STATUS];
          logger.debug(`CP-Swap pool status: 0x${poolStatus.toString(16)} (${poolStatus})`);
        }
        
        // Strategia 2: Cerca open_time in un range più ampio
        // Estendiamo il range di ricerca per maggiore copertura
        const possibleOpenTimeOffsets = [];
        // Genera offsets da 100 a 400 con incrementi di 8 byte
        for (let offset = 100; offset <= 400; offset += 8) {
          possibleOpenTimeOffsets.push(offset);
        }
        
        let foundValidOpenTime = false;
        
        // Log di debug per porzioni specifiche del buffer
        if (accountData.length > 400) {
          logger.debug(`CP-Swap account (100-200): ${Buffer.from(accountData.slice(100, 200)).toString('hex')}`);
          logger.debug(`CP-Swap account (200-300): ${Buffer.from(accountData.slice(200, 300)).toString('hex')}`);
          logger.debug(`CP-Swap account (300-400): ${Buffer.from(accountData.slice(300, 400)).toString('hex')}`);
        }
        
        // Diamo priorità ad offset specifici basati su esempi
        const priorityOffsets = [232, 304, 168, 176, 184, 200];
        const allOffsets = [...priorityOffsets, ...possibleOpenTimeOffsets.filter(o => !priorityOffsets.includes(o))];
        
        for (const offset of allOffsets) {
          if (accountData.length < offset + 8) continue;
          
          const openTimeBuffer = accountData.slice(offset, offset + 8);
          
          try {
            // Convertire il buffer u64 (little endian) in un numero
            const openTimeValue = Buffer.from(openTimeBuffer).readBigUInt64LE(0);
            const openTimeNum = Number(openTimeValue);
            
            // Verificare che il valore sia un timestamp ragionevole
            // Un pool non può esistere prima di Solana (2020) e non troppo nel futuro
            const minTimestamp = 1577836800; // 2020-01-01
            const maxTimestamp = Math.floor(Date.now() / 1000) + 86400 * 30; // ora + 30 giorni
            
            if (!isNaN(openTimeNum) && openTimeNum > minTimestamp && openTimeNum < maxTimestamp) {
              // Abbiamo trovato un timestamp valido
              poolOpenTime = openTimeNum;
              foundValidOpenTime = true;
              logger.info(`Trovato open_time valido all'offset ${offset}: ${poolOpenTime} (${new Date(poolOpenTime * 1000).toISOString()})`);
              break;
            }
          } catch (error) {
            // Continuiamo con il prossimo offset
          }
        }
        
        // Strategia 3: Se non troviamo un openTime valido, ma il pool ha status attivo (bit 0x04 non impostato)
        // consideriamo il pool come attivo con timestamp corrente
        if (!foundValidOpenTime) {
          // Se pool status non ha bit 0x04 attivo (che disabilita lo swap secondo docs), consideriamo il pool attivo
          if ((poolStatus & 0x04) === 0) {
            logger.info(`CP-Swap pool ${updatedAccountInfo.accountId.toString()} ha status attivo (${poolStatus}), considero il pool attivo`);
            // Usiamo il timestamp corrente, ma sottraiamo 1 secondo per assicurarci che sia nel passato
            poolOpenTime = Math.floor(Date.now() / 1000) - 1;
            foundValidOpenTime = true;
          } else {
            logger.warn(`CP-Swap pool ${updatedAccountInfo.accountId.toString()} non ha un open_time valido e status non è attivo (${poolStatus}), ignoro il pool`);
            return;
          }
        }
        
        // Creiamo un oggetto poolState minimo con solo i campi richiesti
        poolState = {
          baseMint: { toString: () => baseMint },
          poolOpenTime: { toString: () => poolOpenTime.toString() }
        };
      } else {
        // Pool AMM v4 legacy
        try {
          poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
          poolOpenTime = parseInt(poolState.poolOpenTime.toString());
          baseMint = poolState.baseMint.toString();
        } catch (decodeError) {
          logger.error(`Errore decodifica pool AMM v4: ${decodeError}`);
          return; // Termina l'elaborazione se la decodifica fallisce
        }
      }
      
      // Verifica se il pool è già noto
      const exists = await poolCache.get(baseMint);
      
      let currentTimestamp = Math.floor(new Date().getTime() / 1000);
      let lag = currentTimestamp - poolOpenTime;

      if (!exists && poolOpenTime > runTimestamp) {
        // Formattazione sicura delle date per il log
        let poolOpenTimeFormatted;
        let runTimestampFormatted;
        
        try {
          poolOpenTimeFormatted = new Date(poolOpenTime * 1000).toISOString();
        } catch (e) {
          poolOpenTimeFormatted = `[data invalida: ${poolOpenTime}]`;
        }
        
        try {
          runTimestampFormatted = new Date(runTimestamp * 1000).toISOString();
        } catch (e) {
          runTimestampFormatted = `[data invalida: ${runTimestamp}]`;
        }
        
        logger.info(`Nuovo pool trovato: pool open time: ${poolOpenTimeFormatted}, run timestamp: ${runTimestampFormatted} ${updatedAccountInfo.accountId.toString()}, base: ${baseMint}, tipo: ${isCPSwapPool ? 'CP-Swap' : 'AMM v4'}`);
        
        // Salva solo i dati minimi necessari
        poolCache.save(updatedAccountInfo.accountId.toString(), poolState);
        
        // Log del nuovo token trovato in modo sicuro
        try {
          await logFind(baseMint, new Date(poolOpenTime * 1000));
        } catch (e) {
          logger.warn(`Errore nel log del nuovo token: ${e}`);
          await logFind(baseMint, new Date()); // Usa la data corrente come fallback
        }
      }
    } catch (error) {
      logger.error(`Error processing pool update: ${error}`);
    }
  });

  listeners.on('wallet', async (updatedAccountInfo: KeyedAccountInfo) => {
    const accountData = AccountLayout.decode(updatedAccountInfo.accountInfo.data);

    if (accountData.mint.equals(quoteToken.mint)) {
      return;
    }

    await bot.sell(updatedAccountInfo.accountId, accountData);
  });

  printDetails(wallet, quoteToken, bot);
};

runListener();
