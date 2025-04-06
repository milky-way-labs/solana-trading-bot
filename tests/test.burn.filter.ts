import { Connection, PublicKey } from '@solana/web3.js';
import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { BurnFilter } from '../filters';
import { createPoolKeys } from '../helpers';

async function testBurnFilter(tokenAddress: string) {
    // Create a connection to Solana mainnet
    const connection = new Connection('https://withered-still-fire.solana-mainnet.quiknode.pro/30250b1bd89bcc21eb001b4301525bfae31f96a1/', 'confirmed');
    
    // Create an instance of BurnFilter
    const burnFilter = new BurnFilter(connection);

    // Get all Raydium pools
    const accounts = await connection.getProgramAccounts(
        MAINNET_PROGRAM_ID.AmmV4,
        {
            filters: [
                { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
                {
                    memcmp: {
                        offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('baseMint'),
                        bytes: tokenAddress,
                    },
                },
            ],
        }
    );

    console.log(`Found ${accounts.length} pools for token ${tokenAddress}`);

    for (const account of accounts) {
        const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(account.account.data);
        
        // Get market data
        const market = await connection.getAccountInfo(poolState.marketId);
        if (!market) {
            console.log('No market data found for pool');
            continue;
        }

        // Create pool keys
        const poolKeys = createPoolKeys(
            account.pubkey,
            poolState,
            {
                bids: poolState.marketId,
                asks: poolState.marketId,
                eventQueue: poolState.marketId
            }
        );

        // Test the burn filter
        const result = await burnFilter.execute(poolKeys);
        console.log('Burn filter result:', result);
    }
}

// Main function to run the test
async function main() {
    // Example token address - replace with your token address
    const tokenAddress = '4FN9GkMNb66MGiqZA4D2KcYUkKFx7m2ueE6mp6ptNpYU';
    console.log(`Testing burn filter for token: ${tokenAddress}`);
    await testBurnFilter(tokenAddress);
}

// Run the test
main().catch(console.error);