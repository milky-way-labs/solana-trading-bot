/* --------------------------------------------------------------------------
 * bot.ts – FILE COMPLETO (definitivo)
 * Compatibile con Raydium AMM v4 e CLMM. Colla‑and‑go.
 * ------------------------------------------------------------------------ */
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Signer,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Clmm, ClmmFetcher } from '@raydium-io/raydium-sdk';

import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAccount,
  getAssociatedTokenAddress,
  RawAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Liquidity,
  LiquidityPoolKeysV4,
  LiquidityStateV4,
  Percent,
  Token,
  TokenAmount,
  TxVersion,
} from "@raydium-io/raydium-sdk";

import BN from 'bn.js';                       // se non c’era già

import { MarketCache, PoolCache, SnipeListCache } from "./cache";
import { PoolFilters } from "./filters";
import { TransactionExecutor } from "./transactions";
import {
  createPoolKeys,
  createClmmPoolInfo,
  KEEP_5_PERCENT_FOR_MOONSHOTS,
  logger,
  NETWORK,
  sleep,
} from "./helpers";
import { Semaphore } from "async-mutex";
import { WarpTransactionExecutor } from "./transactions/warp-transaction-executor";
import { JitoTransactionExecutor } from "./transactions/jito-rpc-transaction-executor";
import { BlacklistCache } from "./cache/blacklist.cache";
import { TradeSignals } from "./tradeSignals";
import { Messaging } from "./messaging";
import { WhitelistCache } from "./cache/whitelist.cache";
import { TechnicalAnalysisCache } from "./cache/technical-analysis.cache";
import { logBuy, logSell } from "./db";

export type PoolType = "amm" | "clmm";

