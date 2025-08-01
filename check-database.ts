import { createConnection, Entity, Column, ObjectIdColumn } from 'typeorm';
import { ObjectId } from 'mongodb';
import { INSTANCE_ID, MONGODB_URI } from './helpers';

@Entity()
class TokenEvent {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  tokenAddress: string;

  @Column({ nullable: true })
  symbol?: string;

  @Column()
  timestamp: Date;

  @Column()
  eventType: string; // 'found', 'filtered', 'bought', 'sold'

  @Column({ nullable: true })
  reason?: string; // motivo filtro/scarto

  @Column({ nullable: true })
  filterInfo?: string; // dettagli filtri

  @Column({ type: 'float', nullable: true })
  gainLossPercentage?: number; // solo per 'sold'

  @Column({ nullable: true })
  latencyMs?: number;

  @Column({ nullable: true })
  poolOpenTimestamp?: Date;

  @Column()
  instanceId: string;
}

async function checkDatabase() {
  console.log('🔍 Controllo database TokenEvent unificato...');
  
  try {
    const connection = await createConnection({
      type: 'mongodb',
      url: MONGODB_URI,
      useNewUrlParser: true,
      useUnifiedTopology: true,
      entities: [TokenEvent],
      synchronize: true,
      database: INSTANCE_ID,
      name: 'check-connection-' + Date.now()
    });
    
    const repo = connection.getMongoRepository(TokenEvent);
    
    // Conta totale
    const total = await repo.count();
    console.log(`📊 Totale eventi: ${total}`);
    
    if (total === 0) {
      console.log('❌ Nessun evento trovato nel database');
      return;
    }
    
    // Ultimi 15 eventi ordinati dal più recente
    const latest = await repo.find({
      order: { timestamp: -1 },
      take: 15
    });
    
    console.log('\n📋 Ultimi 15 eventi (dal più recente):');
    latest.forEach((event, index) => {
      console.log(`\n${index + 1}. ${event.eventType.toUpperCase()}: ${event.tokenAddress}`);
      console.log(`   Simbolo: ${event.symbol || 'N/A'}`);
      console.log(`   Timestamp: ${event.timestamp ? event.timestamp.toLocaleString('it-IT') : 'N/A'}`);
      
      if (event.poolOpenTimestamp) {
        console.log(`   Pool aperto: ${event.poolOpenTimestamp.toLocaleString('it-IT')}`);
      }
      
      if (event.reason) {
        console.log(`   Motivo: ${event.reason}`);
      }
      
      if (event.filterInfo) {
        console.log(`   Info: ${event.filterInfo}`);
      }
      
      if (event.gainLossPercentage !== undefined) {
        console.log(`   Performance: ${event.gainLossPercentage.toFixed(2)}%`);
      }
      
      if (event.latencyMs) {
        console.log(`   Latency: ${event.latencyMs}ms`);
      }
    });
    
    // Statistiche per tipo di evento
    console.log('\n📈 Statistiche per tipo di evento:');
    const allEvents = await repo.find();
    
    const statsMap = new Map<string, number>();
    allEvents.forEach(event => {
      const type = event.eventType || 'unknown';
      statsMap.set(type, (statsMap.get(type) || 0) + 1);
    });
    
    // Ordina per count discendente
    const sortedStats = Array.from(statsMap.entries()).sort((a, b) => b[1] - a[1]);
    
    sortedStats.forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    
    // Statistiche per motivo (solo per eventi 'filtered')
    console.log('\n📊 Statistiche per motivo di scarto:');
    const filteredEvents = allEvents.filter(event => event.eventType === 'filtered');
    
    const reasonMap = new Map<string, number>();
    filteredEvents.forEach(event => {
      const reason = event.reason || 'N/A';
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    });
    
    // Ordina per count discendente
    const sortedReasons = Array.from(reasonMap.entries()).sort((a, b) => b[1] - a[1]);
    
    sortedReasons.forEach(([reason, count]) => {
      console.log(`   ${reason}: ${count}`);
    });
    
    // Analisi performance trade
    const soldEvents = allEvents.filter(event => 
      event.eventType === 'sold' && event.gainLossPercentage !== undefined
    );
    
    if (soldEvents.length > 0) {
      console.log('\n💰 Analisi Performance Trade:');
      const profitableTrades = soldEvents.filter(event => event.gainLossPercentage! > 0);
      const losingTrades = soldEvents.filter(event => event.gainLossPercentage! < 0);
      
      console.log(`   Trade totali completati: ${soldEvents.length}`);
      console.log(`   Trade profittevoli: ${profitableTrades.length} (${((profitableTrades.length / soldEvents.length) * 100).toFixed(1)}%)`);
      console.log(`   Trade in perdita: ${losingTrades.length} (${((losingTrades.length / soldEvents.length) * 100).toFixed(1)}%)`);
      
      if (profitableTrades.length > 0) {
        const avgProfit = profitableTrades.reduce((sum, event) => 
          sum + (event.gainLossPercentage || 0), 0
        ) / profitableTrades.length;
        console.log(`   Profitto medio: ${avgProfit.toFixed(2)}%`);
      }
      
      if (losingTrades.length > 0) {
        const avgLoss = losingTrades.reduce((sum, event) => 
          sum + (event.gainLossPercentage || 0), 0
        ) / losingTrades.length;
        console.log(`   Perdita media: ${avgLoss.toFixed(2)}%`);
      }
      
      const totalPerformance = soldEvents.reduce((sum, event) => 
        sum + (event.gainLossPercentage || 0), 0
      );
      console.log(`   Performance totale: ${totalPerformance.toFixed(2)}%`);
    }
    
    // Analisi temporale
    console.log('\n⏰ Analisi Temporale:');
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const events24h = allEvents.filter(event => event.timestamp > last24h);
    const events7d = allEvents.filter(event => event.timestamp > last7d);
    
    console.log(`   Eventi ultime 24h: ${events24h.length}`);
    console.log(`   Eventi ultimi 7 giorni: ${events7d.length}`);
    
    await connection.close();
    
  } catch (error) {
    console.error('❌ Errore nel controllo database:', error);
  }
}

checkDatabase().catch(console.error); 