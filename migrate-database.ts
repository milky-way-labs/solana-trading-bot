import { initDB } from './db';
import { Trade, TokenCandidate } from './db';
import { getMongoRepository } from 'typeorm';

// Funzione helper per separare data e ora
function formatDateAndTime(date: Date): { date: string, time: string } {
  // Formatta la data come YYYY-MM-DD
  const dateStr = date.toISOString().split('T')[0];
  
  // Formatta l'ora come HH:mm:ss
  const timeStr = date.toTimeString().split(' ')[0];
  
  return { date: dateStr, time: timeStr };
}

async function migrateDatabase() {
  console.log('🔄 Iniziando migrazione database...');
  
  try {
    await initDB();
    
    const tradeRepo = getMongoRepository(Trade);
    const candidateRepo = getMongoRepository(TokenCandidate);
    
    // Migra i Trade
    console.log('📊 Migrazione tabelle Trade...');
    const trades = await tradeRepo.find();
    console.log(`Trovati ${trades.length} trade da migrare`);
    
    for (const trade of trades) {
      const updates: any = {};
      
      if (trade.findDateTime && !trade.findDate) {
        const { date, time } = formatDateAndTime(trade.findDateTime);
        updates.findDate = date;
        updates.findTime = time;
      }
      
      if (trade.poolOpenDateTime && !trade.poolOpenDate) {
        const { date, time } = formatDateAndTime(trade.poolOpenDateTime);
        updates.poolOpenDate = date;
        updates.poolOpenTime = time;
      }
      
      if (trade.buyDateTime && !trade.buyDate) {
        const { date, time } = formatDateAndTime(trade.buyDateTime);
        updates.buyDate = date;
        updates.buyTime = time;
      }
      
      if (trade.sellDateTime && !trade.sellDate) {
        const { date, time } = formatDateAndTime(trade.sellDateTime);
        updates.sellDate = date;
        updates.sellTime = time;
      }
      
      if (Object.keys(updates).length > 0) {
        await tradeRepo.update(trade.id, updates);
      }
    }
    
    // Migra i TokenCandidate
    console.log('📋 Migrazione tabelle TokenCandidate...');
    const candidates = await candidateRepo.find();
    console.log(`Trovati ${candidates.length} token candidati da migrare`);
    
    for (const candidate of candidates) {
      const updates: any = {};
      
      if (candidate.findDateTime && !candidate.findDate) {
        const { date, time } = formatDateAndTime(candidate.findDateTime);
        updates.findDate = date;
        updates.findTime = time;
      }
      
      if (candidate.poolOpenDateTime && !candidate.poolOpenDate) {
        const { date, time } = formatDateAndTime(candidate.poolOpenDateTime);
        updates.poolOpenDate = date;
        updates.poolOpenTime = time;
      }
      
      if (candidate.buyDateTime && !candidate.buyDate) {
        const { date, time } = formatDateAndTime(candidate.buyDateTime);
        updates.buyDate = date;
        updates.buyTime = time;
      }
      
      if (candidate.sellDateTime && !candidate.sellDate) {
        const { date, time } = formatDateAndTime(candidate.sellDateTime);
        updates.sellDate = date;
        updates.sellTime = time;
      }
      
      if (Object.keys(updates).length > 0) {
        await candidateRepo.update(candidate.id, updates);
      }
    }
    
    console.log('✅ Migrazione completata con successo!');
    console.log(`📊 Migrati ${trades.length} trade`);
    console.log(`📋 Migrati ${candidates.length} token candidati`);
    
  } catch (error) {
    console.error('❌ Errore durante la migrazione:', error);
  }
}

// Esegui la migrazione
migrateDatabase().catch(console.error); 