/* --------------------------------------------------------------------------
 * listeners.ts – uniforma l’evento "pool" per AMM & CLMM
 *  Restituisce sempre:
 *    {
 *      poolType: 'amm' | 'clmm',
 *      accountInfo: KeyedAccountInfo | any,   // parsed pool state
 *      poolAddress: string | null,
 *      creationTime: number | null
 *    }
 * ------------------------------------------------------------------------ */
import {
  LIQUIDITY_STATE_LAYOUT_V4,
  MAINNET_PROGRAM_ID,
  Token,
} from "@raydium-io/raydium-sdk";
import bs58 from "bs58";
import {
  Commitment,
  Connection,
  KeyedAccountInfo,
  PartiallyDecodedInstruction,
  PublicKey,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { EventEmitter } from "events";
import { logger, parsePoolInfo, PoolInfoLayout } from "../helpers";

/* -------------------- Program IDs -------------------- */
const LIQUIDITY_PROGRAM_ID_V4 = new PublicKey(
  "RVKd61ztZW9c7hSM1NJpC9td7VJg87ZhWjqtx5UxKsC",
);
const CLMM_PROGRAM_ID = MAINNET_PROGRAM_ID.CLMM;

export class Listeners extends EventEmitter {
  private subscriptions: number[] = [];

  constructor(private readonly connection: Connection) {
    super();
  }

  /* -------------------------- avvio --------------------------- */
  public async start(cfg: {
    walletPublicKey: PublicKey;
    quoteToken: Token;
    autoSell: boolean;
    cacheNewMarkets: boolean;
  }) {
    /* AMM subscription */
    // TODO: uncomment amm
    /* const ammSub = await this.subscribeToRaydiumPools(cfg);
    this.subscriptions.push(ammSub); */

    /* CLMM subscription */
    /* const clmmSub = await this.subscribeToClmmPools(cfg);
    this.subscriptions.push(clmmSub); */

    /* wallet */
    if (cfg.autoSell) {
      const wSub = await this.subscribeToWalletChanges({ walletPublicKey: cfg.walletPublicKey });
      this.subscriptions.push(wSub);
    }
  }

  /* -------------------- AMM v4 pools -------------------- */
  private async subscribeToRaydiumPools(cfg: { quoteToken: Token }) {
    return this.connection.onProgramAccountChange(
      LIQUIDITY_PROGRAM_ID_V4,
      (updated) => {
        this.emit("pool", {
          poolType: "amm",
          accountInfo: updated as KeyedAccountInfo,
          poolAddress: updated.accountId.toBase58(),
          creationTime: null,
        });
      },
      this.connection.commitment,
      [
        { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
        {
          memcmp: {
            offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
            bytes: cfg.quoteToken.mint.toBase58(),
          },
        },
      ],
    );
  }

  /* -------------------- CLMM pools -------------------- */
  private async subscribeToClmmPools(cfg: { quoteToken: Token }) {
    const commitment: Commitment = this.connection.commitment || "confirmed";
    const LOG_TAGS = ["PoolCreatedEvent", "CreatePool"];

    /* 1. onLogs per l'evento di creazione */
    const logSub = await this.connection.onLogs(
      CLMM_PROGRAM_ID,
      async ({ logs, signature }) => {
        if (!LOG_TAGS.some((t) => logs.some((l) => l.includes(t)))) return;

        const tx = await this.connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
        if (!tx) return;
        const clmmIx = tx.transaction.message.instructions.find(
          (ix) => ix.programId.equals(CLMM_PROGRAM_ID),
        ) as PartiallyDecodedInstruction | undefined;
        if (!clmmIx) return;

        const poolPk = clmmIx.accounts[2];
        const poolAddr = poolPk.toBase58();
        const creationTime = tx.blockTime ?? null;

        const accInfo = await this.connection.getAccountInfo(poolPk, commitment);
        if (!accInfo) return;
        const parsed = parsePoolInfo(accInfo.data);
        if (!parsed.mintA.equals(cfg.quoteToken.mint)) return;

        this.emit("pool", {
          poolType: "clmm",
          accountInfo: parsed,
          poolAddress: poolAddr,
          creationTime,
        });
      },
      "confirmed",
    );

    /* 2. Fallback su account-change */
    const accSub = await this.connection.onProgramAccountChange(
      CLMM_PROGRAM_ID,
      (updated) => {
        const parsed = parsePoolInfo(updated.accountInfo.data);
        if (!parsed.mintA.equals(cfg.quoteToken.mint)) return;

        this.emit("pool", {
          poolType: "clmm",
          accountInfo: parsed,
          poolAddress: updated.accountId.toBase58(),
          creationTime: null,
        });
      },
      commitment,
      [
        { dataSize: 1544 },
        {
          memcmp: {
            offset: PoolInfoLayout.offsetOf("mintA"),
            bytes: cfg.quoteToken.mint.toBase58(),
          },
        },
      ],
    );

    return accSub; // logSub gestito a parte
  }

  /* -------------------- WALLET -------------------- */
  private async subscribeToWalletChanges(cfg: { walletPublicKey: PublicKey }) {
    return this.connection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      (u) => this.emit("wallet", u),
      this.connection.commitment,
      [
        { dataSize: 165 },
        {
          memcmp: {
            offset: 32,
            bytes: cfg.walletPublicKey.toBase58(),
          },
        },
      ],
    );
  }

  /* -------------------- stop -------------------- */
  public async stop() {
    for (const sub of this.subscriptions) {
      await this.connection.removeAccountChangeListener(sub);
    }
    this.subscriptions = [];
  }
}
