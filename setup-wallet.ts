import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  createSyncNativeInstruction,
  getAccount
} from '@solana/spl-token';
import { getWallet, RPC_ENDPOINT } from './helpers';
import { logger } from './helpers/logger';

async function setupWallet() {
  try {
    logger.info('Setting up wallet for trading...');

    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const wallet = getWallet(process.env.PRIVATE_KEY!.trim());

    logger.info(`Wallet address: ${wallet.publicKey.toString()}`);

    // Check SOL balance with retry
    let solBalance = 0;
    for (let i = 0; i < 3; i++) {
      try {
        solBalance = await connection.getBalance(wallet.publicKey);
        break;
      } catch (error) {
        logger.warn(`Balance check attempt ${i + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    logger.info(`SOL balance: ${solBalance / 1e9} SOL`);

    if (solBalance === 0) {
      logger.error('Wallet has no SOL balance. Please add SOL to the wallet first.');
      return;
    }

    // Get WSOL associated token account
    const wsolMint = new PublicKey('So11111111111111111111111111111111111111112'); // WSOL mint
    const wsolAccount = await getAssociatedTokenAddress(wsolMint, wallet.publicKey);

    logger.info(`WSOL token account: ${wsolAccount.toString()}`);

    // Check if WSOL account exists
    let accountExists = false;
    try {
      await getAccount(connection, wsolAccount);
      accountExists = true;
      logger.info('WSOL token account already exists');
    } catch (error) {
      logger.info('WSOL token account does not exist, will create it');
    }

    if (!accountExists) {
      // Create WSOL token account and wrap some SOL
      const transaction = new Transaction();

      // Create associated token account
      transaction.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          wsolAccount,
          wallet.publicKey,
          wsolMint
        )
      );

      // Transfer 0.01 SOL to the WSOL account (much more than the 0.001 needed for trading)
      const wrapAmount = 0.01 * 1e9; // 0.01 SOL in lamports

      transaction.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: wsolAccount,
          lamports: wrapAmount,
        })
      );

      // Sync native (wrap the SOL)
      transaction.add(createSyncNativeInstruction(wsolAccount));

      logger.info('Creating WSOL token account and wrapping 0.01 SOL...');

      const signature = await connection.sendTransaction(transaction, [wallet], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction(signature, 'confirmed');

      logger.info(`Successfully created WSOL account and wrapped SOL: ${signature}`);
      logger.info(`Transaction: https://solscan.io/tx/${signature}`);
    }

    // Verify final state
    try {
      const wsolAccountInfo = await getAccount(connection, wsolAccount);
      const wsolBalance = Number(wsolAccountInfo.amount) / 1e9; // Convert to SOL
      logger.info(`WSOL balance: ${wsolBalance} WSOL`);

      if (wsolBalance >= 0.001) {
        logger.info('✅ Wallet is now ready for trading!');
      } else {
        logger.warn('⚠️ WSOL balance is low, consider adding more');
      }
    } catch (error) {
      logger.error('Failed to verify WSOL account:', error);
    }

  } catch (error) {
    logger.error('Error setting up wallet:', error);
  }
}

setupWallet().catch(console.error);