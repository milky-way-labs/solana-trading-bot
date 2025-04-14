import { PublicKey } from '@solana/web3.js';
import { Liquidity, LiquidityPoolKeys, LiquidityStateV4, MAINNET_PROGRAM_ID, Market } from '@raydium-io/raydium-sdk';
import { MinimalMarketLayoutV3 } from './market';

// fixme: check addresses
// Programmi Raydium rilevanti per Add Liquidity
const RAYDIUM_LIQUIDITY_POOL_PROGRAM_ID_V4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
const RAYDIUM_AMM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

// fixme:
const WSOL_ADDRESS = new PublicKey('So11111111111111111111111111111111111111112');

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



// Funzione principale del bot
export async function analyzeAddLiquidityForToken(connection, tokenAddress, quoteToken) {
  try {
    console.log(`Analisi delle transazioni di add liquidity per il token: ${tokenAddress}`);

    // Converti l'indirizzo in un oggetto PublicKey
    const tokenPublicKey = new PublicKey(tokenAddress);

    // Ottieni le transazioni di add liquidity per il token usando solo l'API di Solana
    const signatures = await getAddLiquidityTransactionsForToken(connection, tokenPublicKey, quoteToken);

    if (!signatures || signatures.length === 0) {
      console.log('Nessuna transazione di add liquidity trovata per questo token');
      return null;
    }

    console.log(`Trovate ${signatures.length} transazioni di add liquidity`);

    // Analizza la transazione più recente (o potresti implementare un ciclo per analizzarle tutte)
    const latestSignature = signatures[0];
    return await analyzeTransaction(connection, latestSignature, tokenPublicKey);

  } catch (error) {
    console.error('Errore nell\'analisi del token:', error);
    return null;
  }
}

// Funzione per ottenere le transazioni di add liquidity per un token specifico
export async function getAddLiquidityTransactionsForToken(connection, tokenPublicKey, quoteToken) {
  try {
    console.log(`Cercando transazioni per il token: ${tokenPublicKey.toString()}`);

    // Ottieni le transazioni più recenti che coinvolgono questo token
    const recentSignatures = await connection.getSignaturesForAddress(
      tokenPublicKey,
      { limit: 100 } // Puoi aumentare questo limite se necessario
    );

    console.log(`Trovate ${recentSignatures.length} transazioni recenti per il token`);

    // Array per memorizzare le signature di add liquidity
    const addLiquiditySignatures = [];

    // Per ogni signature, ottieni i dettagli della transazione per verificare se è add liquidity
    for (const sigInfo of recentSignatures) {
      try {
        const txInfo = await connection.getParsedTransaction(sigInfo.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });

        if (!txInfo || !txInfo.meta) continue;

        // Verifica se la transazione coinvolge il programma di liquidità di Raydium
        const isRaydiumLiquidityTx = txInfo.transaction.message.instructions.some(
          inst => inst.programId &&
            (inst.programId.equals(RAYDIUM_LIQUIDITY_POOL_PROGRAM_ID_V4) ||
              inst.programId.equals(RAYDIUM_AMM_PROGRAM_ID))
        );

        // Verifica se la transazione ha modificato il saldo del token specifico
        // e se il saldo è diminuito (indicando un possibile add liquidity)
        const preTokenBalances = txInfo.meta.preTokenBalances || [];
        const postTokenBalances = txInfo.meta.postTokenBalances || [];

        // Verifica se WSOL è coinvolto nella transazione
        const wsolInvolved = [...preTokenBalances, ...postTokenBalances].some(
          balance => balance.mint === quoteToken.mint.toString()
        );

        // Verifica se questa è una transazione di add liquidity
        // basata su: programma Raydium coinvolto + WSOL coinvolto + struttura dei cambiamenti nei saldi
        if (isRaydiumLiquidityTx && wsolInvolved) {
          // Ulteriore analisi per confermare che sia un'operazione di add liquidity
          // Verifica se c'è un pattern di saldo tipico di add liquidity
          // (questa è una logica semplificata, potresti dover raffinarla)

          const tokenBalances = { pre: {}, post: {} };

          // Raccogli i saldi pre-transazione
          preTokenBalances.forEach(balance => {
            const mint = balance.mint;
            if (!tokenBalances.pre[mint]) tokenBalances.pre[mint] = 0;
            tokenBalances.pre[mint] += parseFloat(balance.uiTokenAmount.uiAmount || 0);
          });

          // Raccogli i saldi post-transazione
          postTokenBalances.forEach(balance => {
            const mint = balance.mint;
            if (!tokenBalances.post[mint]) tokenBalances.post[mint] = 0;
            tokenBalances.post[mint] += parseFloat(balance.uiTokenAmount.uiAmount || 0);
          });

          // Verifica se il saldo di WSOL è diminuito (indicando add liquidity)
          const wsolPreBalance = tokenBalances.pre[WSOL_ADDRESS.toString()] || 0;
          const wsolPostBalance = tokenBalances.post[WSOL_ADDRESS.toString()] || 0;

          if (wsolPreBalance > wsolPostBalance) {
            console.log(`Probabile transazione di add liquidity trovata: ${sigInfo.signature}`);
            addLiquiditySignatures.push(sigInfo.signature);
          }
        }
      } catch (txError) {
        console.log(`Errore nell'analisi della transazione ${sigInfo.signature}: ${txError.message}`);
        // Continua con la prossima transazione
      }
    }

    return addLiquiditySignatures;

  } catch (error) {
    console.error('Errore nel recupero delle transazioni:', error);
    return [];
  }
}