/* --------------------- Config interfaccia --------------------- */
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
  telegramChatId: number;
  telegramThreadId: number;
  telegramBotToken: string,
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
/* ------------------------------------------------------------------- */
export class Bot {
  /* === campi & ctor invariati (vedi canvas precedente) === */
  /* ------------------------------------------------------- */
  private readonly snipeListCache?: SnipeListCache;
  private readonly blacklistCache?: BlacklistCache;
  private readonly whitelistCache?: WhitelistCache;
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
    this.tradeSignals = new TradeSignals(connection, config, this.messaging, technicalAnalysisCache);
    this.whitelistCache = new WhitelistCache();
    this.whitelistCache.init();
    this.blacklistCache = new BlacklistCache();
    this.blacklistCache.init();
    if (config.useSnipeList) {
      this.snipeListCache = new SnipeListCache();
      this.snipeListCache.init();
    }
    /* const api = new Api({
      endpoint: 'https://api.raydium.io',   // stesso che useresti a mano
      batchRequest: true,                   // abilita batching RPC/REST
      logger: console,                      // opzionale
      fetcher: fetch                        // opzionale (usa globalThis.fetch)
    });
    const raydium = new Raydium({
      connection,
      owner: this.config.wallet.publicKey,
      apiEndpoint: 'https://api.raydium.io', // default, puoi usare il tuo proxy
      accountCacheTime: 10_000,              // ms, cache interna account-info
      logger: console,                       // qualsiasi oggetto con .log/.error
    }); */
    
  }

  /* --------------- wallet validation --------------- */
  async validate() { /* invariato */
    try { await getAccount(this.connection, this.config.quoteAta, this.connection.commitment); } catch { return false; }
    return true;
  }

  /* ===== BUY dispatcher ================================================= */
  public async buy(accountId: PublicKey, poolState: any, lag = 0, poolType: PoolType = "amm") {
    return poolType === "amm"
      ? this.buyAmm(accountId, poolState as LiquidityStateV4, lag)
      : this.buyClmm(accountId);
  }

  // === WHITELIST AMM  ====================================================
  private async whitelistSnipeAmm(
    accountId: PublicKey,
    poolState: LiquidityStateV4,
  ): Promise<boolean> {
    if (this.whitelistCache.whitelistIsEmpty()) return false;

    // servono sia il market che l'ATA (come nel codice originale)
    const [market] = await Promise.all([
      this.marketStorage.get(poolState.marketId.toString()),
      getAssociatedTokenAddress(poolState.baseMint, this.config.wallet.publicKey),
    ]);

    const poolKeys: LiquidityPoolKeysV4 = createPoolKeys(accountId, poolState, market);

    // updateAuthority presente nella whitelist?
    return this.whitelistCache.isInList(this.connection, poolKeys);
  }

  /** wrapper di retro-compatibilità: il vecchio codice chiama whitelistSnipe */
  private whitelistSnipe(
    accountId: PublicKey,
    poolState: LiquidityStateV4,
  ): Promise<boolean> {
    return this.whitelistSnipeAmm(accountId, poolState);
  }


  /* ---------------- BUY – AMM (codice originale) ---------------- */
  private async buyAmm(accountId: PublicKey, poolState: LiquidityStateV4, lag: number) {
    logger.trace({ mint: poolState.baseMint }, `Processing new pool...`);

    const whitelistSnipe = await this.whitelistSnipeAmm(accountId, poolState);

    if (this.config.useSnipeList && !this.snipeListCache?.isInList(poolState.baseMint.toString())) {
      logger.debug({ mint: poolState.baseMint.toString() }, `Skipping buy because token is not in a snipe list`);
      return;
    }

    if (!whitelistSnipe) {
      if (this.config.autoBuyDelay > 0) {
        logger.debug({ mint: poolState.baseMint }, `Waiting for ${this.config.autoBuyDelay} ms before buy`); //  - (lag * 1000)
        await sleep(this.config.autoBuyDelay); //  - (lag * 1000)
      }
    }

    const numberOfActionsBeingProcessed =
      this.config.maxTokensAtTheTime - this.semaphore.getValue() + this.sellExecutionCount;
    if (this.semaphore.isLocked() || numberOfActionsBeingProcessed >= this.config.maxTokensAtTheTime) {
      logger.debug(
        { mint: poolState.baseMint.toString() },
        `Skipping buy because max tokens to process at the same time is ${this.config.maxTokensAtTheTime} and currently ${numberOfActionsBeingProcessed} tokens is being processed`,
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

          const match = await this.filterMatch(poolKeys);

          if (!match) {
            logger.trace({ mint: poolKeys.baseMint.toString() }, `Skipping buy because pool doesn't match filters`);
            return;
          }
        }

        let buySignal = await this.tradeSignals.waitForBuySignal(poolKeys);

        if (!buySignal) {
          await this.messaging.sendTelegramMessage(`😭Skipping buy signal😭\n\nMint <code>${poolKeys.baseMint.toString()}</code>`, poolState.baseMint.toString())

          logger.trace({ mint: poolKeys.baseMint.toString() }, `Skipping buy because buy signal not received`);
          return;
        }
      }

      const startTime = Date.now();
      for (let i = 0; i < this.config.maxBuyRetries; i++) {
        try {

          if ((Date.now() - startTime) > this.config.maxBuyDuration) {
            logger.info(`Not buying mint ${poolState.baseMint.toString()}, max buy ${this.config.maxBuyDuration/1000} sec timer exceeded!`);
            return;
          }

          logger.info(
            { mint: poolState.baseMint.toString() },
            `Send buy transaction attempt: ${i + 1}/${this.config.maxBuyRetries}`,
          );
          const tokenOut = new Token(TOKEN_PROGRAM_ID, poolKeys.baseMint, poolKeys.baseDecimals);
          const result = await this.swapAmm(
            poolKeys,
            this.config.quoteAta,
            mintAta,
            this.config.quoteToken,
            tokenOut,
            this.config.quoteAmount,
            this.config.buySlippage,
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

            await this.messaging.sendTelegramMessage(`💚Confirmed buy💚\n\nMint <code>${poolKeys.baseMint.toString()}</code>\nSignature <code>${result.signature}</code>`, poolState.baseMint.toString())
            await logBuy(poolKeys.baseMint.toString());
            break;
          }

          logger.info(
            {
              mint: poolState.baseMint.toString(),
              signature: result.signature,
              error: result.error,
            },
            `Error confirming buy tx`,
          );
        } catch (error) {
          logger.debug({ mint: poolState.baseMint.toString(), error }, `Error confirming buy transaction`);
        }
      }
    } catch (error) {
      logger.error({ mint: poolState.baseMint.toString(), error }, `Failed to buy token`);
    } finally {
      this.semaphore.release();
    }
  }

  /* ---------------- BUY – CLMM ---------------- */
  // -----------------------------------------------------------------
  // compra token nuovo spendendo quoteToken
  // -----------------------------------------------------------------
  /* ---------------- BUY – CLMM ---------------- */
