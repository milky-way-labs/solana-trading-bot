// @ts-nocheck
// poolInfo.ts
import { struct, blob, u8, u16, u32, s32, seq } from '@solana/buffer-layout';
import { publicKey, u64 as u64Layout } from '@solana/buffer-layout-utils';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

// buffer-layout-utils for ora offre solo u64; creiamo una u128 LE
const u128Layout = (property?: string) => blob(16, property);

/** Converte una sequenza di byte Little-Endian in BigInt. */
const toBigIntLE = (bytes: Uint8Array): bigint => {
  // @ts-ignore
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; --i) {
    // @ts-ignore
    value = (value << 8n) + BigInt(bytes[i]);
  }
  return value;
};

/** Converte un campo 64 bit LE in BigInt. */
const readU64 = (v: Uint8Array) => toBigIntLE(v);

/** Converte un campo 128 bit LE in BigInt. */
const readU128 = (v: Uint8Array) => toBigIntLE(v);

/* ------------------------------------------------------------------ */
/*  (Opzionale) Layout RewardInfo: adegua se la tua struct è diversa. */
/* ------------------------------------------------------------------ */
export const RewardInfoLayout = struct([
// @ts-ignore
  publicKey('mint'),
// @ts-ignore
  publicKey('vault'),
// @ts-ignore
  u64Layout('emissionsPerSecondX64'),
// @ts-ignore
  u128Layout('growthGlobalX64'),
// @ts-ignore
  u64Layout('authority'),
// @ts-ignore
  u64Layout('openTime'),
]);

/* ------------------------------------------------------------------ */
/*  Layout principale PoolInfo                                        */
/* ------------------------------------------------------------------ */
export const PoolInfoLayout = struct([
  // @ts-ignore
  blob(8, 'discriminator'),           // 8 byte
// @ts-ignore
  u8('bump'),

// @ts-ignore
  publicKey('ammConfig'),
// @ts-ignore
  publicKey('creator'),

// @ts-ignore
  publicKey('mintA'),
// @ts-ignore
  publicKey('mintB'),
// @ts-ignore
  publicKey('vaultA'),
// @ts-ignore
  publicKey('vaultB'),
// @ts-ignore
  publicKey('observationId'),

// @ts-ignore
  u8('mintDecimalsA'),
// @ts-ignore
  u8('mintDecimalsB'),
// @ts-ignore
  u16('tickSpacing'),

// @ts-ignore
  u128Layout('liquidity'),
// @ts-ignore
  u128Layout('sqrtPriceX64'),

// @ts-ignore
  s32('tickCurrent'),
// @ts-ignore
  u32('reservedU32'),

// @ts-ignore
  u128Layout('feeGrowthGlobalX64A'),
// @ts-ignore
  u128Layout('feeGrowthGlobalX64B'),

// @ts-ignore
  u64Layout('protocolFeesTokenA'),
// @ts-ignore
  u64Layout('protocolFeesTokenB'),

// @ts-ignore
  u128Layout('swapInAmountTokenA'),
// @ts-ignore
  u128Layout('swapOutAmountTokenB'),
// @ts-ignore
  u128Layout('swapInAmountTokenB'),
// @ts-ignore
  u128Layout('swapOutAmountTokenA'),

// @ts-ignore
  u8('status'),
// @ts-ignore
  seq(u8(), 7, 'reserved7'),

// @ts-ignore
  seq(RewardInfoLayout, 3, 'rewardInfos'),
// @ts-ignore
  seq(u64Layout(), 16, 'tickArrayBitmap'),

// @ts-ignore
  u64Layout('totalFeesTokenA'),
// @ts-ignore
  u64Layout('totalFeesClaimedTokenA'),
// @ts-ignore
  u64Layout('totalFeesTokenB'),
// @ts-ignore
  u64Layout('totalFeesClaimedTokenB'),

// @ts-ignore
  u64Layout('fundFeesTokenA'),
// @ts-ignore
  u64Layout('fundFeesTokenB'),

// @ts-ignore
  u64Layout('startTime'),

// @ts-ignore
  seq(u64Layout(), 15 * 4 - 3, 'padding'),
]);

