import { initDB } from './db';
import { getMongoRepository } from 'typeorm';
import { TokenCandidate } from './db';

async function checkDatabase() {
  console.log('🔍 Controllo database TokenCandidate...');
  
  try {
    await initDB();
    
    const repo = getMongoRepository(TokenCandidate);
    
    // Conta totale
    const total = await repo.count();
    console.log(`📊 Totale token candidati: ${total}`);
    
    if (total === 0) {
      console.log('❌ Nessun token candidato trovato nel database');
      return;
    }
    
    // Ultimi 10 token
    const latest = await repo.find({
      order: { findDateTime: -1 },
      take: 10
    });
    
    console.log('\n📋 Ultimi 10 token candidati:');
    latest.forEach((token, index) => {
      console.log(`\n${index + 1}. Token: ${token.tokenAddress}`);
      console.log(`   Simbolo: ${token.tokenSymbol || 'N/A'}`);
      console.log(`   Trovato: ${token.findDateTime.toLocaleString('it-IT')}`);
      console.log(`   Comprato: ${token.bought ? 'SÌ' : 'NO'}`);
      console.log(`   Motivo: ${token.notBoughtReason || 'N/A'}`);
      console.log(`   Dettagli filtri: ${token.filterDetails || 'N/A'}`);
      console.log(`   Lag: ${token.lag || 'N/A'}s`);
    });
    
    // Statistiche per motivo - versione semplificata
    console.log('\n📈 Statistiche per motivo di scarto:');
    const allTokens = await repo.find();
    
    const statsMap = new Map<string, number>();
    allTokens.forEach(token => {
      const reason = token.notBoughtReason || 'COMPRATI';
      statsMap.set(reason, (statsMap.get(reason) || 0) + 1);
    });
    
    // Ordina per count discendente
    const sortedStats = Array.from(statsMap.entries()).sort((a, b) => b[1] - a[1]);
    
    sortedStats.forEach(([reason, count]) => {
      console.log(`   ${reason}: ${count}`);
    });
    
  } catch (error) {
    console.error('❌ Errore nel controllo database:', error);
  }
}

checkDatabase().catch(console.error); 