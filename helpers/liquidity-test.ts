import { PublicKey } from '@solana/web3.js';
import { Liquidity, LiquidityPoolKeys, LiquidityStateV4, MAINNET_PROGRAM_ID, Market } from '@raydium-io/raydium-sdk';
import { MinimalMarketLayoutV3 } from './market';
import * as puppeteer from 'puppeteer';

export function createPoolKeys(
  id: PublicKey,
  accountData: LiquidityStateV4,
  minimalMarketLayoutV3: MinimalMarketLayoutV3,
): LiquidityPoolKeys {
  return {
    id,
    baseMint: accountData.baseMint,
    quoteMint: accountData.quoteMint,
    lpMint: accountData.lpMint,
    baseDecimals: accountData.baseDecimal.toNumber(),
    quoteDecimals: accountData.quoteDecimal.toNumber(),
    lpDecimals: 5,
    version: 4,
    programId: MAINNET_PROGRAM_ID.AmmV4,
    authority: Liquidity.getAssociatedAuthority({
      programId: MAINNET_PROGRAM_ID.AmmV4,
    }).publicKey,
    openOrders: accountData.openOrders,
    targetOrders: accountData.targetOrders,
    baseVault: accountData.baseVault,
    quoteVault: accountData.quoteVault,
    marketVersion: 3,
    marketProgramId: accountData.marketProgramId,
    marketId: accountData.marketId,
    marketAuthority: Market.getAssociatedAuthority({
      programId: accountData.marketProgramId,
      marketId: accountData.marketId,
    }).publicKey,
    marketBaseVault: accountData.baseVault,
    marketQuoteVault: accountData.quoteVault,
    marketBids: minimalMarketLayoutV3.bids,
    marketAsks: minimalMarketLayoutV3.asks,
    marketEventQueue: minimalMarketLayoutV3.eventQueue,
    withdrawQueue: accountData.withdrawQueue,
    lpVault: accountData.lpVault,
    lookupTableAccount: PublicKey.default,
  };
}

interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export async function extractInitialUsdcAmount(tokenAddress: string, proxy?: ProxyConfig): Promise<number | null> {
  let browser: puppeteer.Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        ...(proxy ? [`--proxy-server=${proxy.server}`] : []),
      ],
    });

    const page = await browser.newPage();
    
    // Imposta un timeout più lungo per le operazioni di rete
    page.setDefaultTimeout(45000);
    page.setDefaultNavigationTimeout(45000);

    if (proxy?.username && proxy.password) {
      await page.authenticate({ username: proxy.username, password: proxy.password });
    }

    await page.setViewport({ width: 1920, height: 1080 });
    const url = `https://solscan.io/token/${tokenAddress}?activity_type=ACTIVITY_TOKEN_ADD_LIQ#defiactivities`;
    
    console.debug(`Caricamento pagina: ${url}`);
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', // Meno restrittivo di networkidle2
      timeout: 45000 
    });

    // Attendi che la tabella sia presente con timeout più lungo
    try {
      await page.waitForSelector('table tr', { timeout: 45000 });
    } catch (timeoutError) {
      console.debug('Timeout durante l\'attesa della tabella, tentativo di continuare...');
      // Prova a vedere se la pagina ha caricato comunque qualche contenuto
      const hasTable = await page.$('table');
      if (!hasTable) {
        throw new Error('Nessuna tabella trovata nella pagina dopo il timeout');
      }
    }

    const tableData = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table tr')).map(row =>
        Array.from(row.querySelectorAll('td')).map(td => td.textContent?.trim() || '')
      );
    });

    console.debug(`Trovate ${tableData.length} righe nella tabella`);

    // Trova la riga contenente "WSOL"
    const wsolRow = tableData.find(cells => cells.some(cell => /WSOL/.test(cell)));
    if (!wsolRow) {
      console.debug('Nessuna riga con WSOL trovata, il token potrebbe essere troppo nuovo');
      return null; // Ritorna null invece di lanciare errore
    }

    // Estrai la cella con il valore in USDC (che contiene `$`)
    const usdcCell = wsolRow.find(cell => /\$\d/.test(cell));
    if (!usdcCell) {
      console.debug('Nessuna cella contenente USDC trovata nella riga WSOL');
      return null; // Ritorna null invece di lanciare errore
    }

    // Applica regex per isolare il numero
    const match = usdcCell.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (!match) {
      console.debug(`Formato valore USDC non valido: ${usdcCell}`);
      return null; // Ritorna null invece di lanciare errore
    }

    // Rimuovi virgole e trasforma in float
    const usdcAmount = parseFloat(match[1].replace(/,/g, ''));
    console.debug(`Valore USDC estratto: ${usdcAmount}`);
    return usdcAmount;
  } catch (error) {
    console.error(`Errore durante l'estrazione del valore USDC: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    if (browser) {
      try {
        console.debug('Chiusura del browser...');
        await browser.close();
      } catch (closeError) {
        console.error('Errore durante la chiusura del browser:', closeError);
      }
    }
  }
}
