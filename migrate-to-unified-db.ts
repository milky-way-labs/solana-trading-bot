import { createConnection, getMongoRepository, Entity, Column, ObjectIdColumn } from 'typeorm';
import { ObjectId } from 'mongodb';
import { INSTANCE_ID, MONGODB_URI } from './helpers';

// Definizioni delle vecchie entità per la migrazione
@Entity()
class Trade {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  tokenAddress: string;

  @Column({ nullable: true })
  symbol?: string;

  @Column()
  buyTimestamp: Date;

  @Column({ nullable: true })
  sellTimestamp?: Date;

  @Column({ type: 'float', nullable: true })
  gainLossPercentage?: number;

  @Column()
  instanceId: string;
}

@Entity()
class TokenCandidate {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  tokenAddress: string;

  @Column({ nullable: true })
  symbol?: string;

  @Column()
  findTimestamp: Date;

  @Column({ nullable: true })
  poolOpenTimestamp?: Date;

  @Column()
  status: string;

  @Column({ nullable: true })
  reason?: string;

  @Column({ nullable: true })
  filterInfo?: string;

  @Column({ nullable: true })
  latencyMs?: number;

  @Column()
  instanceId: string;
}

// Nuova entità unificata
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
  eventType: string;

  @Column({ nullable: true })
  reason?: string;

  @Column({ nullable: true })
  filterInfo?: string;

  @Column({ type: 'float', nullable: true })
  gainLossPercentage?: number;

  @Column({ nullable: true })
  latencyMs?: number;

  @Column({ nullable: true })
  poolOpenTimestamp?: Date;

  @Column()
  instanceId: string;
}

async function migrateToUnifiedDB() {
  console.log('🔄 Inizio migrazione verso database unificato...');
  
  try {
    // Connessione al database con le vecchie entità
    const connection = await createConnection({
      type: 'mongodb',
      url: MONGODB_URI,
      useNewUrlParser: true,
      useUnifiedTopology: true,
      entities: [Trade, TokenCandidate, TokenEvent],
      synchronize: true,
      database: INSTANCE_ID
    });

    console.log('✅ Connesso al database');

    const tradesRepo = getMongoRepository(Trade);
    const candidatesRepo = getMongoRepository(TokenCandidate);
    const eventsRepo = getMongoRepository(TokenEvent);

    // Conta documenti esistenti
    const tradesCount = await tradesRepo.count();
    const candidatesCount = await candidatesRepo.count();
    
    console.log(`📊 Trovati ${tradesCount} trade e ${candidatesCount} token candidates`);

    const migratedEvents: TokenEvent[] = [];

    // Migra i TokenCandidate
    console.log('🔄 Migrazione TokenCandidate...');
    const candidates = await candidatesRepo.find();
    
    for (const candidate of candidates) {
      let eventType = 'found';
      
      switch (candidate.status) {
        case 'bought':
          eventType = 'bought';
          break;
        case 'sold':
          eventType = 'sold';
          break;
        case 'filtered':
        case 'blacklisted':
          eventType = 'filtered';
          break;
        default:
          eventType = 'found';
      }

      const event = new TokenEvent();
      event.tokenAddress = candidate.tokenAddress;
      event.symbol = candidate.symbol;
      event.timestamp = candidate.findTimestamp || new Date();
      event.eventType = eventType;
      event.reason = candidate.reason;
      event.filterInfo = candidate.filterInfo;
      event.latencyMs = candidate.latencyMs;
      event.poolOpenTimestamp = candidate.poolOpenTimestamp;
      event.instanceId = candidate.instanceId || INSTANCE_ID;

      migratedEvents.push(event);
    }

    // Migra i Trade
    console.log('🔄 Migrazione Trade...');
    const trades = await tradesRepo.find();
    
    for (const trade of trades) {
      // Crea evento di acquisto
      if (trade.buyTimestamp) {
        const buyEvent = new TokenEvent();
        buyEvent.tokenAddress = trade.tokenAddress;
        buyEvent.symbol = trade.symbol;
        buyEvent.timestamp = trade.buyTimestamp;
        buyEvent.eventType = 'bought';
        buyEvent.filterInfo = 'Trade acquistato (migrato da Trade)';
        buyEvent.instanceId = trade.instanceId || INSTANCE_ID;
        
        migratedEvents.push(buyEvent);
      }

      // Crea evento di vendita
      if (trade.sellTimestamp) {
        const sellEvent = new TokenEvent();
        sellEvent.tokenAddress = trade.tokenAddress;
        sellEvent.symbol = trade.symbol;
        sellEvent.timestamp = trade.sellTimestamp;
        sellEvent.eventType = 'sold';
        sellEvent.gainLossPercentage = trade.gainLossPercentage;
        sellEvent.filterInfo = `Trade venduto con ${trade.gainLossPercentage && trade.gainLossPercentage > 0 ? 'profitto' : 'perdita'} del ${trade.gainLossPercentage?.toFixed(2)}%`;
        sellEvent.instanceId = trade.instanceId || INSTANCE_ID;
        
        migratedEvents.push(sellEvent);
      }
    }

    // Ordina eventi per timestamp
    migratedEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    console.log(`📝 Preparati ${migratedEvents.length} eventi per la migrazione`);

    // Elimina dati esistenti nella nuova collezione (se esiste)
    await eventsRepo.deleteMany({});
    console.log('🗑️ Pulita collezione TokenEvent esistente');

    // Inserisci i nuovi eventi
    if (migratedEvents.length > 0) {
      await eventsRepo.save(migratedEvents);
      console.log(`✅ Inseriti ${migratedEvents.length} eventi nella nuova collezione`);
    }

    // Statistiche finali
    console.log('\n📊 Statistiche migrazione:');
    const eventsByType = migratedEvents.reduce((acc, event) => {
      acc[event.eventType] = (acc[event.eventType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(eventsByType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} eventi`);
    });

    console.log('\n✅ Migrazione completata con successo!');
    console.log('\n📝 Prossimi passi:');
    console.log('   1. Testa la nuova struttura con check-database.ts');
    console.log('   2. Verifica che il bot funzioni correttamente');
    console.log('   3. Se tutto ok, rimuovi le vecchie collezioni');

    await connection.close();

  } catch (error) {
    console.error('❌ Errore durante la migrazione:', error);
    process.exit(1);
  }
}

migrateToUnifiedDB().catch(console.error); 