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
  buyDateTime: Date;

  @Column({ nullable: true })
  sellDateTime?: Date;

  @Column({ type: 'float', nullable: true })
  gainLossPercentage?: number;

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
      entities: [Trade],
      synchronize: true,
    });
  }
}

export async function logBuy(tokenAddress: string): Promise<void> {
  if (!MONGODB_URI) return;
  if (!connection) await initDB();

  const repo = getMongoRepository(Trade);
  const trade = new Trade();
  trade.tokenAddress = tokenAddress;
  trade.buyDateTime = new Date();
  trade.instanceId = INSTANCE_ID;

  await repo.save(trade);
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
    trade.sellDateTime = new Date();
    trade.gainLossPercentage = gainLossPercentage;
    await repo.save(trade);
  }
}
