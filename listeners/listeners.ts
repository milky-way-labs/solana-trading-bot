import { LIQUIDITY_STATE_LAYOUT_V4, LIQUIDITY_STATE_LAYOUT_V5, MAINNET_PROGRAM_ID, MARKET_STATE_LAYOUT_V3, Token } from '@raydium-io/raydium-sdk';
import bs58 from 'bs58';
import { Commitment, Connection, PartiallyDecodedInstruction, PublicKey, SignatureStatus } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { EventEmitter } from 'events';
import { logger, parsePoolInfo, PoolInfoLayout, QUOTE_MINT } from '../helpers';
import { coder, IDL } from '@coral-xyz/anchor/dist/cjs/native/system';
import { log } from 'console';

export class Listeners extends EventEmitter {
  private subscriptions: number[] = [];
  private startTimestamp: number;

  constructor(private readonly connection: Connection) {
    super();
    this.startTimestamp = Date.now() / 1000; // Unix timestamp in secondi
  }

  /**
   * Inizializza e avvia tutti i listener necessari
   */
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

    // Legacy AMM v4 pools
    // const raydiumSubscription = await this.subscribeToRaydiumPools(config);
    // this.subscriptions.push(raydiumSubscription);

    // CP-Swap pools (new Standard AMM)
    const clmmSubscription = await this.subscribeToClmmPools(config);
    console.log(clmmSubscription);
    this.subscriptions.push(clmmSubscription);

    if (config.autoSell) {
      const walletSubscription = await this.subscribeToWalletChanges(config);
      this.subscriptions.push(walletSubscription);
    }
  }

  /**
   * Sottoscrizione agli OpenBook Markets
   */
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

  /**
   * Sottoscrizione ai pool Raydium AMM v4 (Legacy)
   */
  private async subscribeToRaydiumPools(config: { quoteToken: Token }) {
    return this.connection.onProgramAccountChange(
      MAINNET_PROGRAM_ID.AmmV4,
      async (updatedAccountInfo) => {
        this.emit('pool', { poolType: 'amm', ...updatedAccountInfo });
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

  private async subscribeToClmmPools(config: { quoteToken: Token }) {
    const commitment: Commitment = this.connection.commitment || 'confirmed';

    const LIQ_TAG = 'PoolCreatedEvent';
    const LIQ_TAG_2 = 'CreatePool';

    return this.connection.onLogs(
      MAINNET_PROGRAM_ID.CLMM,
      async ({ logs, signature }) => {
        if (logs.some(l => l.includes(LIQ_TAG) || l.includes(LIQ_TAG_2))) {
          logger.info(`add-liquidity ${signature}`)
          const status = await this.connection.getSignatureStatus(signature)
          
          if (!status.value.err) {
            const tx = await this.connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })

            if (tx) {
                const clmmIx = tx.transaction.message.instructions.find(
                  ix => ix.programId.equals(MAINNET_PROGRAM_ID.CLMM)
                ) as PartiallyDecodedInstruction | undefined;
    
                /*
                  0  = pool_creator      (payer)
                  1  = amm_config
                  2  = pool_state
                  3  = token_mint_0
                  4  = token_mint_1
                  5  = token_vault_0
                  6  = token_vault_1
                */
                let creationTime = tx.blockTime;
                if (clmmIx) {
                  // indice 2 nella lista di account dell'istruzione
                  const poolPubkey = clmmIx.accounts[2]; // Use account directly instead of using as index
                  const poolAddressStr = poolPubkey.toBase58();
                  const poolInfo = await this.connection.getAccountInfo(poolPubkey)
                  const data = parsePoolInfo(poolInfo.data)
                  logger.info(`poolState data ${data.mintA} ${data.mintB}`);
                  logger.info(`NUOVA CLMM POOL → ${poolAddressStr}`);

                  if (data.mintA.toBase58() == 'So11111111111111111111111111111111111111112')
                    this.emit('pool', {poolType: 'clmm', accountInfo: data, poolAddress: poolAddressStr, creationTime: creationTime});
                  else
                  logger.info(`Mint not equal to QUOTE_MINT ${data.mintA.toBase58()}`)
                }
              // You can emit or use these as needed
              
            }
            
          }
          else logger.warn('failed');
          
        }      
      },
      'confirmed'
    );
  }

  /**
   * Sottoscrizione ai cambiamenti del wallet
   */
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

  /**
   * Arresta tutti i listener
   */
  public async stop() {
    for (let i = this.subscriptions.length; i >= 0; --i) {
      const subscription = this.subscriptions[i];
      await this.connection.removeAccountChangeListener(subscription);
      this.subscriptions.splice(i, 1);
    }
  }
}
