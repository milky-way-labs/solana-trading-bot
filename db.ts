import { Entity, Column, ObjectIdColumn, createConnection, getMongoRepository, Connection } from 'typeorm';
import { ObjectId } from 'mongodb';
import {INSTANCE_ID, MONGODB_URI} from './helpers';

// fixme: deprecations

@Entity()
export class Trade {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  tokenAddress: string;

  @Column()
  findDateTime: Date;

  @Column()
  findDate: string; // YYYY-MM-DD

  @Column()
  findTime: string; // HH:mm:ss

  @Column()
  poolOpenDateTime: Date;

  @Column()
  poolOpenDate: string; // YYYY-MM-DD

  @Column()
  poolOpenTime: string; // HH:mm:ss

  @Column()
  buyDateTime: Date;

  @Column({ nullable: true })
  buyDate?: string; // YYYY-MM-DD

  @Column({ nullable: true })
  buyTime?: string; // HH:mm:ss

  @Column({ nullable: true })
  sellDateTime?: Date;

  @Column({ nullable: true })
  sellDate?: string; // YYYY-MM-DD

  @Column({ nullable: true })
  sellTime?: string; // HH:mm:ss

  @Column({ type: 'float', nullable: true })
  gainLossPercentage?: number;

  @Column()
  instanceId: string;
}

@Entity()
export class TokenCandidate {
  @ObjectIdColumn()
  id: ObjectId;

  @Column()
  tokenAddress: string;

  @Column({ nullable: true })
  symbol?: string;

  @Column()
  findTimestamp: Date;

  @Column()
  poolOpenDate: string; // YYYY-MM-DD

  @Column()
  poolOpenTime: string; // HH:mm:ss

  @Column()
  status: string; // 'found', 'bought', 'sold', 'filtered', 'timeout', etc.

  @Column({ nullable: true })
  reason?: string; // Why it was not bought or sold

  @Column({ nullable: true })
  filterInfo?: string; // Detailed filter information

  @Column({ nullable: true })
  latency?: number; // Lag in seconds

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
      entities: [Trade, TokenCandidate],
      synchronize: true,
    });
  }
}

// Funzione helper per convertire data in timezone italiano
function toItalianTime(date: Date): Date {
  // Crea una data che rappresenti l'orario italiano come se fosse UTC
  // Questo "inganna" MongoDB facendogli salvare l'orario italiano
  const italianOffset = date.getTimezoneOffset() + (1 * 60); // UTC+1
  
  // Controlla se siamo in orario estivo (DST)
  const january = new Date(date.getFullYear(), 0, 1);
  const july = new Date(date.getFullYear(), 6, 1);
  const isDST = date.getTimezoneOffset() < Math.max(january.getTimezoneOffset(), july.getTimezoneOffset());
  
  const finalOffset = isDST ? italianOffset - 60 : italianOffset; // UTC+2 in estate, UTC+1 in inverno
  return new Date(date.getTime() - (finalOffset * 60000));
}

// Funzione helper per separare data e ora
function formatDateAndTime(date: Date): { date: string, time: string } {
  const italianDate = toItalianTime(date);
  
  // Formatta la data come YYYY-MM-DD
  const dateStr = italianDate.toISOString().split('T')[0];
  
  // Formatta l'ora come HH:mm:ss
  const timeStr = italianDate.toTimeString().split(' ')[0];
  
  return { date: dateStr, time: timeStr };
}

