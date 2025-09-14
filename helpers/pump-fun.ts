import { PublicKey, Connection } from '@solana/web3.js';
import BN from 'bn.js';
import { logger } from './logger';
import { PUMP_FUN_PROGRAM_ID } from './constants';

export interface PumpFunToken {
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  description: string;
  imageUri: string;
  metadataUri: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  createdTimestamp: number;
  raydiumPool?: PublicKey;
  complete: boolean;
  virtualTokenReserves: BN;
  virtualSolReserves: BN;
  realTokenReserves: BN;
  realSolReserves: BN;
  tokenTotalSupply: BN;
  totalSupply: BN;
  marketCapSol: number;
  progress: number; // Bonding curve progress percentage (0-100)
}

export interface BondingCurveState {
  virtualTokenReserves: BN;
  virtualSolReserves: BN;
  realTokenReserves: BN;
  realSolReserves: BN;
  tokenTotalSupply: BN;
  complete: boolean;
}

export interface PumpFunCreateEvent {
  name: string;
  symbol: string;
  uri: string;
  mint: PublicKey;
  bondingCurve: PublicKey;
  user: PublicKey;
}

export interface PumpFunTradeEvent {
  mint: PublicKey;
  solAmount: BN;
  tokenAmount: BN;
  isBuy: boolean;
  user: PublicKey;
  timestamp: number;
  virtualSolReserves: BN;
  virtualTokenReserves: BN;
}

export interface PumpFunCompleteEvent {
  user: PublicKey;
  mint: PublicKey;
  bondingCurve: PublicKey;
  timestamp: number;
}

export class PumpFunHelper {
  private readonly BONDING_CURVE_SEED = 'bonding-curve';
  private readonly ASSOCIATED_BONDING_CURVE_SEED = 'associated-bonding-curve';
  private readonly METADATA_SEED = 'metadata';
  private readonly PUMP_PROGRAM = new PublicKey(PUMP_FUN_PROGRAM_ID);

  constructor(private readonly connection: Connection) {}

