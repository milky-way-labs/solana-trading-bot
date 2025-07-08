import {
  LIQUIDITY_STATE_LAYOUT_V4,
  LiquidityPoolKeysV4,
  MAINNET_PROGRAM_ID,
  MARKET_STATE_LAYOUT_V3,
  Token,
} from '@raydium-io/raydium-sdk';
import bs58 from 'bs58';
import { Connection, Keypair, PartiallyDecodedInstruction, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { EventEmitter } from 'events';
import { createPoolKeys, getMinimalMarketV3, logger, PoolType } from '../helpers';
import { Raydium } from '@raydium-io/raydium-sdk-v2';

// Program ID per Raydium CLMM
const CLMM_PROGRAM_ID = new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');

export class Listeners extends EventEmitter {
  private subscriptions: number[] = [];

  constructor(private readonly connection: Connection) {
    super();
  }

  public async start(config: {
    walletPublicKey: PublicKey;
    quoteToken: Token;
    autoSell: boolean;
    cacheNewMarkets: boolean;
  }) {
    if (config.cacheNewMarkets) {
      const openBookSubscription = await this.subscribeToOpenBookMarkets(config);
      this.subscriptions.push(openBookSubscription);
    }

    // const raydiumAmmV4Subscription = await this.subscribeToRaydiumAmmV4Pools(config);
    // this.subscriptions.push(raydiumAmmV4Subscription);

    const raydiumClmmSubscription = await this.subscribeToRaydiumClmmPools(config);
    this.subscriptions.push(raydiumClmmSubscription);

    if (config.autoSell) {
      const walletSubscription = await this.subscribeToWalletChanges(config);
      this.subscriptions.push(walletSubscription);
    }
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

  private async subscribeToRaydiumAmmV4Pools(config: { quoteToken: Token }) {
    return this.connection.onProgramAccountChange(
      MAINNET_PROGRAM_ID.AmmV4,
      async (updatedAccountInfo) => {
        const ammV4PoolState = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
        const poolState = {
          baseMint: ammV4PoolState.baseMint,
          marketId: ammV4PoolState.marketId,
          openTime: parseInt(ammV4PoolState.poolOpenTime.toString()),
        }
        const market = await getMinimalMarketV3(this.connection, new PublicKey(ammV4PoolState.marketId), this.connection.commitment);
        const poolKeys: LiquidityPoolKeysV4 = createPoolKeys(updatedAccountInfo.accountId, ammV4PoolState, market);

        this.emit('pool', {
          poolState,
          poolKeys,
        });
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

  private async subscribeToRaydiumClmmPools(config: { quoteToken: Token }) {
    const LOG_TAGS = ["PoolCreatedEvent", "CreatePool"];

    return this.connection.onLogs(
      MAINNET_PROGRAM_ID.CLMM,
      async ({ logs, signature }) => {
        if (!LOG_TAGS.some((t) => logs.some((l) => l.includes(t)))) return;
        const tx = await this.connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
        if (!tx) return;
        const clmmIx = tx.transaction.message.instructions.find((ix) => ix.programId.equals(CLMM_PROGRAM_ID)) as
          | PartiallyDecodedInstruction
          | undefined;
        if (!clmmIx) return;

        const poolPk = clmmIx.accounts[2];
        const openTime = tx.blockTime ?? null;

        const raydium = await Raydium.load({
          connection: this.connection,
          owner: poolPk,
        });

        let clmmPoolInfo = null;

        try {
          clmmPoolInfo = await raydium.clmm.getPoolInfoFromRpc(poolPk.toString());
        } catch (e) {
          logger.error({ poolPublicKey: poolPk.toString() }, `Failed to retrieve clmm pool info`);
        }

        // Use Raydium helper to fetch and decode the pool directly from RPC
        if (!clmmPoolInfo) return;

        const { poolInfo, poolKeys } = clmmPoolInfo;
        console.log(poolInfo.mintA.address, poolInfo.mintB.address, config.quoteToken.mint.toString())
        if (poolInfo.mintA.address.toString() != config.quoteToken.mint.toString()) return;
        console.log(1)

        const poolState = {
          baseMint: new PublicKey(poolInfo.mintA.address),
          marketId: poolInfo.mintB.address,
          openTime,
          id: poolInfo.id,
        }

        this.emit('pool', {
          poolState,
          poolKeys,
        });
      },
      this.connection.commitment,
    );

    // return this.connection.onProgramAccountChange(
    //   MAINNET_PROGRAM_ID.CLMM,
    //   async (updatedAccountInfo) => {
    //     this.emit('pool', { poolType: PoolType.CLMM, updatedAccountInfo });
    //   },
    //   this.connection.commitment,
    //   [
    //     {
    //       memcmp: {
    //         offset: 73, // Offset per tokenMint0 nelle pool CLMM
    //         bytes: config.quoteToken.mint.toBase58(),
    //       },
    //     },
    //   ],
    // );
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

  public async stop() {
    for (let i = this.subscriptions.length; i >= 0; --i) {
      const subscription = this.subscriptions[i];
      await this.connection.removeAccountChangeListener(subscription);
      this.subscriptions.splice(i, 1);
    }
  }
}
