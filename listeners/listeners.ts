import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID, MARKET_STATE_LAYOUT_V3, Token } from '@raydium-io/raydium-sdk';
import bs58 from 'bs58';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { EventEmitter } from 'events';
import { sha256 } from 'js-sha256';
import { Program } from '@coral-xyz/anchor';
import { CPMM_PROGRAM_ID, createCpSwapProgram, getPoolAccountSize } from '../utils/anchor-utils';

export class Listeners extends EventEmitter {
  private subscriptions: number[] = [];
  private cpSwapProgram: Program | null = null;

  constructor(private readonly connection: Connection) {
    super();
    // Inizializziamo il programma Anchor per CP-Swap
    this.cpSwapProgram = createCpSwapProgram(connection, undefined, 'confirmed');
  }

  public async start(config: {
    walletPublicKey: PublicKey;
    quoteToken: Token;
    autoSell: boolean;
    cacheNewMarkets: boolean;
    subscribeNewPools?: boolean; // Nuovo flag per sottoscriversi ai nuovi pool CP-Swap
  }) {
    if (config.cacheNewMarkets) {
      const openBookSubscription = await this.subscribeToOpenBookMarkets(config);
      this.subscriptions.push(openBookSubscription);
    }

    const raydiumSubscription = await this.subscribeToRaydiumPools(config);
    this.subscriptions.push(raydiumSubscription);

    if (config.autoSell) {
      const walletSubscription = await this.subscribeToWalletChanges(config);
      this.subscriptions.push(walletSubscription);
    }

    // Aggiungiamo la sottoscrizione ai nuovi pool CP-Swap
    if (config.subscribeNewPools) {
      const newPoolsSubscription = await this.subscribeToNewRaydiumPools(config);
      this.subscriptions.push(newPoolsSubscription);
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

  private async subscribeToRaydiumPools(config: { quoteToken: Token }) {
    return this.connection.onProgramAccountChange(
      MAINNET_PROGRAM_ID.AmmV4,
      async (updatedAccountInfo) => {
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

  private async subscribeToNewRaydiumPools(config: { quoteToken: Token }) {
    // Calcolo del discriminator corretto
    const rawDisc = sha256.digest('account:Pool').slice(0, 8);
    const poolDiscriminator = bs58.encode(Buffer.from(rawDisc));

    // Otteniamo la dimensione dell'account dinamicamente
    let poolAccountSize = 344; // Valore di fallback se il programma Anchor non è disponibile
    if (this.cpSwapProgram) {
      poolAccountSize = getPoolAccountSize(this.cpSwapProgram);
    }

    // Offset corretti basati sull'IDL
    const QUOTE_MINT_OFFSET = 8 + 1 + 32; // 41: discriminator(8) + nonce(1) + tokenA(32)
    const STATUS_OFFSET = 8 + 321;        // 329: discriminator(8) + offset di status(321)

    // Codifica status attivo (0) in base58
    const ACTIVE_STATUS = bs58.encode(Uint8Array.from([0])); // "1"

    return this.connection.onProgramAccountChange(
      CPMM_PROGRAM_ID,
      async (updatedAccountInfo) => {
        this.emit('newPool', updatedAccountInfo);
      },
      this.connection.commitment,
      [
        { dataSize: poolAccountSize },
        { memcmp: { offset: 0, bytes: poolDiscriminator } },
        { memcmp: { offset: QUOTE_MINT_OFFSET, bytes: config.quoteToken.mint.toBase58() } },
        { memcmp: { offset: STATUS_OFFSET, bytes: ACTIVE_STATUS } },
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
