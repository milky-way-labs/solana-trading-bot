import { Keypair } from '@solana/web3.js';
import fs from 'fs';
import bs58 from 'bs58';

// Get private key from environment
const privateKeyString = '7bH3rqBpMcFkmKBp4QpWd1ZXDsgPogjDL8o9wbH94bGA6u3UbeejMxZnKPX77a5qiDysNNJDXxaA2Km6MiGus2M';

try {
  // Decode the base58 private key
  const privateKeyBytes = bs58.decode(privateKeyString);

  // Create keypair from private key
  const keypair = Keypair.fromSecretKey(privateKeyBytes);

  console.log('Wallet address:', keypair.publicKey.toString());

  // Save as JSON array format for Solana CLI
  const walletData = Array.from(keypair.secretKey);
  fs.writeFileSync('/tmp/trading-wallet.json', JSON.stringify(walletData));

  console.log('Wallet file saved to /tmp/trading-wallet.json');

} catch (error) {
  console.error('Error creating wallet file:', error);
}