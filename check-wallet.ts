import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getWallet, RPC_ENDPOINT } from './helpers';
import { logger } from './helpers/logger';

async function checkWallet() {
  try {
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const wallet = getWallet(process.env.PRIVATE_KEY!.trim());

    logger.info(`Checking wallet: ${wallet.publicKey.toString()}`);

    // Check native SOL balance
    try {
      const solBalance = await connection.getBalance(wallet.publicKey);
      logger.info(`Native SOL balance: ${solBalance / 1e9} SOL`);
    } catch (error) {
      logger.error('Error checking SOL balance:', error.message);
    }

    // Check WSOL token account
    const wsolMint = new PublicKey('So11111111111111111111111111111111111111112');
    const wsolAccount = await getAssociatedTokenAddress(wsolMint, wallet.publicKey);

    logger.info(`Expected WSOL account: ${wsolAccount.toString()}`);

    try {
      const accountInfo = await getAccount(connection, wsolAccount);
      logger.info(`WSOL token account found!`);
      logger.info(`WSOL balance: ${Number(accountInfo.amount) / 1e9} WSOL`);
      logger.info(`Owner: ${accountInfo.owner.toString()}`);
      logger.info(`Mint: ${accountInfo.mint.toString()}`);
    } catch (error) {
      logger.error('WSOL token account not found:', error.message);
      logger.info('The bot needs a WSOL token account to work.');

      // Check if it's just that the account doesn't exist
      const accountInfo = await connection.getAccountInfo(wsolAccount);
      if (!accountInfo) {
        logger.info('Account does not exist on chain');
      } else {
        logger.info('Account exists but cannot be parsed as token account');
        logger.info(`Account owner: ${accountInfo.owner.toString()}`);
        logger.info(`Account data length: ${accountInfo.data.length}`);
      }
    }

    // List all token accounts for this wallet
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        wallet.publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      logger.info(`Found ${tokenAccounts.value.length} token accounts:`);
      tokenAccounts.value.forEach((account, index) => {
        const parsed = account.account.data.parsed;
        const info = parsed.info;
        logger.info(`${index + 1}. ${account.pubkey.toString()}`);
        logger.info(`   Mint: ${info.mint}`);
        logger.info(`   Balance: ${info.tokenAmount.uiAmount} ${info.mint === wsolMint.toString() ? 'WSOL' : 'tokens'}`);
      });
    } catch (error) {
      logger.error('Error listing token accounts:', error.message);
    }

  } catch (error) {
    logger.error('Error checking wallet:', error);
  }
}

checkWallet().catch(console.error);