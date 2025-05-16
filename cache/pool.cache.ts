import { LiquidityStateV4 } from '@raydium-io/raydium-sdk';
import { logger } from '../helpers';

export class PoolCache {
  private readonly keys: Map<string, { id: string; state: LiquidityStateV4, sold: boolean, poolType: string }> = new Map<
    string,
    { id: string; state: LiquidityStateV4, sold: boolean, poolType: string }
  >();

  public save(id: string, state: LiquidityStateV4, poolType: string) {
    if (!this.keys.has(state.baseMint.toString())) {
      logger.trace(`Caching new pool for mint: ${state.baseMint.toString()}`);
      this.keys.set(state.baseMint.toString(), { id, state, sold: false, poolType });
    }
  }

  public async get(mint: string): Promise<{ id: string; state: LiquidityStateV4, sold: boolean, poolType: string }> {
      return this.keys.get(mint)!;
  }

  public async markAsSold(mint: string) {
    //important, so we don't try to sell the same pool twice
    const pool = this.keys.get(mint);
    if (pool) {
      pool.sold = true;
      this.keys.set(mint, pool);
    }
  }
}
