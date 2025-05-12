import { Connection, PublicKey } from '@solana/web3.js';
import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID } from '@raydium-io/raydium-sdk';
import { createPoolKeys } from '../helpers';
import { TokenSupplyRatioFilter } from '../filters/supply-ratio.filter';

async function testTokenSupplyRatioFilter(tokenAddress: string) {
    // Create a connection to Solana mainnet
    const connection = new Connection('https://withered-still-fire.solana-mainnet.quiknode.pro/30250b1bd89bcc21eb001b4301525bfae31f96a1/', 'confirmed');
    
    // Create an instance of BurnFilter
    const tokenSupplyRatioFilter = new TokenSupplyRatioFilter(connection);

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
        const result = await tokenSupplyRatioFilter.execute(poolKeys);
        console.log('Token supply ratio filter result:', result);
    }
}

// Main function to run the test
async function main() {
    // Example token address - replace with your token address
    const tokenAddress = '4FN9GkMNb66MGiqZA4D2KcYUkKFx7m2ueE6mp6ptNpYU';
    console.log(`Testing token supply ratio filter for token: ${tokenAddress}`);
    await testTokenSupplyRatioFilter(tokenAddress);
}

// Run the test
main().catch(console.error);