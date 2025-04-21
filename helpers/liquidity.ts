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

/**
 * Estrae la quantità di WSOL depositata per un token specificato
 * @param tokenAddress Indirizzo del token Solana da analizzare
 * @param proxy Configurazione proxy opzionale
 * @returns La quantità di WSOL come numero o null se non trovato
 */
export async function extractInitialUsdcAmount(tokenAddress: string, proxy?: ProxyConfig): Promise<number | null> {
  console.debug('Inizializzazione del browser...');

  // Configurazione del browser con supporto proxy
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080'];

  // Aggiunge configurazione proxy se specificata
  if (proxy) {
    if (proxy.username && proxy.password) {
      args.push(`--proxy-server=${proxy.server}`);
    } else {
      args.push(`--proxy-server=${proxy.server}`);
    }
  }

  const browser = await puppeteer.launch({
    headless: true,
    args,
  });

  try {
    // Costruzione dell'URL con l'indirizzo del token
    const url = `https://solscan.io/token/${tokenAddress}?activity_type=ACTIVITY_TOKEN_ADD_LIQ#defiactivities`;
    console.debug(`Accesso a: ${url}`);

    // Apertura della pagina
    const page = await browser.newPage();

    // Imposta autenticazione proxy se necessario
    if (proxy && proxy.username && proxy.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password,
      });
    }

    await page.setViewport({ width: 1920, height: 1080 });

    // Imposta un timeout ragionevole per il caricamento della pagina
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Attesa per il caricamento della pagina
    console.debug('Attesa per il caricamento della pagina...');
    await new Promise((resolve) => setTimeout(resolve, 4000));

    console.debug('Cercando la quantità di WSOL nella tabella...');

    // Ottieni una mappa dettagliata della struttura della tabella per debug
    const tableStructure = await page.evaluate(() => {
      const result: { rowIndex: number; data: string[] }[] = [];
      const rows = document.querySelectorAll('table tr');

      rows.forEach((row, rowIndex) => {
        if ((row.textContent || '').includes('WSOL')) {
          const cells = row.querySelectorAll('td');
          const cellsData: string[] = [];

          cells.forEach((cell) => {
            cellsData.push(cell.textContent?.trim() || '');
          });

          result.push({
            rowIndex,
            data: cellsData,
          });
        }
      });

      return result;
    });

    console.debug('Struttura dettagliata delle righe con WSOL:');
    console.debug(JSON.stringify(tableStructure, null, 2));

    const rawUsdcValue = tableStructure[0]['data'][6];
    if (!rawUsdcValue) {
      console.log('Prezzo non trovato');
      throw new Error('USDC non trovato');
    }

    let usdcAmount = null;

    const regex = /\$(\d+(?:,\d{3})*(?:\.\d{2})?)/;
    const match = tableStructure[0]['data'][6].match(regex);
    if (match) {
      const valoreStr = match[1];            // '13.95'
      usdcAmount = parseFloat(valoreStr.replace(/,/g, '')); // 13.95
    } else {
      console.log('Prezzo non trovato');
      throw new Error('USDC non trovato');
    }

    console.debug('Liquidita aggiunta in USDC:');
    console.debug(usdcAmount);

    return usdcAmount;

    // // Analizziamo la struttura per trovare il valore corretto
    // // Strategia 1: Cerca specificamente nella colonna Amount
    // const wsolAmount = await page.evaluate(() => {
    //   const rows = document.querySelectorAll('table tr');
    //   let wsolValue: number | null = null;
    //
    //   // Trova l'indice dell'intestazione Amount
    //   let amountColumnIndex = -1;
    //   const headers = document.querySelectorAll('th');
    //   headers.forEach((header, index) => {
    //     if ((header.textContent || '').includes('Amount')) {
    //       amountColumnIndex = index;
    //     }
    //   });
    //
    //   // Se abbiamo trovato l'indice della colonna Amount
    //   if (amountColumnIndex >= 0) {
    //     for (const row of Array.from(rows)) {
    //       if ((row.textContent || '').includes('WSOL')) {
    //         const cells = row.querySelectorAll('td');
    //         if (cells.length > amountColumnIndex) {
    //           const amountCell = cells[amountColumnIndex];
    //           const amountText = amountCell.textContent || '';
    //
    //           // Se la cella contiene "WSOL", probabilmente contiene il valore
    //           if (amountText.includes('WSOL')) {
    //             // Cerca solo il numero prima di "WSOL"
    //             const match = amountText.match(/(\d+)\s*WSOL/);
    //             if (match && match[1]) {
    //               return parseFloat(match[1]);
    //             }
    //           }
    //         }
    //       }
    //     }
    //   }
    //
    //   // Strategia 2: Cerca nelle celle che contengono sia numeri che "WSOL"
    //   for (const row of Array.from(rows)) {
    //     if ((row.textContent || '').includes('ADD LIQUIDITY') && (row.textContent || '').includes('WSOL')) {
    //       const cells = row.querySelectorAll('td');
    //
    //       for (const cell of Array.from(cells)) {
    //         const cellText = cell.textContent || '';
    //         if (cellText.includes('WSOL')) {
    //           // Cerca numeri seguiti dalla parola WSOL
    //           const wsolMatch = cellText.match(/(\d+)\s*WSOL/i);
    //           if (wsolMatch && wsolMatch[1]) {
    //             return parseFloat(wsolMatch[1]);
    //           }
    //         }
    //       }
    //     }
    //   }
    //
    //   // Strategia 3: Cerca "WSOL" e poi prendi il primo numero vicino
    //   const wsolElement = document.evaluate(
    //     "//td[contains(., 'WSOL') and not(contains(., 'TNACOIN'))]",
    //     document,
    //     null,
    //     XPathResult.FIRST_ORDERED_NODE_TYPE,
    //     null,
    //   ).singleNodeValue;
    //
    //   if (wsolElement) {
    //     const text = wsolElement.textContent || '';
    //     // Trova il numero prima di "WSOL"
    //     const match = text.match(/(\d+)\s*WSOL/);
    //     if (match && match[1]) {
    //       return parseFloat(match[1]);
    //     }
    //   }
    //
    //   return null;
    // });

    // if (wsolAmount !== null) {
    //   console.debug(`\n===========================================`);
    //   console.debug(`RISULTATO FINALE - Quantità WSOL: ${wsolAmount}`);
    //   console.debug(`===========================================\n`);
    //
    //   return wsolAmount;
    // } else {
    //   // Se non trova, cattura e stampa il contenuto completo della riga
    //   console.debug('Eseguendo analisi dettagliata della pagina...');
    //
    //   // Ottieni il DOM della riga specifica
    //   const rowHtml = await page.evaluate(() => {
    //     const wsolRow = Array.from(document.querySelectorAll('tr')).find(
    //       (row) => (row.textContent || '').includes('ADD LIQUIDITY') && (row.textContent || '').includes('WSOL'),
    //     );
    //
    //     return wsolRow ? wsolRow.outerHTML : null;
    //   });
    //
    //   if (rowHtml) {
    //     console.debug('HTML della riga trovato:');
    //     console.debug(rowHtml);
    //
    //     // Estrazione manuale dalla struttura HTML
    //     // Cerchiamo specificamente il valore "4" accanto a "WSOL"
    //     const wsolMatch = rowHtml.match(/(\d+)\s*WSOL/i);
    //     if (wsolMatch && wsolMatch[1]) {
    //       const extractedAmount = parseFloat(wsolMatch[1]);
    //       console.debug(`\n===========================================`);
    //       console.debug(`RISULTATO FINALE (estrazione manuale) - Quantità WSOL: ${extractedAmount}`);
    //       console.debug(`===========================================\n`);
    //
    //       return extractedAmount;
    //     }
    //   }
    //
    //   console.debug('Nessun valore WSOL trovato nella pagina.');
    //   return null;
    // }
  } catch (error) {
    console.error(`Errore generale: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    // Chiusura del browser
    console.debug('Chiusura del browser...');
    await browser.close();
  }
}
