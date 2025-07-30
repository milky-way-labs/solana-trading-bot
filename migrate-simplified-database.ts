import { initDB } from './db';
import { getMongoRepository } from 'typeorm';
import { TokenCandidate } from './db';

async function migrateToSimplifiedDatabase() {
  console.log('🔄 Iniziando migrazione al database semplificato...');
  
  try {
    await initDB();
    
    const repo = getMongoRepository(TokenCandidate);
    
    // Ottieni tutti i token candidati esistenti
    const allTokens = await repo.find();
    console.log(`Trovati ${allTokens.length} token candidati da migrare`);
    
    if (allTokens.length === 0) {
      console.log('✅ Nessun token da migrare');
      return;
    }
    
    // Crea una nuova collezione con i dati semplificati
    const simplifiedTokens = allTokens.map(token => {
      // Determina lo status basato sui campi esistenti
      let status = 'found';
      let reason = token.notBoughtReason || undefined;
      let filterInfo = token.filterDetails || undefined;
      
      if (token.bought) {
        if (token.sellDateTime) {
          status = 'sold';
        } else {
          status = 'bought';
        }
      } else {
        status = 'filtered';
        reason = token.notBoughtReason;
        filterInfo = token.filterDetails;
      }
      
      return {
        tokenAddress: token.tokenAddress,
        symbol: token.tokenSymbol,
        findTimestamp: token.findDateTime,
        poolOpenDate: token.poolOpenDate,
        poolOpenTime: token.poolOpenTime,
        status,
        reason,
        filterInfo,
        latency: token.lag,
        instanceId: token.instanceId
      };
    });
    
    // Elimina tutti i record esistenti
    await repo.clear();
    console.log('🗑️ Record esistenti eliminati');
    
    // Inserisci i nuovi record semplificati
    for (const token of simplifiedTokens) {
      const newToken = new TokenCandidate();
      Object.assign(newToken, token);
      await repo.save(newToken);
    }
    
    console.log('✅ Migrazione completata con successo!');
    console.log(`📊 Migrati ${simplifiedTokens.length} token candidati`);
    
    // Mostra statistiche
    const statusStats = new Map<string, number>();
    simplifiedTokens.forEach(token => {
      statusStats.set(token.status, (statusStats.get(token.status) || 0) + 1);
    });
    
    console.log('\n📈 Statistiche per status:');
    statusStats.forEach((count, status) => {
      console.log(`   ${status}: ${count}`);
    });
    
  } catch (error) {
    console.error('❌ Errore durante la migrazione:', error);
  }
}

// Esegui la migrazione
migrateToSimplifiedDatabase().catch(console.error); 