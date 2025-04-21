import { Filter, FilterResult } from './pool-filters';
import { LiquidityPoolKeysV4, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { extractInitialUsdcAmount, getToken, logger } from '../helpers';

export class InitialLiquidityUsdcValueFilter implements Filter {
  constructor(
    private readonly quoteToken: Token,
    private readonly minInitialLiquidityValue: TokenAmount,
  ) {}

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    try {
      let inRange = true;

      if (!this.minInitialLiquidityValue?.isZero()) {
        // fixme: proxy
        // fixme: wsol!!!
        const usdc = await extractInitialUsdcAmount(poolKeys.baseMint.toString(), null);

        if (usdc) {
          const usdcAmount = new TokenAmount(getToken('USDC'), usdc, false);

          inRange = usdcAmount.raw.gte(this.minInitialLiquidityValue.raw);

          if (!inRange) {
            return {
              ok: false,
              message: `InitialLiquidityValue -> Initial liquidity value ${usdcAmount.toFixed()} < ${this.minInitialLiquidityValue.toFixed()}`,
            };
          }
        } else {
          logger.error({ mint: poolKeys.baseMint }, `Failed to check initial liquidity value`);
          throw new Error('Cannot read initial liquidity value');
        }
      }

      return { ok: inRange };
    } catch (error) {
      logger.error(
        {
          mint: poolKeys.baseMint,
          error: error,
        },
        `Failed to check initial liquidity value`,
      );
    }

    return { ok: false, message: 'InitialLiquidityValue -> Failed to check initial liquidity value' };
  }
}
