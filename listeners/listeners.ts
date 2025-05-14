import { LIQUIDITY_STATE_LAYOUT_V4, LIQUIDITY_STATE_LAYOUT_V5, MAINNET_PROGRAM_ID, MARKET_STATE_LAYOUT_V3, Token } from '@raydium-io/raydium-sdk';
import bs58 from 'bs58';
import { Commitment, Connection, PublicKey, SignatureStatus } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { EventEmitter } from 'events';
import { logger, parsePoolInfo, PoolInfoLayout } from '../helpers';
import { coder, IDL } from '@coral-xyz/anchor/dist/cjs/native/system';

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

    /* private async subscribeToRaydiumClmmPools(config: { quoteToken: Token }) {
      const commitment = this.connection.commitment || 'confirmed';
    
      return this.connection.onProgramAccountChange(
        MAINNET_PROGRAM_ID.CLMM,
        async (updatedAccountInfo) => {
          try {
            const raw = updatedAccountInfo.accountInfo.data;
            const parsed = ClmmPoolInfoLayout.decode(raw);
    
            this.emit('pool', {
              poolType: 'clmm',
              accountInfo: updatedAccountInfo,
              parsed,
            });
          } catch (err) {
            console.error('[CLMM PARSE ERROR]', err);
          }
        },
        commitment,
        [
          { dataSize: ClmmPoolInfoLayout.span },
          {
            memcmp: {
              offset: ClmmPoolInfoLayout.offsetOf('tokenMint0'),
              bytes: config.quoteToken.mint.toBase58(),
            },
          },
          {
            memcmp: {
              offset: ClmmPoolInfoLayout.offsetOf('status'),
              bytes: bs58.encode(Uint8Array.of(1)), // 1 = attiva
            },
          },
        ],
      );
    } */

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

    const LIQ_TAG = 'PoolCreatedEvent';
    const LIQ_TAG_2 = 'CreatePool';
    /* const tx = await this.connection.getParsedTransaction(
      '28Eqjpad1mL6BMLh432CedzN3atkc9LwXxHvA5VweYFfJfYPstj9oFysWed9n1LA4Z7zSPi5W2ogLcPsFumMH8NF',
      { maxSupportedTransactionVersion: 0 }
    );
    console.log(tx?.meta?.logMessages); */

    return this.connection.onLogs(
      MAINNET_PROGRAM_ID.CLMM,
      async ({ logs, signature }) => {
        
        if (logs.some(l => l.includes(LIQ_TAG) || l.includes(LIQ_TAG_2))) {
          logger.info(`add-liquidity ${signature}`)
          const status = await this.connection.getSignatureStatus(signature)
          
          if (!status.value.err) {
            const tx = await this.connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })
            if (tx) {
              // 1. Get status
              
              // 2. Get mint token (from instructions)
              let baseToken: string | undefined;
              let quoteToken: string | undefined;
              let mintTokenB: string | undefined;
              let mintTokenAddress: string | undefined;
              for (const ix of tx.transaction.message.instructions) {
                // Only look at parsed instructions
                if ('parsed' in ix && ix.parsed?.info?.mint) {
                  console.log(ix.parsed.info)
                  console.log(ix.parsed)
                  quoteToken = ix.parsed.info.mint;
                  baseToken = ix.parsed.info.account;
                  mintTokenB = ix.parsed.info.mintB
                  mintTokenAddress = ix.parsed.info.mintAddress
                  break;
                }
              }
              
              console.log('Status:', status);
              console.log('Mint token Address:', mintTokenAddress);
              // You can emit or use these as needed
              this.emit('add-liquidity', { signature, status, baseToken });
            }
            
          }
          else console.log('failed');
          
        }      
      },
      'confirmed'
    );
    return this.connection.onProgramAccountChange(
      MAINNET_PROGRAM_ID.CLMM,
      async (updatedAccountInfo) => {
        const buf = updatedAccountInfo.accountInfo.data;
        //const parsed = PoolInfoLayout.decode(buf);
        const parsed = parsePoolInfo(buf);
        // const parsed = parsePoolInfo(buf);
        /* logger.info(`Pool ${updatedAccountInfo.accountId.toBase58()}`);
        const isLive = parsed.status !== 0;
        const isStarted = parsed.startTime > 0;
        logger.info('poll time', parsed.startTime.toString()) */
        /* const hasLiquidity = parsed.liquidity > 0n;
        const hasPrice = parsed.sqrtPriceX64 > 0n; */
        this.emit('pool', { poolType: 'clmm', accountInfo: updatedAccountInfo });
        // logger.info(`Buffer size: ${updated.accountInfo.data.length}`);
        // logger.info(parsePoolInfo(updated.accountInfo.data));
      },
      commitment,
      [
        { dataSize: 1544 },
        {
          memcmp: {
            offset: PoolInfoLayout.offsetOf('mintA'),
            bytes: config.quoteToken.mint.toBase58(),
          },
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
