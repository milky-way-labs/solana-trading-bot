import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../helpers/logger';
import { PumpFunHelper, BondingCurveState, PumpFunToken } from '../helpers/pump-fun';
import { 
  PUMP_FUN_MIN_MARKET_CAP, 
  PUMP_FUN_MAX_MARKET_CAP, 
  PUMP_FUN_BONDING_CURVE_THRESHOLD 
} from '../helpers/constants';

export interface PumpFunFilterConfig {
  minMarketCap?: number;
  maxMarketCap?: number;
  minBondingCurveProgress?: number;
  maxBondingCurveProgress?: number;
  onlyNewTokens?: boolean;
  excludeCompleted?: boolean;
  includeCompleted?: boolean;
  minLiquidity?: number;
  maxAge?: number; // in seconds
}

export class PumpFunFilter {
  private pumpFunHelper: PumpFunHelper;

  constructor(private readonly connection: Connection) {
    this.pumpFunHelper = new PumpFunHelper(connection);
  }

  /**
   * Checks if a pump.fun token passes all filters
   */
  public async checkToken(
    mint: PublicKey,
    config: PumpFunFilterConfig = {}
  ): Promise<{ 
    passed: boolean; 
    reasons: string[]; 
    tokenData?: Partial<PumpFunToken>;
    bondingCurveState?: BondingCurveState;
  }> {
    const reasons: string[] = [];
    let passed = true;

    try {
      // Get bonding curve state
      const bondingCurveState = await this.pumpFunHelper.getBondingCurveState(mint);
      if (!bondingCurveState) {
        reasons.push('Failed to fetch bonding curve state');
        return { passed: false, reasons };
      }

      // Calculate metrics
      const progress = this.pumpFunHelper.calculateProgress(bondingCurveState.virtualSolReserves);
      const marketCap = this.pumpFunHelper.calculateMarketCap(
        bondingCurveState.virtualSolReserves,
        bondingCurveState.virtualTokenReserves,
        bondingCurveState.tokenTotalSupply
      );
      const isCompleted = bondingCurveState.complete || progress >= 100;

      logger.debug(`Pump.fun token ${mint.toString()} - Progress: ${progress.toFixed(2)}%, MarketCap: $${marketCap.toFixed(2)}, Completed: ${isCompleted}`);

      // Market cap filters
      const minMarketCap = config.minMarketCap ?? PUMP_FUN_MIN_MARKET_CAP;
      const maxMarketCap = config.maxMarketCap ?? PUMP_FUN_MAX_MARKET_CAP;

      if (minMarketCap > 0 && marketCap < minMarketCap) {
        reasons.push(`Market cap too low: $${marketCap.toFixed(2)} < $${minMarketCap}`);
        passed = false;
      }

      if (maxMarketCap > 0 && marketCap > maxMarketCap) {
        reasons.push(`Market cap too high: $${marketCap.toFixed(2)} > $${maxMarketCap}`);
        passed = false;
      }

      // Bonding curve progress filters
      const minProgress = config.minBondingCurveProgress ?? 0;
      const maxProgress = config.maxBondingCurveProgress ?? PUMP_FUN_BONDING_CURVE_THRESHOLD;

      if (progress < minProgress) {
        reasons.push(`Bonding curve progress too low: ${progress.toFixed(2)}% < ${minProgress}%`);
        passed = false;
      }

      if (progress > maxProgress) {
        reasons.push(`Bonding curve progress too high: ${progress.toFixed(2)}% > ${maxProgress}%`);
        passed = false;
      }

      // Completion filters
      if (config.excludeCompleted && isCompleted) {
        reasons.push('Token bonding curve is completed (migrated to Raydium)');
        passed = false;
      }

      if (config.includeCompleted === false && isCompleted) {
        reasons.push('Only incomplete tokens allowed');
        passed = false;
      }

      // Liquidity filter
      if (config.minLiquidity && config.minLiquidity > 0) {
        const solLiquidity = bondingCurveState.realSolReserves.toNumber() / 1e9; // Convert to SOL
        if (solLiquidity < config.minLiquidity) {
          reasons.push(`Liquidity too low: ${solLiquidity.toFixed(4)} SOL < ${config.minLiquidity} SOL`);
          passed = false;
        }
      }

      const result = {
        passed,
        reasons,
        bondingCurveState,
        tokenData: {
          mint,
          progress,
          marketCapSol: marketCap,
          isCompleted,
          virtualSolReserves: bondingCurveState.virtualSolReserves,
          virtualTokenReserves: bondingCurveState.virtualTokenReserves,
        } as Partial<PumpFunToken>
      };

      if (passed) {
        logger.info(`✅ Pump.fun token ${mint.toString()} passed all filters`);
      } else {
        logger.debug(`❌ Pump.fun token ${mint.toString()} failed filters: ${reasons.join(', ')}`);
      }

      return result;

    } catch (error) {
      logger.error(`Error checking pump.fun token ${mint.toString()}:`, error);
      reasons.push(`Filter check error: ${error.message}`);
      return { passed: false, reasons };
    }
  }

