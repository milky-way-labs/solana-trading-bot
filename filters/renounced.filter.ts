import { Filter, FilterResult } from './pool-filters';
import { MintLayout } from '@solana/spl-token';
import { Connection } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { logger } from '../helpers';

export class RenouncedFreezeFilter implements Filter {
  private readonly errorMessage: string[] = [];
  private cachedResult: FilterResult | undefined = undefined;

  constructor(
    private readonly connection: Connection,
    private readonly checkRenounced: boolean,
    private readonly checkFreezable: boolean,
  ) {
    if (this.checkRenounced) {
      this.errorMessage.push('mint');
    }

    if (this.checkFreezable) {
      this.errorMessage.push('freeze');
    }
  }

  getName(): string {
    return 'RenouncedFreezeFilter';
  }

  async execute(poolKeys: LiquidityPoolKeysV4): Promise<FilterResult> {
    if (this.cachedResult) {
      return this.cachedResult;
    }

    try {
      const accountInfo = await this.connection.getAccountInfo(poolKeys.baseMint, this.connection.commitment);
      if (!accountInfo?.data) {
        return { ok: false, message: 'RenouncedFreeze -> Failed to fetch account data' };
      }

      const deserialize = MintLayout.decode(accountInfo.data);
      const renounced = !this.checkRenounced || deserialize.mintAuthorityOption === 0;
      const freezable = !this.checkFreezable || deserialize.freezeAuthorityOption !== 0;
      const ok = renounced && !freezable;
      const message: string[] = [];

      if (!renounced) {
        message.push('mint');
      }

      if (freezable) {
        message.push('freeze');
      }

      const result = {
        ok: ok,
        message: ok ? undefined : `RenouncedFreeze -> Creator can ${message.join(' and ')} tokens`,
      };

      if (result.ok) {
        this.cachedResult = result;
      }

      return result;
    } catch (e) {
      logger.error(
        { mint: poolKeys.baseMint },
        `RenouncedFreeze -> Failed to check if creator can ${this.errorMessage.join(' and ')} tokens`,
      );
    }

    return {
      ok: false,
      message: `RenouncedFreeze -> Failed to check if creator can ${this.errorMessage.join(' and ')} tokens`,
    };
  }
}