/* ------------------------------------------------------------------ */
/*  Decoder di alto livello                                           */
/* ------------------------------------------------------------------ */
export interface PoolInfo {
  bump: number;
  ammConfig: PublicKey;
  creator: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  observationId: PublicKey;
  mintDecimalsA: number;
  mintDecimalsB: number;
  tickSpacing: number;
  liquidity: bigint;
  sqrtPriceX64: bigint;
  tickCurrent: number;
  feeGrowthGlobalX64A: bigint;
  feeGrowthGlobalX64B: bigint;
  protocolFeesTokenA: bigint;
  protocolFeesTokenB: bigint;
  swapInAmountTokenA: bigint;
  swapOutAmountTokenB: bigint;
  swapInAmountTokenB: bigint;
  swapOutAmountTokenA: bigint;
  status: number;
  rewardInfos: ReturnType<typeof parseRewardInfo>[];
  tickArrayBitmap: bigint[];
  totalFeesTokenA: bigint;
  totalFeesClaimedTokenA: bigint;
  totalFeesTokenB: bigint;
  totalFeesClaimedTokenB: bigint;
  fundFeesTokenA: bigint;
  fundFeesTokenB: bigint;
  startTime: bigint;
}

const parseRewardInfo = (raw: any) => ({
  mint: new PublicKey(raw.mint),
  vault: new PublicKey(raw.vault),
  emissionsPerSecondX64: readU64(raw.emissionsPerSecondX64),
  growthGlobalX64: readU128(raw.growthGlobalX64),
  authority: readU64(raw.authority),
  openTime: readU64(raw.openTime),
});

/** Decodifica il buffer in un oggetto PoolInfo. */
export function parsePoolInfo(buf: Buffer): PoolInfo {
  const raw = PoolInfoLayout.decode(buf);

  return {
    bump: raw.bump,
    ammConfig: new PublicKey(raw.ammConfig),
    creator: new PublicKey(raw.creator),

    mintA: new PublicKey(raw.mintA),
    mintB: new PublicKey(raw.mintB),
    vaultA: new PublicKey(raw.vaultA),
    vaultB: new PublicKey(raw.vaultB),
    observationId: new PublicKey(raw.observationId),

    mintDecimalsA: raw.mintDecimalsA,
    mintDecimalsB: raw.mintDecimalsB,
    tickSpacing: raw.tickSpacing,

    liquidity: readU128(raw.liquidity),
    sqrtPriceX64: readU128(raw.sqrtPriceX64),

    tickCurrent: raw.tickCurrent,
    feeGrowthGlobalX64A: readU128(raw.feeGrowthGlobalX64A),
    feeGrowthGlobalX64B: readU128(raw.feeGrowthGlobalX64B),

    protocolFeesTokenA: readU64(raw.protocolFeesTokenA),
    protocolFeesTokenB: readU64(raw.protocolFeesTokenB),

    swapInAmountTokenA: readU128(raw.swapInAmountTokenA),
    swapOutAmountTokenB: readU128(raw.swapOutAmountTokenB),
    swapInAmountTokenB: readU128(raw.swapInAmountTokenB),
    swapOutAmountTokenA: readU128(raw.swapOutAmountTokenA),

    status: raw.status,

    rewardInfos: raw.rewardInfos.map(parseRewardInfo),

    tickArrayBitmap: raw.tickArrayBitmap.map(readU64),

    totalFeesTokenA: readU64(raw.totalFeesTokenA),
    totalFeesClaimedTokenA: readU64(raw.totalFeesClaimedTokenA),
    totalFeesTokenB: readU64(raw.totalFeesTokenB),
    totalFeesClaimedTokenB: readU64(raw.totalFeesClaimedTokenB),

    fundFeesTokenA: readU64(raw.fundFeesTokenA),
    fundFeesTokenB: readU64(raw.fundFeesTokenB),

    startTime: readU64(raw.startTime),
  };
}