  /**
   * Checks if a token is newly created (within specified age)
   */
  public async isNewToken(mint: PublicKey, maxAgeSeconds: number = 3600): Promise<boolean> {
    try {
      // This would require checking the token creation timestamp
      // For now, we'll assume all tokens from pump.fun events are "new"
      // In a real implementation, you'd track creation times or check blockchain data
      return true;
    } catch (error) {
      logger.error(`Error checking token age for ${mint.toString()}:`, error);
      return false;
    }
  }

  /**
   * Gets detailed token information for analysis
   */
  public async getTokenAnalysis(mint: PublicKey): Promise<{
    mint: PublicKey;
    bondingCurveState?: BondingCurveState;
    progress: number;
    marketCap: number;
    price: number;
    isCompleted: boolean;
    solToComplete: number;
    analysis: {
      momentum: 'high' | 'medium' | 'low';
      risk: 'high' | 'medium' | 'low';
      potential: 'high' | 'medium' | 'low';
    };
  } | null> {
    try {
      const bondingCurveState = await this.pumpFunHelper.getBondingCurveState(mint);
      if (!bondingCurveState) {
        return null;
      }

      const progress = this.pumpFunHelper.calculateProgress(bondingCurveState.virtualSolReserves);
      const marketCap = this.pumpFunHelper.calculateMarketCap(
        bondingCurveState.virtualSolReserves,
        bondingCurveState.virtualTokenReserves,
        bondingCurveState.tokenTotalSupply
      );
      const price = this.pumpFunHelper.calculatePrice(
        bondingCurveState.virtualSolReserves,
        bondingCurveState.virtualTokenReserves
      );
      const isCompleted = bondingCurveState.complete || progress >= 100;
      const solToComplete = this.pumpFunHelper.getSolToComplete(bondingCurveState.virtualSolReserves);

      // Simple analysis logic
      const analysis = {
        momentum: this.calculateMomentum(progress, marketCap),
        risk: this.calculateRisk(progress, isCompleted),
        potential: this.calculatePotential(progress, solToComplete)
      };

      return {
        mint,
        bondingCurveState,
        progress,
        marketCap,
        price,
        isCompleted,
        solToComplete,
        analysis
      };

    } catch (error) {
      logger.error(`Error getting token analysis for ${mint.toString()}:`, error);
      return null;
    }
  }

  private calculateMomentum(progress: number, marketCap: number): 'high' | 'medium' | 'low' {
    // High momentum: rapid progress and growing market cap
    if (progress > 50 && marketCap > 20000) return 'high';
    if (progress > 25 && marketCap > 8000) return 'medium';
    return 'low';
  }

  private calculateRisk(progress: number, isCompleted: boolean): 'high' | 'medium' | 'low' {
    // Lower risk for tokens closer to completion
    if (isCompleted) return 'low';
    if (progress > 80) return 'low';
    if (progress > 40) return 'medium';
    return 'high';
  }

  private calculatePotential(progress: number, solToComplete: number): 'high' | 'medium' | 'low' {
    // High potential if close to completion with reasonable capital needed
    if (progress > 70 && solToComplete < 25) return 'high';
    if (progress > 40 && solToComplete < 50) return 'medium';
    return 'low';
  }

  /**
   * Batch filter multiple tokens
   */
  public async filterTokens(
    mints: PublicKey[],
    config: PumpFunFilterConfig = {}
  ): Promise<{
    passed: PublicKey[];
    failed: Array<{ mint: PublicKey; reasons: string[] }>;
  }> {
    const passed: PublicKey[] = [];
    const failed: Array<{ mint: PublicKey; reasons: string[] }> = [];

    for (const mint of mints) {
      const result = await this.checkToken(mint, config);
      if (result.passed) {
        passed.push(mint);
      } else {
        failed.push({ mint, reasons: result.reasons });
      }
    }

    logger.info(`Pump.fun batch filter results: ${passed.length} passed, ${failed.length} failed`);
    return { passed, failed };
  }
}