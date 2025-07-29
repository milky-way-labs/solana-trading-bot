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
  poolOpenDateTime: Date;

  @Column()
  buyDateTime: Date;

  @Column({ nullable: true })
  sellDateTime?: Date;

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
  tokenSymbol?: string;

  @Column()
  findDateTime: Date;

  @Column()
  poolOpenDateTime: Date;

  @Column()
  bought: boolean;

  @Column({ nullable: true })
  buyDateTime?: Date;

  @Column({ nullable: true })
  sellDateTime?: Date;

  @Column({ type: 'float', nullable: true })
  gainLossPercentage?: number;

  @Column({ nullable: true })
  notBoughtReason?: string;

  @Column({ nullable: true })
  filterDetails?: string;

  @Column()
  instanceId: string;

  @Column({ nullable: true })
  lag?: number;
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

export async function logFind(tokenAddress: string, poolOpenDateTime: Date): Promise<void> {
  if (!MONGODB_URI) return;
  if (!connection) await initDB();

  const repo = getMongoRepository(Trade);
  const trade = new Trade();
  trade.tokenAddress = tokenAddress;
  trade.findDateTime = toItalianTime(new Date());
  trade.poolOpenDateTime = toItalianTime(poolOpenDateTime);
  trade.instanceId = INSTANCE_ID;

  await repo.save(trade);
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

export async function logTokenCandidate(
  tokenAddress: string, 
  tokenSymbol: string | undefined,
  poolOpenDateTime: Date, 
  bought: boolean, 
  notBoughtReason?: string,
  filterDetails?: string,
  lag?: number
): Promise<void> {
  if (!MONGODB_URI) return;
  if (!connection) await initDB();

  const repo = getMongoRepository(TokenCandidate);
  const candidate = new TokenCandidate();
  candidate.tokenAddress = tokenAddress;
  candidate.tokenSymbol = tokenSymbol;
  
  // Converti esplicitamente in orario italiano
  candidate.findDateTime = toItalianTime(new Date());
  candidate.poolOpenDateTime = toItalianTime(poolOpenDateTime);
  candidate.bought = bought;
  candidate.notBoughtReason = notBoughtReason;
  candidate.filterDetails = filterDetails;
  candidate.lag = lag;
  candidate.instanceId = INSTANCE_ID;

  await repo.save(candidate);
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
    trade.buyDateTime = toItalianTime(new Date());
    await repo.save(trade);
  }

  // Aggiorna anche TokenCandidate
  const candidateRepo = getMongoRepository(TokenCandidate);
  const candidate = await candidateRepo.findOne({
    where: {
      tokenAddress,
      bought: true,
      buyDateTime: null,
      instanceId: INSTANCE_ID
    }
  });

  if (candidate) {
    candidate.buyDateTime = toItalianTime(new Date());
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
    trade.sellDateTime = toItalianTime(new Date());
    trade.gainLossPercentage = gainLossPercentage;
    await repo.save(trade);
  }

  // Aggiorna anche TokenCandidate
  const candidateRepo = getMongoRepository(TokenCandidate);
  const candidate = await candidateRepo.findOne({
    where: {
      tokenAddress,
      bought: true,
      sellDateTime: null,
      instanceId: INSTANCE_ID
    }
  });

  if (candidate) {
    candidate.sellDateTime = toItalianTime(new Date());
    candidate.gainLossPercentage = gainLossPercentage;
    await candidateRepo.save(candidate);
  }
}