// Funzione per analizzare una transazione specifica
export async function analyzeTransaction(connection, signature, tokenPublicKey) {
  try {
    console.log(`Analisi dettagliata della transazione: ${signature}`);

    // Ottieni i dettagli completi della transazione
    const txInfo = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!txInfo || !txInfo.meta) {
      console.error('Transazione non trovata o dettagli insufficienti');
      return null;
    }

    // Analisi dei saldi pre e post transazione
    const preTokenBalances = txInfo.meta.preTokenBalances || [];
    const postTokenBalances = txInfo.meta.postTokenBalances || [];

    // Trova WSOL tra i token coinvolti
    const wsolPreBalances = preTokenBalances.filter(
      balance => balance.mint === WSOL_ADDRESS.toString()
    );

    const wsolPostBalances = postTokenBalances.filter(
      balance => balance.mint === WSOL_ADDRESS.toString()
    );

    // Calcola la quantità di WSOL aggiunta alla liquidità
    let totalWsolAdded = 0;

    // Mappa per tenere traccia dei saldi pre-transazione
    const preBalanceMap = {};
    wsolPreBalances.forEach(balance => {
      const owner = balance.owner;
      if (!preBalanceMap[owner]) preBalanceMap[owner] = 0;
      preBalanceMap[owner] += parseFloat(balance.uiTokenAmount.uiAmount || 0);
    });

    // Mappa per tenere traccia dei saldi post-transazione
    const postBalanceMap = {};
    wsolPostBalances.forEach(balance => {
      const owner = balance.owner;
      if (!postBalanceMap[owner]) postBalanceMap[owner] = 0;
      postBalanceMap[owner] += parseFloat(balance.uiTokenAmount.uiAmount || 0);
    });

    // Calcola la differenza per ogni account
    for (const owner in preBalanceMap) {
      const preAmount = preBalanceMap[owner] || 0;
      const postAmount = postBalanceMap[owner] || 0;

      // Se il saldo è diminuito, significa che WSOL è stato aggiunto alla liquidità
      if (preAmount > postAmount) {
        totalWsolAdded += (preAmount - postAmount);
      }
    }

    // Se non riusciamo a determinare la quantità dai saldi, cerchiamo di estrarre informazioni dalle istruzioni
    if (totalWsolAdded === 0) {
      console.log('Tentativo di analisi dalle istruzioni della transazione...');

      // Trova istruzioni relative a Raydium
      const raydiumInstructions = txInfo.transaction.message.instructions.filter(
        inst => inst.programId &&
          (inst.programId.equals(RAYDIUM_LIQUIDITY_POOL_PROGRAM_ID_V4) ||
            inst.programId.equals(RAYDIUM_AMM_PROGRAM_ID))
      );

      // Se disponibili dettagli sulle log della transazione, possiamo analizzarli per ulteriori informazioni
      if (txInfo.meta.logMessages && txInfo.meta.logMessages.length > 0) {
        for (const log of txInfo.meta.logMessages) {
          // Cerca pattern tipici dei log di add liquidity di Raydium
          if (log.includes('Program log: Instruction: AddLiquidity') ||
            log.includes('Program log: Add Liquidity')) {
            console.log('Trovato log di add liquidity:', log);
            // Potrebbe essere necessario un parser personalizzato per estrarre la quantità dai log
          }

          // Cerca numeri che potrebbero indicare l'importo di WSOL
          const amountMatch = log.match(/amount: (\d+(\.\d+)?)/i);
          if (amountMatch) {
            console.log('Possibile importo trovato nei log:', amountMatch[1]);
          }
        }
      }
    }

    // Restituisci i risultati
    const result = {
      signature,
      tokenAddress: tokenPublicKey.toString(),
      wsolAdded: totalWsolAdded,
      timestamp: txInfo.blockTime ? new Date(txInfo.blockTime * 1000).toISOString() : 'Unknown',
      success: txInfo.meta.err === null,
      blockTime: txInfo.blockTime
    };

    console.log('Risultato dell\'analisi:', result);
    return result;

  } catch (error) {
    console.error('Errore durante l\'analisi della transazione:', error);
    return null;
  }
}