/**
 * Converte un oggetto PoolInfo in un oggetto compatibile con LIQUIDITY_STATE_LAYOUT_V4 (Raydium CLMM)
 */
export function poolInfoToLiquidityStateLayoutV4(pool: PoolInfo, creationTime: number): any {
  // Helper per array di BN
  const toBNArray = (arr: bigint[], len: number) =>
    Array.from({ length: len }, (_, i) => new BN((arr[i] ?? 0n).toString()));

  // Helper per array di zero BN
  const zeroBNArray = (len: number) => Array.from({ length: len }, () => new BN(0));

  // Helper per array di zero u8
  const zeroU8Array = (len: number) => new Uint8Array(len);

  // Helper per rewardInfos (semplificato, da adattare se serve la struttura completa)
  const rewardInfos = Array.from({ length: 3 }, (_, i) => {
    const r = pool.rewardInfos?.[i];
    return {
      rewardState: 0, // default
      openTime: new BN(r?.openTime?.toString() ?? '0'),
      endTime: new BN(0),
      lastUpdateTime: new BN(0),
      emissionsPerSecondX64: new BN(r?.emissionsPerSecondX64?.toString() ?? '0'),
      rewardTotalEmissioned: new BN(0),
      rewardClaimed: new BN(0),
      tokenMint: r?.mint ?? PublicKey.default,
      tokenVault: r?.vault ?? PublicKey.default,
      authority: PublicKey.default,
      rewardGrowthGlobalX64: new BN(r?.growthGlobalX64?.toString() ?? '0'),
    };
  });

  return {
    bump: pool.bump,
    ammConfig: pool.ammConfig,
    owner: pool.creator,
    tokenMint0: pool.mintA,
    tokenMint1: pool.mintB,
    tokenVault0: pool.vaultA,
    tokenVault1: pool.vaultB,
    observationKey: pool.observationId,
    mintDecimals0: pool.mintDecimalsA,
    mintDecimals1: pool.mintDecimalsB,
    tickSpacing: pool.tickSpacing,
    liquidity: new BN(pool.liquidity.toString()),
    sqrtPriceX64: new BN(pool.sqrtPriceX64.toString()),
    tickCurrent: pool.tickCurrent,
    padding3: 0,
    padding4: 0,
    feeGrowthGlobal0X64: new BN(pool.feeGrowthGlobalX64A.toString()),
    feeGrowthGlobal1X64: new BN(pool.feeGrowthGlobalX64B.toString()),
    protocolFeesToken0: new BN(pool.protocolFeesTokenA.toString()),
    protocolFeesToken1: new BN(pool.protocolFeesTokenB.toString()),
    swapInAmountToken0: new BN(pool.swapInAmountTokenA.toString()),
    swapOutAmountToken1: new BN(pool.swapOutAmountTokenB.toString()),
    swapInAmountToken1: new BN(pool.swapInAmountTokenB.toString()),
    swapOutAmountToken0: new BN(pool.swapOutAmountTokenA.toString()),
    status: pool.status,
    padding: zeroU8Array(7),
    rewardInfos,
    tickArrayBitmap: toBNArray(pool.tickArrayBitmap, 16),
    totalFeesToken0: new BN(pool.totalFeesTokenA.toString()),
    totalFeesClaimedToken0: new BN(pool.totalFeesClaimedTokenA.toString()),
    totalFeesToken1: new BN(pool.totalFeesTokenB.toString()),
    totalFeesClaimedToken1: new BN(pool.totalFeesClaimedTokenB.toString()),
    fundFeesToken0: new BN(pool.fundFeesTokenA.toString()),
    fundFeesToken1: new BN(pool.fundFeesTokenB.toString()),
    openTime: new BN(creationTime),
    recentEpoch: new BN(0),
    padding1: zeroBNArray(24),
    padding2: zeroBNArray(32),
    baseMint: pool.mintB,
    quoteMint: pool.mintA,
  };
}