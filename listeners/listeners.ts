import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID, MARKET_STATE_LAYOUT_V3, Token } from '@raydium-io/raydium-sdk';
import bs58 from 'bs58';
import { Commitment, Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { EventEmitter } from 'events';
import { logger, parsePoolInfo, PoolInfoLayout } from '../helpers';

// Program IDs
const CPMM_PROGRAM_ID = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
const CLMM_PROGRAM_ID = new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');

// Layout e costanti per CP-Swap
interface PoolStateLayout {
  status: number;
  padding1: Uint8Array;
  baseMint: Uint8Array;
  quoteMint: Uint8Array;
  openTime: bigint;
}

// Offset conosciuti per quote_mint basati su osservazioni reali
const QUOTE_MINT_OFFSETS = [
  48, // offset comune per account di 637 bytes
  128, // offset alternativo osservato
  168, // offset confermato per SOL
  256, // offset alternativo osservato
  512, // offset alternativo osservato
];

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
    // if (config.cacheNewMarkets) {
    //   const openBookSubscription = await this.subscribeToOpenBookMarkets(config);
    //   this.subscriptions.push(openBookSubscription);
    // }

    // Legacy AMM v4 pools
    // const raydiumSubscription = await this.subscribeToRaydiumPools(config);
    // this.subscriptions.push(raydiumSubscription);

    // CP-Swap pools (new Standard AMM)
    // const cpSwapSubscription = await this.subscribeToCPSwapPools(config);
    // this.subscriptions.push(cpSwapSubscription);

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

  /**
   * Sottoscrizione ai pool Raydium CP-Swap (Standard AMM)
   * Utilizza una strategia adattiva per trovare pool con il quoteMint desiderato,
   * indipendentemente dal layout esatto dell'account.
   */
  private async subscribeToCPSwapPools(config: { quoteToken: Token }) {
    logger.info(
      `Subscribing to Raydium CP-Swap pools for ${config.quoteToken.symbol || config.quoteToken.mint.toBase58()}`,
    );
    logger.info(`Using CP-Swap Program ID: ${CPMM_PROGRAM_ID.toBase58()}`);

    // Manteniamo un registro degli account già elaborati per evitare duplicati
    const processedAccounts = new Set<string>();

    // Pre-decodifica del quoteMint target per la ricerca
    const targetQuoteMintBytes = bs58.decode(config.quoteToken.mint.toBase58());

    return this.connection.onProgramAccountChange(
      CPMM_PROGRAM_ID,
      async (updatedAccountInfo) => {
        const accountId = updatedAccountInfo.accountId.toBase58();

        try {
          // Evitiamo di elaborare più volte lo stesso account
          if (processedAccounts.has(accountId)) {
            return;
          }

          const accountData = updatedAccountInfo.accountInfo.data;
          const dataSize = accountData.length;

          // 1. Strategia basata su offset conosciuti
          for (const offset of QUOTE_MINT_OFFSETS) {
            if (dataSize >= offset + 32) {
              const quoteMintBytes = accountData.slice(offset, offset + 32);
              const quoteMintBase58 = bs58.encode(quoteMintBytes);

              // Se sembra un indirizzo valido, controlliamo se corrisponde
              if (quoteMintBase58.length >= 32) {
                if (quoteMintBase58 === config.quoteToken.mint.toBase58()) {
                  logger.debug(`Found CP-Swap pool with matching quoteMint at offset ${offset}! Account: ${accountId}`);
                  this.emit('pool', updatedAccountInfo);
                  processedAccounts.add(accountId);
                  return;
                }
              }
            }
          }

          // 2. Strategia di scansione buffer ottimizzata
          // Usa un intervallo più breve per i primi 200 bytes (più probabile trovare il quoteMint)
          // e un intervallo più ampio per il resto dell'account
          let i = 0;
          while (i <= accountData.length - 32) {
            // Intervallo di scansione adattivo
            const checkInterval = i < 200 ? 1 : 4;

            // Controllo rapido del primo byte prima di fare un controllo completo
            if (accountData[i] === targetQuoteMintBytes[0]) {
              let match = true;
              for (let j = 0; j < 32; j++) {
                if (accountData[i + j] !== targetQuoteMintBytes[j]) {
                  match = false;
                  break;
                }
              }

              if (match) {
                logger.debug(`Found CP-Swap pool with quoteMint at offset ${i}! Account: ${accountId}`);
                this.emit('pool', updatedAccountInfo);
                processedAccounts.add(accountId);
                return;
              }
            }

            i += checkInterval;
          }
        } catch (error) {
          logger.error(`Error analyzing CP-Swap account ${accountId}: ${error}`);
        }
      },
      this.connection.commitment,
      [], // Nessun filtro iniziale - analyziamo tutti gli account del programma
    );
  }

  private async subscribeToClmmPools(config: { quoteToken: Token }) {
    const commitment: Commitment = this.connection.commitment || 'confirmed';

    return this.connection.onProgramAccountChange(
      CLMM_PROGRAM_ID,
      async (updatedAccountInfo) => {
        this.emit('pool', { poolType: 'clmm', accountInfo: updatedAccountInfo });
        logger.info(updatedAccountInfo.accountId.toString());
        logger.info(updatedAccountInfo.accountInfo.data .signature.toString());
        // logger.info(`Buffer size: ${updated.accountInfo.data.length}`);
        // logger.info(parsePoolInfo(updated.accountInfo.data));
      },
      commitment,
      [
        {
          dataSize: 1544,
        },
        {
          memcmp: {
            offset: PoolInfoLayout.offsetOf('mintA'),
            bytes: config.quoteToken.mint.toBase58(),
          },
        },
        {
          memcmp: {
            offset: PoolInfoLayout.offsetOf('status'),
            bytes: bs58.encode(Uint8Array.of(0)),
          },
        },
        {
          memcmp: {
            offset: PoolInfoLayout.offsetOf('startTime'),
            bytes: bs58.encode(Buffer.alloc(8))
          }
        },
      ],
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
