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

export async function logTokenEvent(
  tokenAddress: string,
  eventType: 'found' | 'filtered' | 'bought' | 'sold',
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
  const event = new TokenEvent();
  
  event.tokenAddress = tokenAddress;
  event.symbol = options.symbol;
  event.timestamp = new Date();
  event.eventType = eventType;
  event.reason = options.reason;
  event.filterInfo = options.filterInfo;
  event.gainLossPercentage = options.gainLossPercentage;
  event.latencyMs = options.latencyMs;
  event.poolOpenTimestamp = options.poolOpenTimestamp;
  event.instanceId = INSTANCE_ID;

  await repo.save(event);
}

// Funzioni di compatibilità per non rompere il codice esistente
export async function logFind(tokenAddress: string, poolOpenDateTime: Date): Promise<void> {
  await logTokenEvent(tokenAddress, 'found', {
    poolOpenTimestamp: poolOpenDateTime,
    filterInfo: 'Token trovato e in fase di valutazione'
  });
}

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
  
  await logTokenEvent(tokenAddress, eventType, {
    symbol: tokenSymbol,
    reason,
    filterInfo,
    latencyMs: latency,
    poolOpenTimestamp: poolOpenDateTime
  });
}

export async function logBuy(tokenAddress: string, symbol?: string): Promise<void> {
  await logTokenEvent(tokenAddress, 'bought', {
    symbol,
    filterInfo: 'Token acquistato con successo'
  });
}

export async function logSell(tokenAddress: string, gainLossPercentage: number): Promise<void> {
  await logTokenEvent(tokenAddress, 'sold', {
    gainLossPercentage,
    filterInfo: 'Token venduto'
  });
}
