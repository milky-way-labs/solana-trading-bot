import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID, MARKET_STATE_LAYOUT_V3, Token } from '@raydium-io/raydium-sdk';
import bs58 from 'bs58';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { EventEmitter } from 'events';
import { sha256 } from 'js-sha256';
import { logger } from '../helpers';

// Definisco direttamente le costanti che servono
const CPMM_PROGRAM_ID = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');

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

    const raydiumSubscription = await this.subscribeToRaydiumPools(config);
    this.subscriptions.push(raydiumSubscription);

    const newPoolsSubscription = await this.subscribeToNewRaydiumPools(config);
    this.subscriptions.push(newPoolsSubscription);

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

  private async subscribeToNewRaydiumPools(config: { quoteToken: Token }) {
    logger.debug('Subscribing to new Raydium CP-Swap pools (base)');

    // Calcolo del discriminator corretto per l'account "Pool"
    const rawDisc = sha256.digest('account:Pool').slice(0, 8);
    const poolDiscriminator = bs58.encode(Buffer.from(rawDisc));

    // Dimensione corretta dell'account Pool: 8 (discriminator) + 363 (struct) = 371
    const POOL_ACCOUNT_SIZE = 371;

    logger.debug(`Using CP-Swap Program ID: ${CPMM_PROGRAM_ID.toBase58()}`);
    logger.debug(`Using Pool Account Size: ${POOL_ACCOUNT_SIZE}`);
    logger.debug(`Using Pool Discriminator (base58): ${poolDiscriminator}`);

    return this.connection.onProgramAccountChange(
      CPMM_PROGRAM_ID,
      async (updatedAccountInfo) => {
        // Log trovato, potenziale pool CP-Swap
        logger.debug(`Received potential CP-Swap pool update for account: ${updatedAccountInfo.accountId.toBase58()}`);
        this.emit('pool', updatedAccountInfo); // Emetto sempre 'pool' per uniformità
      },
      this.connection.commitment,
      [
        { dataSize: POOL_ACCOUNT_SIZE },
        { memcmp: { offset: 0, bytes: poolDiscriminator } },
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

  public async stop() {
    for (let i = this.subscriptions.length; i >= 0; --i) {
      const subscription = this.subscriptions[i];
      await this.connection.removeAccountChangeListener(subscription);
      this.subscriptions.splice(i, 1);
    }
  }
}
