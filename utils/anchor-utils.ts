import { Program, AnchorProvider, Idl, NodeWallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Commitment } from '@solana/web3.js';
import cpSwapIdl from './idl/raydium_cp_swap.json';

// Program ID del programma CP-Swap
export const CPMM_PROGRAM_ID = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');

/**
 * Crea un provider Anchor per CP-Swap.
 * @param connection - La connessione Solana da utilizzare
 * @param wallet - Un wallet opzionale (default: NodeWallet.local())
 * @param commitment - Il commitment level (default: 'confirmed')
 * @returns Un AnchorProvider configurato
 */
function createCpSwapProvider(
  connection: Connection,
  wallet = NodeWallet.local(),
  commitment: Commitment = 'confirmed'
): AnchorProvider {
  return new AnchorProvider(connection, wallet, { commitment });
}

/**
 * Crea un'istanza del programma Anchor per CP-Swap.
 * @param connection - La connessione Solana da utilizzare
 * @param wallet - Un wallet opzionale
 * @param commitment - Il commitment level opzionale
 * @returns L'istanza del programma Anchor
 */
export function createCpSwapProgram(
  connection: Connection,
  wallet?: NodeWallet,
  commitment?: Commitment
): Program {
  const provider = createCpSwapProvider(connection, wallet, commitment);
  return new Program(cpSwapIdl as Idl, CPMM_PROGRAM_ID, provider);
}

/**
 * Ottiene la dimensione dell'account Pool dal programma Anchor.
 * @param program - L'istanza del programma Anchor CP-Swap
 * @returns La dimensione dell'account Pool in byte
 */
export function getPoolAccountSize(program: Program): number {
  return program.account.pool.size;
} 