export async function logFind(tokenAddress: string, poolOpenDateTime: Date): Promise<void> {
  if (!MONGODB_URI) return;
  if (!connection) await initDB();

  const repo = getMongoRepository(Trade);
  const trade = new Trade();
  trade.tokenAddress = tokenAddress;
  
  const now = new Date();
  const { date: findDate, time: findTime } = formatDateAndTime(now);
  const { date: poolOpenDate, time: poolOpenTime } = formatDateAndTime(poolOpenDateTime);
  
  trade.findDateTime = toItalianTime(now);
  trade.findDate = findDate;
  trade.findTime = findTime;
  trade.poolOpenDateTime = toItalianTime(poolOpenDateTime);
  trade.poolOpenDate = poolOpenDate;
  trade.poolOpenTime = poolOpenTime;
  trade.instanceId = INSTANCE_ID;

  await repo.save(trade);
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
  if (!MONGODB_URI) return;
  if (!connection) await initDB();

  const repo = getMongoRepository(TokenCandidate);
  
  // Cerca se esiste già un record per questo token
  const existingCandidate = await repo.findOne({
    where: {
      tokenAddress,
      instanceId: INSTANCE_ID
    },
    order: { findTimestamp: -1 } // Prendi il più recente
  });

  const now = new Date();
  const { date: poolOpenDate, time: poolOpenTime } = formatDateAndTime(poolOpenDateTime);
  
  if (existingCandidate) {
    // Aggiorna il record esistente
    existingCandidate.symbol = tokenSymbol || existingCandidate.symbol;
    existingCandidate.status = status;
    existingCandidate.reason = reason || existingCandidate.reason;
    existingCandidate.filterInfo = filterInfo || existingCandidate.filterInfo;
    existingCandidate.latency = latency || existingCandidate.latency;
    
    await repo.save(existingCandidate);
  } else {
    // Crea un nuovo record
    const candidate = new TokenCandidate();
    candidate.tokenAddress = tokenAddress;
    candidate.symbol = tokenSymbol;
    candidate.findTimestamp = toItalianTime(now);
    candidate.poolOpenDate = poolOpenDate;
    candidate.poolOpenTime = poolOpenTime;
    candidate.status = status;
    candidate.reason = reason;
    candidate.filterInfo = filterInfo;
    candidate.latency = latency;
    candidate.instanceId = INSTANCE_ID;

    await repo.save(candidate);
  }
}

export async function logBuy(tokenAddress: string): Promise<void> {
  if (!MONGODB_URI) return;
  if (!connection) await initDB();

  const repo = getMongoRepository(Trade);
  const trade = await repo.findOne({
    where: {
      tokenAddress,
      buyDateTime: null,
      instanceId: INSTANCE_ID
    }
  });

  if (trade) {
    const now = new Date();
    const { date: buyDate, time: buyTime } = formatDateAndTime(now);
    
    trade.buyDateTime = toItalianTime(now);
    trade.buyDate = buyDate;
    trade.buyTime = buyTime;
    await repo.save(trade);
  }

  // Aggiorna anche TokenCandidate
  const candidateRepo = getMongoRepository(TokenCandidate);
  const candidate = await candidateRepo.findOne({
    where: {
      tokenAddress,
      status: 'found',
      instanceId: INSTANCE_ID
    }
  });

  if (candidate) {
    candidate.status = 'bought';
    await candidateRepo.save(candidate);
  }
}

export async function logSell(tokenAddress: string, gainLossPercentage: number): Promise<void> {
  if (!MONGODB_URI) return;
  if (!connection) await initDB();

  const repo = getMongoRepository(Trade);
  const trade = await repo.findOne({ 
    where: { 
      tokenAddress, 
      sellDateTime: null,
      instanceId: INSTANCE_ID 
    } 
  });

  if (trade) {
    const now = new Date();
    const { date: sellDate, time: sellTime } = formatDateAndTime(now);
    
    trade.sellDateTime = toItalianTime(now);
    trade.sellDate = sellDate;
    trade.sellTime = sellTime;
    trade.gainLossPercentage = gainLossPercentage;
    await repo.save(trade);
  }

  // Aggiorna anche TokenCandidate
  const candidateRepo = getMongoRepository(TokenCandidate);
  const candidate = await candidateRepo.findOne({
    where: {
      tokenAddress,
      status: 'bought',
      instanceId: INSTANCE_ID
    }
  });

  if (candidate) {
    candidate.status = 'sold';
    await candidateRepo.save(candidate);
  }
}
