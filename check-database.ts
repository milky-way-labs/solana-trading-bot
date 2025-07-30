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
      order: { findTimestamp: -1 },
      take: 10
    });
    
    console.log('\n📋 Ultimi 10 token candidati:');
    latest.forEach((token, index) => {
      console.log(`\n${index + 1}. Token: ${token.tokenAddress}`);
      console.log(`   Simbolo: ${token.symbol || 'N/A'}`);
      console.log(`   Trovato: ${token.findTimestamp ? token.findTimestamp.toLocaleString('it-IT') : 'N/A'}`);
      console.log(`   Pool aperto: ${token.poolOpenDate} alle ${token.poolOpenTime}`);
      console.log(`   Status: ${token.status || 'N/A'}`);
      console.log(`   Motivo: ${token.reason || 'N/A'}`);
      console.log(`   Info filtri: ${token.filterInfo || 'N/A'}`);
      console.log(`   Latency: ${token.latency || 'N/A'}s`);
    });
    
    // Statistiche per status
    console.log('\n📈 Statistiche per status:');
    const allTokens = await repo.find();
    
    const statsMap = new Map<string, number>();
    allTokens.forEach(token => {
      const status = token.status || 'unknown';
      statsMap.set(status, (statsMap.get(status) || 0) + 1);
    });
    
    // Ordina per count discendente
    const sortedStats = Array.from(statsMap.entries()).sort((a, b) => b[1] - a[1]);
    
    sortedStats.forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });
    
    // Statistiche per motivo (solo per status 'filtered')
    console.log('\n📊 Statistiche per motivo di scarto:');
    const filteredTokens = allTokens.filter(token => token.status === 'filtered');
    
    const reasonMap = new Map<string, number>();
    filteredTokens.forEach(token => {
      const reason = token.reason || 'N/A';
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    });
    
    // Ordina per count discendente
    const sortedReasons = Array.from(reasonMap.entries()).sort((a, b) => b[1] - a[1]);
    
    sortedReasons.forEach(([reason, count]) => {
      console.log(`   ${reason}: ${count}`);
    });
    
  } catch (error) {
    console.error('❌ Errore nel controllo database:', error);
  }
}

checkDatabase().catch(console.error); 