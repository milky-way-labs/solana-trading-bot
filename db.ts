import { Entity, Column, ObjectIdColumn, createConnection, getMongoRepository, Connection } from 'typeorm';
import { ObjectId } from 'mongodb';
import { INSTANCE_ID, MONGODB_URI } from './helpers';

@Entity()
export class TokenEvent {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  tokenAddress: string;

  @Column({ nullable: true })
  symbol?: string;

  @Column()
  timestamp: Date; // data di creazione del record

  @Column()
  lastUpdated: Date; // ultima modifica del record

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

  @Column({ type: 'array', nullable: true })
  statusHistory?: string[]; // cronologia degli stati attraversati
}

let connection: Connection | null = null;

export async function initDB() {
  if (!connection) {
    connection = await createConnection({
      type: 'mongodb',
      url: MONGODB_URI,
      useNewUrlParser: true,
      useUnifiedTopology: true,
      entities: [TokenEvent],
      synchronize: true,
      database: INSTANCE_ID
    });    
  }
}

export async function updateTokenStatus(
  tokenAddress: string,
  newStatus: 'found' | 'filtered' | 'bought' | 'sold',
  options: {
    symbol?: string;
    reason?: string;
    filterInfo?: string;
    gainLossPercentage?: number;
    latencyMs?: number;
    poolOpenTimestamp?: Date;
  } = {}
): Promise<void> {
  if (!MONGODB_URI) return;
  if (!connection) await initDB();

  const repo = getMongoRepository(TokenEvent);
  
  // Cerca record esistente per questo token e istanza
  let event = await repo.findOne({ 
    where: { 
      tokenAddress: tokenAddress, 
      instanceId: INSTANCE_ID 
    } 
  });

  const now = new Date();

  if (!event) {
    // Crea nuovo record se non esiste
    event = new TokenEvent();
    event.tokenAddress = tokenAddress;
    event.instanceId = INSTANCE_ID;
    event.timestamp = now;
    event.statusHistory = [newStatus];
  } else {
    // Aggiorna record esistente
    if (!event.statusHistory) {
      event.statusHistory = [event.eventType];
    }
    
    // Aggiungi nuovo stato alla cronologia se diverso dall'ultimo
    const lastStatus = event.statusHistory[event.statusHistory.length - 1];
    if (lastStatus !== newStatus) {
      event.statusHistory.push(newStatus);
    }
  }

  // Aggiorna i campi
  event.lastUpdated = now;
  event.eventType = newStatus;
  
  // Aggiorna solo i campi forniti
  if (options.symbol !== undefined) event.symbol = options.symbol;
  if (options.reason !== undefined) event.reason = options.reason;
  if (options.filterInfo !== undefined) event.filterInfo = options.filterInfo;
  if (options.gainLossPercentage !== undefined) event.gainLossPercentage = options.gainLossPercentage;
  if (options.latencyMs !== undefined) event.latencyMs = options.latencyMs;
  if (options.poolOpenTimestamp !== undefined) event.poolOpenTimestamp = options.poolOpenTimestamp;

  await repo.save(event);
}

// Funzioni semplificate che utilizzano il nuovo sistema unificato
export async function logTokenCandidate(
  tokenAddress: string,
  tokenSymbol: string | undefined,
  poolOpenDateTime: Date,
  status: string,
  reason?: string,
  filterInfo?: string,
  latency?: number
): Promise<void> {
  const eventType = status === 'found' ? 'found' : 
                   status === 'bought' ? 'bought' : 
                   status === 'sold' ? 'sold' : 'filtered';
  
  await updateTokenStatus(tokenAddress, eventType, {
    symbol: tokenSymbol,
    reason,
    filterInfo,
    latencyMs: latency,
    poolOpenTimestamp: poolOpenDateTime
  });
}

export async function logSell(tokenAddress: string, gainLossPercentage: number, symbol?: string): Promise<void> {
  await updateTokenStatus(tokenAddress, 'sold', {
    gainLossPercentage,
    symbol,
    filterInfo: 'Token venduto'
  });
}

// Funzioni di compatibilità deprecate - da rimuovere in futuro
export async function logFind(tokenAddress: string, poolOpenDateTime: Date): Promise<void> {
  console.warn('logFind è deprecata, usa updateTokenStatus');
  await updateTokenStatus(tokenAddress, 'found', {
    poolOpenTimestamp: poolOpenDateTime,
    filterInfo: 'Token trovato e in fase di valutazione'
  });
}

export async function logBuy(tokenAddress: string, symbol?: string): Promise<void> {
  console.warn('logBuy è deprecata, usa updateTokenStatus');
  await updateTokenStatus(tokenAddress, 'bought', {
    symbol,
    filterInfo: 'Token acquistato con successo'
  });
}
