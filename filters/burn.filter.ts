import { Filter, FilterResult } from './pool-filters';
import { Connection } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { logger } from '../helpers';

export class BurnFilter implements Filter {
  private cachedResult: FilterResult | undefined = undefined;

  constructor(private readonly connection: Connection) {}

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    if (this.cachedResult) {
      return this.cachedResult;
    }

    try {
      const amount = await this.connection.getTokenSupply(poolKeys.lpMint, this.connection.commitment);
      // Check if the LP token supply is 0, which means the creator burned their LP tokens
      // This is a good sign as it means they can't rug pull by removing liquidity
      const burned = amount.value.uiAmount === 0;
      const result = { ok: burned, message: burned ? undefined : "Burned -> Creator didn't burn LP" };

      const tokenAmount = await this.connection.getTokenSupply(poolKeys.baseMint)

      logger.trace(`Token supply: ${tokenAmount.value.uiAmount}`);
      const baseTokenAmount = await this.connection.getTokenAccountBalance(poolKeys.baseVault);
      const quoteTokenAmount = await this.connection.getTokenAccountBalance(poolKeys.quoteVault);
      logger.trace(`Base token amount in pool: ${baseTokenAmount.value.uiAmount}`);
      logger.trace(`Quote token amount in pool: ${quoteTokenAmount.value.uiAmount}`);

      // Calculate percentage of tokens in pool vs total supply
      const percentageInPool = (baseTokenAmount.value.uiAmount! / tokenAmount.value.uiAmount!) * 100;
      logger.trace(`Percentage of tokens in pool: ${percentageInPool.toFixed(2)}%`);

      // If lesse than 99% of tokens are in pool, it's suspicious
      if (percentageInPool < 99) {
        result.ok = false;
        result.message = `Suspicious: ${percentageInPool.toFixed(2)}% of total token supply is in pool`;
      }

      if (result.ok) {
        this.cachedResult = result;
      }

      return result;
    } catch (e: any) {
      if (e.code == -32602) {
        return { ok: true };
      }

      logger.error({ mint: poolKeys.baseMint }, `Failed to check if LP is burned`);
    }

    return { ok: false, message: 'Failed to check if LP is burned' };
  }
}
