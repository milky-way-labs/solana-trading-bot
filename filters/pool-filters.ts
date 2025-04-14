import { Connection } from '@solana/web3.js';
import { LiquidityPoolKeysV4, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { BurnFilter } from './burn.filter';
import { MutableFilter } from './mutable.filter';
import { RenouncedFreezeFilter } from './renounced.filter';
import { PoolSizeFilter } from './pool-size.filter';
import { 
  CHECK_IF_BURNED,
  CHECK_IF_FREEZABLE, 
  CHECK_IF_MINT_IS_RENOUNCED, 
  CHECK_IF_MUTABLE, 
  CHECK_IF_SOCIALS, 
  CHECK_TOKEN_DISTRIBUTION,
  CHECK_HOLDERS,
  logger } from '../helpers';
import { HoldersCountFilter, TopHolderDistributionFilter } from './holders';
import { BlacklistFilter } from './blacklist.filter';
import { BlacklistCache } from '../cache';
import { InitialLiquidityValueFilter } from './initial-liquidity-value.filter';

export interface Filter {
  execute(poolKeysV4: LiquidityPoolKeysV4): Promise<FilterResult>;
}

export interface FilterResult {
  ok: boolean;
  message?: string;
}

export interface PoolFilterArgs {
  minPoolSize: TokenAmount;
  maxPoolSize: TokenAmount;
  minInitialLiquidityValue: TokenAmount;
  quoteToken: Token;
}

export class PoolFilters {
  private readonly filters: Filter[] = [];

  constructor(
    readonly connection: Connection,
    readonly args: PoolFilterArgs,
    readonly blacklistCache: BlacklistCache
  ) {
    if (CHECK_HOLDERS) {
      this.filters.push(new HoldersCountFilter(connection));
    }

    if (CHECK_TOKEN_DISTRIBUTION) {
      this.filters.push(new TopHolderDistributionFilter(connection));
    }

    if (CHECK_IF_BURNED) {
      this.filters.push(new BurnFilter(connection));
    }

    if (CHECK_IF_MINT_IS_RENOUNCED || CHECK_IF_FREEZABLE) {
      this.filters.push(new RenouncedFreezeFilter(connection, CHECK_IF_MINT_IS_RENOUNCED, CHECK_IF_FREEZABLE));
    }

    if (CHECK_IF_MUTABLE || CHECK_IF_SOCIALS) {
      this.filters.push(
        new MutableFilter(connection, getMetadataAccountDataSerializer(), CHECK_IF_MUTABLE, CHECK_IF_SOCIALS),
      );
    }

    // not optional
    this.filters.push(new BlacklistFilter(connection, blacklistCache));

    if (!args.minPoolSize.isZero() || !args.maxPoolSize.isZero()) {
      this.filters.push(
        new PoolSizeFilter(
          connection,
          args.quoteToken,
          args.minPoolSize,
          args.maxPoolSize,
        ),
      );
    }

    if (!args.minInitialLiquidityValue.isZero()) {
      this.filters.push(
        new InitialLiquidityValueFilter(
          connection,
          args.quoteToken,
          args.minInitialLiquidityValue,
        ),
      );
    }
  }

  public async execute(poolKeys: LiquidityPoolKeysV4): Promise<boolean> {
    if (this.filters.length === 0) {
      return true;
    }

    const result = await Promise.all(this.filters.map((f) => f.execute(poolKeys)));
    const pass = result.every((r) => r.ok);

    if (pass) {
      return true;
    }

    for (const filterResult of result.filter((r) => !r.ok)) {
      logger.trace(filterResult.message);
    }

    return false;
  }
}
