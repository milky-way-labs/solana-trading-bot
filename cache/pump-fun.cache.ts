import { PublicKey } from '@solana/web3.js';
import { logger } from '../helpers/logger';
import { PumpFunToken, BondingCurveState } from '../helpers/pump-fun';

interface CachedPumpFunToken extends PumpFunToken {
  lastUpdated: number;
  firstSeen: number;
}

interface PumpFunCacheStats {
  totalTokens: number;
  activeTokens: number;
  completedTokens: number;
  totalMarketCap: number;
  avgProgress: number;
  lastCleanup: number;
}

export class PumpFunCache {
  private tokens = new Map<string, CachedPumpFunToken>();
  private bondingCurves = new Map<string, BondingCurveState & { lastUpdated: number }>();
  private newTokens = new Set<string>(); // Track newly discovered tokens
  private completedTokens = new Set<string>(); // Track completed bonding curves
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL
  private readonly CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes cleanup interval
  private readonly MAX_TOKENS = 10000; // Maximum tokens to cache

  constructor() {
    // Periodic cleanup
    setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Add or update a pump.fun token in cache
   */
  public set(mint: PublicKey, token: Partial<PumpFunToken>): void {
    const mintStr = mint.toString();
    const now = Date.now();
    
    const existing = this.tokens.get(mintStr);
    const cachedToken: CachedPumpFunToken = {
      ...existing,
      ...token,
      mint,
      lastUpdated: now,
      firstSeen: existing?.firstSeen || now,
    } as CachedPumpFunToken;

    // Track new tokens
    if (!existing) {
      this.newTokens.add(mintStr);
      logger.debug(`Added new pump.fun token to cache: ${mintStr}`);
    }

    // Track completed tokens
    if (cachedToken.complete && !this.completedTokens.has(mintStr)) {
      this.completedTokens.add(mintStr);
      logger.info(`Pump.fun token completed bonding curve: ${mintStr}`);
    }

    this.tokens.set(mintStr, cachedToken);

    // Enforce max size
    if (this.tokens.size > this.MAX_TOKENS) {
      this.evictOldest();
    }
  }

  /**
   * Get a pump.fun token from cache
   */
  public get(mint: PublicKey): CachedPumpFunToken | undefined {
    const mintStr = mint.toString();
    const token = this.tokens.get(mintStr);
    
    if (token) {
      // Check if token is still fresh
      const age = Date.now() - token.lastUpdated;
      if (age > this.CACHE_TTL) {
        logger.debug(`Pump.fun token cache expired for ${mintStr}, age: ${age}ms`);
        return undefined;
      }
    }
    
    return token;
  }

  /**
   * Check if a token exists in cache
   */
  public has(mint: PublicKey): boolean {
    return this.tokens.has(mint.toString());
  }

  /**
   * Remove a token from cache
   */
  public delete(mint: PublicKey): boolean {
    const mintStr = mint.toString();
    this.newTokens.delete(mintStr);
    this.completedTokens.delete(mintStr);
    this.bondingCurves.delete(mintStr);
    return this.tokens.delete(mintStr);
  }

  /**
   * Update bonding curve state for a token
   */
  public setBondingCurve(mint: PublicKey, state: BondingCurveState): void {
    const mintStr = mint.toString();
    this.bondingCurves.set(mintStr, {
      ...state,
      lastUpdated: Date.now(),
    });

    // Update token with new bonding curve data
    const existingToken = this.tokens.get(mintStr);
    if (existingToken) {
      existingToken.virtualSolReserves = state.virtualSolReserves;
      existingToken.virtualTokenReserves = state.virtualTokenReserves;
      existingToken.realSolReserves = state.realSolReserves;
      existingToken.realTokenReserves = state.realTokenReserves;
      existingToken.complete = state.complete;
      existingToken.lastUpdated = Date.now();
      this.tokens.set(mintStr, existingToken);
    }
  }

  /**
   * Get bonding curve state for a token
   */
  public getBondingCurve(mint: PublicKey): BondingCurveState | undefined {
    const mintStr = mint.toString();
    const cached = this.bondingCurves.get(mintStr);
    
    if (cached) {
      const age = Date.now() - cached.lastUpdated;
      if (age <= this.CACHE_TTL) {
        return cached;
      }
    }
    
    return undefined;
  }

  /**
   * Get all tokens matching criteria
   */
  public getTokens(filter?: {
    completed?: boolean;
    minProgress?: number;
    maxProgress?: number;
    minMarketCap?: number;
    maxAge?: number;
  }): CachedPumpFunToken[] {
    const now = Date.now();
    const results: CachedPumpFunToken[] = [];

    for (const token of this.tokens.values()) {
      // Skip expired tokens
      if (now - token.lastUpdated > this.CACHE_TTL) {
        continue;
      }

      // Apply filters
      if (filter) {
        if (filter.completed !== undefined && token.complete !== filter.completed) {
          continue;
        }
        
        if (filter.minProgress !== undefined && token.progress < filter.minProgress) {
          continue;
        }
        
        if (filter.maxProgress !== undefined && token.progress > filter.maxProgress) {
          continue;
        }
        
        if (filter.minMarketCap !== undefined && token.marketCapSol < filter.minMarketCap) {
          continue;
        }
        
        if (filter.maxAge !== undefined) {
          const age = (now - token.firstSeen) / 1000; // Convert to seconds
          if (age > filter.maxAge) {
            continue;
          }
        }
      }

      results.push(token);
    }

    return results;
  }

  /**
   * Get newly discovered tokens since last check
   */
  public getNewTokens(): PublicKey[] {
    const newTokens = Array.from(this.newTokens).map(mint => new PublicKey(mint));
    this.newTokens.clear(); // Clear after reading
    return newTokens;
  }

  /**
   * Get recently completed tokens
   */
  public getRecentlyCompleted(): PublicKey[] {
    return Array.from(this.completedTokens).map(mint => new PublicKey(mint));
  }

  /**
   * Get cache statistics
   */
  public getStats(): PumpFunCacheStats {
    const tokens = this.getTokens();
    const completed = tokens.filter(t => t.complete);
    const totalMarketCap = tokens.reduce((sum, t) => sum + (t.marketCapSol || 0), 0);
    const avgProgress = tokens.length > 0 
      ? tokens.reduce((sum, t) => sum + t.progress, 0) / tokens.length 
      : 0;

    return {
      totalTokens: this.tokens.size,
      activeTokens: tokens.filter(t => !t.complete).length,
      completedTokens: completed.length,
      totalMarketCap,
      avgProgress,
      lastCleanup: this.lastCleanup || 0,
    };
  }

  /**
   * Get top tokens by criteria
   */
  public getTopTokens(criteria: 'progress' | 'marketCap' | 'newest', limit = 10): CachedPumpFunToken[] {
    const tokens = this.getTokens();
    
    switch (criteria) {
      case 'progress':
        return tokens
          .sort((a, b) => b.progress - a.progress)
          .slice(0, limit);
      
      case 'marketCap':
        return tokens
          .sort((a, b) => (b.marketCapSol || 0) - (a.marketCapSol || 0))
          .slice(0, limit);
      
      case 'newest':
        return tokens
          .sort((a, b) => b.firstSeen - a.firstSeen)
          .slice(0, limit);
      
      default:
        return tokens.slice(0, limit);
    }
  }

  private lastCleanup = 0;

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removedTokens = 0;
    let removedBondingCurves = 0;

    // Clean expired tokens
    for (const [mintStr, token] of this.tokens.entries()) {
      if (now - token.lastUpdated > this.CACHE_TTL * 2) { // Keep tokens a bit longer
        this.tokens.delete(mintStr);
        this.newTokens.delete(mintStr);
        removedTokens++;
      }
    }

    // Clean expired bonding curves
    for (const [mintStr, curve] of this.bondingCurves.entries()) {
      if (now - curve.lastUpdated > this.CACHE_TTL) {
        this.bondingCurves.delete(mintStr);
        removedBondingCurves++;
      }
    }

    // Clear old completed tokens (keep only recent ones)
    if (this.completedTokens.size > 1000) {
      const tokensToRemove = Array.from(this.completedTokens).slice(0, 500);
      tokensToRemove.forEach(mint => this.completedTokens.delete(mint));
    }

    this.lastCleanup = now;

    if (removedTokens > 0 || removedBondingCurves > 0) {
      logger.debug(`Pump.fun cache cleanup: removed ${removedTokens} tokens, ${removedBondingCurves} bonding curves`);
    }
  }

