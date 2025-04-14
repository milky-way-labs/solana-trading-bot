import { Filter, FilterResult } from './pool-filters';
import { LiquidityPoolKeysV4, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { Connection } from '@solana/web3.js';
import { analyzeAddLiquidityForToken, logger } from '../helpers';

export class InitialLiquidityValueFilter implements Filter {
  constructor(
    private readonly connection: Connection,
    private readonly quoteToken: Token,
    private readonly minInitialLiquidityValue: TokenAmount,
  ) {}

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    try {
      let inRange = true;

      if (!this.minInitialLiquidityValue?.isZero()) {
        const liquidity = await analyzeAddLiquidityForToken(this.connection, poolKeys.baseMint, this.quoteToken);

        if (liquidity) {
          const wsolAmount = new TokenAmount(this.quoteToken, liquidity.wsolAdded);

          inRange = wsolAmount.raw.gte(this.minInitialLiquidityValue.raw);

          if (!inRange) {
            return {
              ok: false,
              message: `InitialLiquidityValue -> Initial liquidity value ${wsolAmount.toFixed()} < ${this.minInitialLiquidityValue.toFixed()}`,
            };
          }
        } else {
          logger.warn({ mint: poolKeys.baseMint }, `Failed to check initial liquidity value`);
        }
      }

      return { ok: inRange };
    } catch (error) {
      logger.error(
        {
          mint: poolKeys.baseMint,
          error: JSON.stringify(error),
        },
        `Failed to check initial liquidity value`,
      );
    }

    return { ok: false, message: 'InitialLiquidityValue -> Failed to check initial liquidity value' };
  }
}