  /**
   * Derives the bonding curve PDA for a given mint
   */
  public getBondingCurvePDA(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(this.BONDING_CURVE_SEED), mint.toBuffer()],
      this.PUMP_PROGRAM
    );
  }

  /**
   * Derives the associated bonding curve PDA for a given mint
   */
  public getAssociatedBondingCurvePDA(mint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(this.ASSOCIATED_BONDING_CURVE_SEED), mint.toBuffer()],
      this.PUMP_PROGRAM
    );
  }

  /**
   * Calculates the current price based on bonding curve reserves
   */
  public calculatePrice(virtualSolReserves: BN, virtualTokenReserves: BN): number {
    if (virtualTokenReserves.isZero()) return 0;
    const solReservesLamports = virtualSolReserves.toNumber();
    const tokenReservesRaw = virtualTokenReserves.toNumber();
    
    // Convert from lamports to SOL and from raw tokens to readable tokens (6 decimals for pump.fun)
    const solReserves = solReservesLamports / 1e9; // SOL has 9 decimals
    const tokenReserves = tokenReservesRaw / 1e6; // pump.fun tokens have 6 decimals
    
    return solReserves / tokenReserves;
  }

  /**
   * Calculates the market cap based on current price and total supply
   */
  public calculateMarketCap(virtualSolReserves: BN, virtualTokenReserves: BN, totalSupply: BN): number {
    const price = this.calculatePrice(virtualSolReserves, virtualTokenReserves);
    const totalSupplyReadable = totalSupply.toNumber() / 1e6; // 6 decimals
    return price * totalSupplyReadable;
  }

  /**
   * Calculates bonding curve progress percentage
   */
  public calculateProgress(virtualSolReserves: BN): number {
    const BONDING_CURVE_LIMIT = 85_000_000_000; // 85 SOL in lamports
    const currentSol = virtualSolReserves.toNumber();
    return Math.min((currentSol / BONDING_CURVE_LIMIT) * 100, 100);
  }

  /**
   * Checks if a token has completed its bonding curve
   */
  public isCompleted(progress: number): boolean {
    return progress >= 100;
  }

  /**
   * Gets the amount of SOL needed to complete the bonding curve
   */
  public getSolToComplete(virtualSolReserves: BN): number {
    const BONDING_CURVE_LIMIT = 85_000_000_000; // 85 SOL in lamports
    const currentSol = virtualSolReserves.toNumber();
    const remaining = Math.max(0, BONDING_CURVE_LIMIT - currentSol);
    return remaining / 1e9; // Convert to SOL
  }

  /**
   * Parses pump.fun create instruction logs
   */
  public parseCreateEvent(logs: string[]): PumpFunCreateEvent | null {
    try {
      // Look for create event in logs
      for (const log of logs) {
        if (log.includes('Created token') || log.includes('create')) {
          // Parse the log to extract token details
          // This is a simplified parser - you may need to adjust based on actual log format
          const parts = log.split(' ');
          // Implementation depends on actual log format from pump.fun
          // You would need to analyze actual transaction logs to implement this properly
        }
      }
    } catch (error) {
      logger.error('Error parsing create event:', error);
    }
    return null;
  }

  /**
   * Parses pump.fun trade instruction logs
   */
  public parseTradeEvent(logs: string[], accountKeys: PublicKey[]): PumpFunTradeEvent | null {
    try {
      // Look for trade event in logs
      for (const log of logs) {
        if (log.includes('buy') || log.includes('sell') || log.includes('swap')) {
          // Parse the log to extract trade details
          // Implementation depends on actual log format
        }
      }
    } catch (error) {
      logger.error('Error parsing trade event:', error);
    }
    return null;
  }

  /**
   * Fetches bonding curve state from chain
   */
  public async getBondingCurveState(mint: PublicKey): Promise<BondingCurveState | null> {
    try {
      const [bondingCurve] = this.getBondingCurvePDA(mint);
      const accountInfo = await this.connection.getAccountInfo(bondingCurve);

      if (!accountInfo) {
        return null;
      }

      // Parse the account data based on pump.fun's bonding curve account structure
      const data = accountInfo.data;

      if (data.length < 41) { // Minimum expected size
        logger.debug(`Bonding curve account too small: ${data.length} bytes for ${mint.toString()}`);
        return null;
      }

      try {
        // Pump.fun bonding curve layout (based on common pump.fun structure):
        // 8 bytes: discriminator (skip)
        // 8 bytes: virtual_token_reserves (u64)
        // 8 bytes: virtual_sol_reserves (u64)
        // 8 bytes: real_token_reserves (u64)
        // 8 bytes: real_sol_reserves (u64)
        // 8 bytes: token_total_supply (u64)
        // 1 byte: complete (bool)

        let offset = 8; // Skip discriminator

        const virtualTokenReserves = new BN(data.subarray(offset, offset + 8), 'le');
        offset += 8;

        const virtualSolReserves = new BN(data.subarray(offset, offset + 8), 'le');
        offset += 8;

        const realTokenReserves = new BN(data.subarray(offset, offset + 8), 'le');
        offset += 8;

        const realSolReserves = new BN(data.subarray(offset, offset + 8), 'le');
        offset += 8;

        const tokenTotalSupply = new BN(data.subarray(offset, offset + 8), 'le');
        offset += 8;

        const complete = data[offset] === 1;

        const state = {
          virtualTokenReserves,
          virtualSolReserves,
          realTokenReserves,
          realSolReserves,
          tokenTotalSupply,
          complete,
        };

        logger.debug(`Parsed bonding curve for ${mint.toString()}: virtualSol=${virtualSolReserves.toString()}, complete=${complete}`);
        return state;

      } catch (parseError) {
        logger.debug(`Error parsing bonding curve data for ${mint.toString()}: ${parseError.message}`);

        // Fallback: try alternative layout if primary fails
        try {
          // Alternative layout - sometimes the structure might be slightly different
          const virtualSolReserves = new BN(data.subarray(16, 24), 'le'); // Try offset 16
          const virtualTokenReserves = new BN(data.subarray(24, 32), 'le');
          const tokenTotalSupply = new BN(1000000000).mul(new BN(1000000)); // 1B * 1e6 decimals

          if (!virtualSolReserves.isZero()) {
            logger.debug(`Used fallback parsing for ${mint.toString()}`);
            return {
              virtualTokenReserves,
              virtualSolReserves,
              realTokenReserves: virtualTokenReserves,
              realSolReserves: virtualSolReserves,
              tokenTotalSupply,
              complete: false,
            };
          }
        } catch (fallbackError) {
          // Silent fallback failure
        }

        return null;
      }
    } catch (error) {
      logger.error(`Error fetching bonding curve state for ${mint.toString()}: ${error.message}`);
      return null;
    }
  }

  /**
   * Checks if an instruction is a pump.fun instruction
   */
  public isPumpFunInstruction(programId: PublicKey): boolean {
    return programId.equals(this.PUMP_PROGRAM);
  }

  /**
   * Gets the instruction type from instruction data
   */
  public getInstructionType(data: Buffer): string {
    if (data.length === 0) return 'unknown';
    
    // First byte usually indicates instruction type in Solana programs
    const discriminator = data[0];
    
    switch (discriminator) {
      case 0:
        return 'create';
      case 1:
        return 'buy';
      case 2:
        return 'sell';
      case 3:
        return 'migrate'; // Complete bonding curve
      default:
        return 'unknown';
    }
  }
}

export const pumpFunHelper = new PumpFunHelper(new Connection(process.env.RPC_ENDPOINT || ''));