  /**
   * Evict oldest tokens when cache is full
   */
  private evictOldest(): void {
    const tokens = Array.from(this.tokens.entries())
      .sort(([, a], [, b]) => a.lastUpdated - b.lastUpdated);

    const toRemove = Math.floor(this.tokens.size * 0.1); // Remove 10% of oldest
    for (let i = 0; i < toRemove; i++) {
      const [mintStr] = tokens[i];
      this.tokens.delete(mintStr);
      this.newTokens.delete(mintStr);
      this.bondingCurves.delete(mintStr);
    }

    logger.debug(`Evicted ${toRemove} oldest pump.fun tokens from cache`);
  }

  /**
   * Clear all cache
   */
  public clear(): void {
    this.tokens.clear();
    this.bondingCurves.clear();
    this.newTokens.clear();
    this.completedTokens.clear();
    logger.info('Cleared pump.fun cache');
  }

  /**
   * Get cache size info
   */
  public size(): {
    tokens: number;
    bondingCurves: number;
    newTokens: number;
    completedTokens: number;
  } {
    return {
      tokens: this.tokens.size,
      bondingCurves: this.bondingCurves.size,
      newTokens: this.newTokens.size,
      completedTokens: this.completedTokens.size,
    };
  }
}

// Export singleton instance
export const pumpFunCache = new PumpFunCache();