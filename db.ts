import { Entity, Column, PrimaryGeneratedColumn, createConnection, getConnection, getRepository, Connection } from 'typeorm';
import { join } from 'path';

@Entity()
export class Trade {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tokenAddress: string;

  @Column()
  buyDateTime: Date;

  @Column({ nullable: true })
  sellDateTime?: Date;

  @Column({ type: 'float', nullable: true })
  gainLossPercentage?: number;
}

let connection: Connection | null = null;

export async function initDB() {
  if (!connection) {
    connection = await createConnection({
      type: 'sqlite',
      database: join(__dirname, 'trades.sqlite'),
      entities: [Trade],
      synchronize: true,
    });
  }
}

export async function logBuy(tokenAddress: string): Promise<void> {
  if (!connection) await initDB();

  const repo = getRepository(Trade);
  const trade = new Trade();
  trade.tokenAddress = tokenAddress;
  trade.buyDateTime = new Date();

  await repo.save(trade);
}

export async function logSell(tokenAddress: string, gainLossPercentage: number): Promise<void> {
  if (!connection) await initDB();

  const repo = getRepository(Trade);
  const trade = await repo.findOne({ where: { tokenAddress, sellDateTime: null } });

  if (trade) {
    trade.sellDateTime = new Date();
    trade.gainLossPercentage = gainLossPercentage;
    await repo.save(trade);
  }
}
