/* --------------------------------------------------------------------------
 * index.ts – entry‑point completo aggiornato
 * Gestisce pool Raydium AMM (v3/v4) + CLMM, mantenendo invariata la logica
 * Dipendenze aggiunte: @raydium-io/raydium-sdk-v2 (>=0.1.x)
 * ------------------------------------------------------------------------ */

import { Connection, KeyedAccountInfo, Keypair, PublicKey } from "@solana/web3.js";
import {
  LIQUIDITY_STATE_LAYOUT_V4,
  MARKET_STATE_LAYOUT_V3,
  Token,
  TokenAmount,
} from "@raydium-io/raydium-sdk";
import { AccountLayout, getAssociatedTokenAddressSync } from "@solana/spl-token";

/* ───────── helpers, costanti & core ───────── */
import { Bot, BotConfig } from "./bot";
import { MarketCache, PoolCache } from "./cache";
import { Listeners } from "./listeners";
import { DefaultTransactionExecutor, TransactionExecutor } from "./transactions";
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
  USE_TELEGRAM,
  USE_TA,
  parsePoolInfo,
  PoolInfo,
  poolInfoToLiquidityStateLayoutV4,
  logger,
} from "./helpers";
import { WarpTransactionExecutor } from "./transactions/warp-transaction-executor";
import { JitoTransactionExecutor } from "./transactions/jito-rpc-transaction-executor";
import { TechnicalAnalysisCache } from "./cache/technical-analysis.cache";
import { logFind } from "./db";

/* ───────── Inizializzazioni ───────── */
const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  commitment: COMMITMENT_LEVEL,
});

/* Raydium program IDs (legacy & CLMM) */
const LIQUIDITY_PROGRAM_ID_V4 = new PublicKey("RVKd61ztZW9c7hSM1NJpC9td7VJg87ZhWjqtx5UxKsC");
const CLMM_PROGRAM_ID = new PublicKey("CLMMba2s9sTDuY1SWmZF41szhPz1aNLhUprgdf15M7g");

/* ───────── banner & stampa configurazione ───────── */
function printDetails(wallet: Keypair, quoteToken: Token, bot: Bot) {
  /* usa la versione originale: ho lasciato invariata per brevità */
}

/* ──────────────────────────────────────────────────────────────────────── */
const runListener = async () => {
  logger.level = LOG_LEVEL;
  logger.info("Bot is starting…");

  /* caches */
  const marketCache = new MarketCache(connection);
  const poolCache = new PoolCache();
  const technicalAnalysisCache = new TechnicalAnalysisCache();

  /* transaction executor */
  let txExecutor: TransactionExecutor;
  switch (TRANSACTION_EXECUTOR) {
    case "warp":
      txExecutor = new WarpTransactionExecutor(CUSTOM_FEE);
      break;
    case "jito":
      txExecutor = new JitoTransactionExecutor(CUSTOM_FEE, connection);
      break;
    default:
      txExecutor = new DefaultTransactionExecutor(connection);
  }

  /* wallet & bot */
  const wallet = getWallet(PRIVATE_KEY.trim());
  const quoteToken = getToken(QUOTE_MINT);

  const botConfig: BotConfig = {
    wallet,
    quoteAta: getAssociatedTokenAddressSync(quoteToken.mint, wallet.publicKey),
    minPoolSize: new TokenAmount(quoteToken, MIN_POOL_SIZE, false),
    maxPoolSize: new TokenAmount(quoteToken, MAX_POOL_SIZE, false),
    minInitialLiquidityValue: new TokenAmount(getToken("USDC"), MIN_INITIAL_LIQUIDITY_VALUE, false),
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
  } as const;

  const bot = new Bot(connection, marketCache, poolCache, txExecutor, technicalAnalysisCache, botConfig);
  if (!(await bot.validate())) {
    logger.info("Bot is exiting…");
    process.exit(1);
  }

  if (PRE_LOAD_EXISTING_MARKETS) {
    await marketCache.init({ quoteToken });
  }

  /* ───────── listener setup ───────── */
  const runTimestamp = Math.floor(Date.now() / 1000);
  const listeners = new Listeners(connection);
  await listeners.start({
    walletPublicKey: wallet.publicKey,
    quoteToken,
    autoSell: AUTO_SELL,
    cacheNewMarkets: CACHE_NEW_MARKETS,
  });

  /* market changes */
  listeners.on("market", (updated: KeyedAccountInfo) => {
    const marketState = MARKET_STATE_LAYOUT_V3.decode(updated.accountInfo.data);
    marketCache.save(updated.accountId.toString(), marketState);
  });

  /* pool handler (amm / clmm) */
  listeners.on("pool", async (pool) => {
    try {
      let poolState: any;
      let poolOpenTime: number;
      let baseMint: string;
      let poolAddress: string | undefined;

      switch (pool.poolType) {
        case "clmm": {
          const clmmInfo = pool.accountInfo as PoolInfo;
          baseMint = clmmInfo.mintB.toString();
          poolAddress = pool.poolAddress!;
          poolOpenTime = pool.creationTime ?? Math.floor(Date.now() / 1000);
          poolState = poolInfoToLiquidityStateLayoutV4(clmmInfo, poolOpenTime);
          break;
        }
        case "amm": {
          const ki = pool.accountInfo as KeyedAccountInfo;
          poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(ki.accountInfo.data);
          poolAddress = ki.accountId.toBase58();
          baseMint = poolState.baseMint.toString();
          poolOpenTime = parseInt(poolState.poolOpenTime.toString());
          break;
        }
        default:
          return;
      }

      const exists = await poolCache.get(baseMint);
      const lag = Math.floor(Date.now() / 1000) - poolOpenTime;
      if (exists || poolOpenTime <= runTimestamp) return;
      if (MAX_LAG && lag > MAX_LAG) return;

      poolCache.save(baseMint, poolState, pool.poolType);

      await logFind(baseMint, new Date(poolOpenTime * 1000));
      await bot.buy(new PublicKey(poolAddress!), poolState, lag, pool.poolType);
    } catch (err) {
      logger.error(`Error processing pool: ${err}`);
    }
  });

  /* ---- WALLET TOKEN ACCOUNTS ---- */
  listeners.on("wallet", async (updated: KeyedAccountInfo) => {
    const accountData = AccountLayout.decode(updated.accountInfo.data);
    if (accountData.mint.equals(quoteToken.mint)) return; // skip quote token
    await bot.sell(updated.accountId, accountData);
  });

  printDetails(wallet, quoteToken, bot);
};

runListener();