private async buyClmm(poolId: PublicKey) {
  /* 1.             scope ------------------------------------------------ */
  const raydium = await Raydium.load({
    connection: this.connection,
    owner:      this.config.wallet,      // Keypair => firma locale
  });

  /* 2.            dati pool -------------------------------------------- */
  const poolInfo = await raydium.clmm.getRpcClmmPoolInfo({ poolId });
  const poolKeys     = await raydium.clmm.getClmmPoolKeys(poolId.toBase58());
  const baseMintPk   = poolKeys.mintB.address;               // PublicKey

  /* snipe-list ---------------------------------------------------------- */
  if (this.config.useSnipeList &&
      this.snipeListCache &&
      !this.snipeListCache.isInList(baseMintPk.toString())) return;

  /* 3.            swap -------------------------------------------------- */
  const { transaction, signers } = await raydium.clmm.swap({
    poolInfo,
    inputMint: this.config.quoteToken.mint,
    amountIn:  this.config.quoteAmount.raw,       // BN
    amountOutMin: new BN(0),
    observationId: poolInfo.observationId,        // ✅ PublicKey
    ownerInfo:   { feePayer: this.config.wallet.publicKey },
    remainingAccounts: [],
    txVersion: TxVersion.LEGACY,                  // ✅ enum → sempre Versioned
  });

  /* 4.            sign & send ------------------------------------------ */
  const vt = transaction as VersionedTransaction;         // cast sicuro
  vt.sign([this.config.wallet, ...(signers as Signer[])]); // ✅ cast Signer[]
  const res = await this.txExecutor.executeAndConfirm(
    vt,
    this.config.wallet,
    await this.connection.getLatestBlockhash()
  );

  if (res.confirmed) {
    logger.info({ sig: res.signature, mint: baseMintPk.toBase58() }, 'CLMM buy confirmed');
    await logBuy(baseMintPk.toBase58());
  }
}



  /* ===== SELL dispatcher ================================================= */
  public async sell(accountId: PublicKey, rawAccount: RawAccount) {
    const pd = await this.poolStorage.get(rawAccount.mint.toString());
    if (!pd) return;
    return pd.poolType === "clmm"
      ? this.sellClmm(accountId, rawAccount, pd)
      : this.sellAmm(accountId, rawAccount, pd);
  }

  /* ---------------- SELL – AMM (codice originale) ---------------- */
  private async sellAmm(accountId: PublicKey, rawAccount: RawAccount, poolData: any) {
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
          if (i < 1) { // Only check for sell signal on first attempt, not on retries
            const shouldSell = await this.tradeSignals.waitForSellSignal(tokenAmountIn, poolKeys);

            if (!shouldSell) {
              this.poolStorage.markAsSold(rawAccount.mint.toString());
              return;
            }
          }

          if (KEEP_5_PERCENT_FOR_MOONSHOTS) { //only if you aim for the moon
            this.poolStorage.markAsSold(rawAccount.mint.toString());
          }

          logger.info(
            { mint: rawAccount.mint },
            `Send sell transaction attempt: ${i + 1}/${this.config.maxSellRetries}`,
          );

          const result = await this.swapAmm(
            poolKeys,
            accountId,
            this.config.quoteAta,
            tokenIn,
            this.config.quoteToken,
            tokenAmountIn,
            this.config.sellSlippage,
            'sell',
          );

          if (result.confirmed) {

            try {
              this.connection.getParsedTransaction(result.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 })
                .then(async (parsedConfirmedTransaction) => {
                  if (parsedConfirmedTransaction) {
                    let preTokenBalances = parsedConfirmedTransaction.meta.preTokenBalances;
                    let postTokenBalances = parsedConfirmedTransaction.meta.postTokenBalances;

                    // Filter for WSOL mint and your public key
                    let pre = preTokenBalances
                      .filter(x => x.mint === this.config.quoteToken.mint.toString() && x.owner === this.config.wallet.publicKey.toString())
                      .map(x => x.uiTokenAmount.uiAmount)
                      .reduce((a, b) => a + b, 0); // Sum the pre values

                    let post = postTokenBalances
                      .filter(x => x.mint === this.config.quoteToken.mint.toString() && x.owner === this.config.wallet.publicKey.toString())
                      .map(x => x.uiTokenAmount.uiAmount)
                      .reduce((a, b) => a + b, 0); // Sum the post values

                    let quoteAmountNumber = parseFloat(this.config.quoteAmount.toFixed());
                    let profitOrLoss = (post - pre) - quoteAmountNumber;
                    let percentageChange = (profitOrLoss / quoteAmountNumber) * 100

                    await this.messaging.sendTelegramMessage(`⭕Confirmed sale at <b>${(post - pre).toFixed(5)}</b>⭕\n\n${profitOrLoss < 0 ? "🔴Loss " : "🟢Profit "}<code>${profitOrLoss.toFixed(5)} ${this.config.quoteToken.symbol} (${(percentageChange).toFixed(2)}%)</code>\n\nRetries <code>${i + 1}/${this.config.maxSellRetries}</code>`, rawAccount.mint.toString());
                    await logSell(rawAccount.mint.toString(), percentageChange);
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

  /* ---------------- SELL – CLMM ---------------- */
  // -----------------------------------------------------------------
  // vende token nuovo ricevendo quoteToken
  // -----------------------------------------------------------------
  private async sellClmm(accountId: PublicKey, rawAccount: RawAccount, poolData: any) {
    const poolPk   = new PublicKey(poolData.id);
    const raydium = await Raydium.load({
      connection: this.connection,                    // obbligatorio
      owner: this.config.wallet.publicKey,                 // Keypair  ⇒ firmerai localmente
    });
    const poolInfo = await raydium.clmm.getRpcClmmPoolInfo({ poolId: accountId.toBase58() });
    const poolKeys = await raydium.clmm.getClmmPoolKeys(accountId.toBase58());

    const tokenIn       = new Token(TOKEN_PROGRAM_ID, rawAccount.mint, poolKeys.mintB.decimals);
    const tokenAmountIn = new TokenAmount(tokenIn, rawAccount.amount, true);
    if (tokenAmountIn.isZero()) return;

    const slippageBps = Math.round(this.config.sellSlippage * 100);

    /* swap fixed-in (spendo tokenIn, ricevo quote >= min) ------------------- */
    const { transaction, signers } = await raydium.clmm.swap({
      poolInfo: poolInfo,
      poolKeys: poolKeys,
      inputMint: rawAccount.mint,                     // token che vendo
      amountIn: tokenAmountIn.raw,
      amountOutMin: new BN(0),                       // slippage gestito dal client
      observationId: poolKeys.id,
      ownerInfo: { feePayer: this.config.wallet.publicKey },
      remainingAccounts: [],
      txVersion: 'legacy',
      computeBudgetConfig: {
        units: this.config.unitLimit,
        microLamports: this.config.unitPrice,
      },
    });

    transaction.sign([this.config.wallet, ...signers]);
    const res = await this.txExecutor.executeAndConfirm(
      transaction,
      this.config.wallet,
      await this.connection.getLatestBlockhash(),
    );

    if (res.confirmed) {
      await logSell(rawAccount.mint.toString(), 0);         // profit calcolato altrove
      logger.info({ sig: res.signature, mint: rawAccount.mint.toString() }, 'CLMM sell confirmed');
    }
  }


  /* ===== helper SWAP per AMM (originale) ================================= */
  private async swapAmm(
    poolKeys: LiquidityPoolKeysV4,
    ataIn: PublicKey,
    ataOut: PublicKey,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: TokenAmount,
    slippage: number,
    direction: "buy" | "sell",
  ) {
    const poolInfo = await Liquidity.fetchInfo({ connection: this.connection, poolKeys });
    const { minAmountOut } = Liquidity.computeAmountOut({
      poolKeys,
      poolInfo,
      amountIn,
      currencyOut: tokenOut,
      slippage: new Percent(slippage, 100),
    });
    const latest = await this.connection.getLatestBlockhash();
    const { innerTransaction } = Liquidity.makeSwapFixedInInstruction({
      poolKeys,
      userKeys: { tokenAccountIn: ataIn, tokenAccountOut: ataOut, owner: this.config.wallet.publicKey },
      amountIn: amountIn.raw,
      minAmountOut: minAmountOut.raw,
    }, poolKeys.version);

    const msg = new TransactionMessage({
      payerKey: this.config.wallet.publicKey,
      recentBlockhash: latest.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: this.config.unitPrice }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: this.config.unitLimit }),
        ...(direction === "buy" ? [
          createAssociatedTokenAccountIdempotentInstruction(this.config.wallet.publicKey, ataOut, this.config.wallet.publicKey, tokenOut.mint),
        ] : []),
        ...innerTransaction.instructions,
        ...(direction === "sell" && !KEEP_5_PERCENT_FOR_MOONSHOTS ? [
          createCloseAccountInstruction(ataIn, this.config.wallet.publicKey, this.config.wallet.publicKey),
        ] : []),
      ],
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    tx.sign([this.config.wallet, ...innerTransaction.signers]);
    return this.txExecutor.executeAndConfirm(tx, this.config.wallet, latest);
  }

  /* ===== FILTER MATCH (originale) ====================================== */
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
            logger.debug(
              { mint: poolKeys.baseMint.toString() },
              `Filter match ${matchCount}/${this.config.consecutiveMatchCount}`,
            );
            return true;
          }
        } else {
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

    return false;
  }
}