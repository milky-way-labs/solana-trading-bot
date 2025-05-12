import { Filter, FilterResult } from './pool-filters';
import { Connection } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { logger, RATIO_TOKEN_POOL } from '../helpers';

export class TokenSupplyRatioFilter implements Filter {
  private cachedResult: FilterResult | undefined = undefined;

  constructor(private readonly connection: Connection) {}

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    console.log('TokenSupplyRatioFilter')
    if (this.cachedResult) {
      return this.cachedResult;
    }

    try {
      

      const tokenAmount = await this.connection.getTokenSupply(poolKeys.baseMint)

      logger.trace(`Token supply: ${tokenAmount.value.uiAmount}`);
      const baseTokenAmount = await this.connection.getTokenAccountBalance(poolKeys.baseVault);
      const quoteTokenAmount = await this.connection.getTokenAccountBalance(poolKeys.quoteVault);
      logger.trace(`Base token amount in pool: ${baseTokenAmount.value.uiAmount}`);
      logger.trace(`Quote token amount in pool: ${quoteTokenAmount.value.uiAmount}`);

      // Calculate percentage of tokens in pool vs total supply
      const percentageInPool = (baseTokenAmount.value.uiAmount! / tokenAmount.value.uiAmount!) * 100;
      logger.trace(`Percentage of tokens in pool: ${percentageInPool.toFixed(2)}%`);

      const result = {ok: true, message: ''}

      // If lesse than 99% of tokens are in pool, it's suspicious
      if (percentageInPool < RATIO_TOKEN_POOL) {
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

      logger.error({ mint: poolKeys.baseMint }, `Failed to check LP token supply ratio`);
    }

    return { ok: false, message: 'Failed to check LP token supply ratio' };
  }
}
