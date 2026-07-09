import type { Address } from "viem";
import { parseAbi } from "viem";
import type { ChainId } from "@/lib/types";

// ---------------------------------------------------------------------------
// Client-safe CurveLaunchpad bindings: deployed addresses (env), ABI, and the
// exact bigint curve math the contract runs, so quotes and minOut bounds match
// onchain results to the wei. Server-side event scanning lives in lib/launchpad.ts.
// ---------------------------------------------------------------------------

/** CurveLaunchpad deployments. Empty env = curve not live on that chain, UI shows preview data. */
export const CURVE_ADDRESSES: Record<ChainId, Address | null> = {
  8453: (process.env.NEXT_PUBLIC_CURVE_ADDRESS_8453 as Address | undefined) || null,
  84532: (process.env.NEXT_PUBLIC_CURVE_ADDRESS_84532 as Address | undefined) || null
};

export function curveAddress(chainId: ChainId): Address | null {
  return CURVE_ADDRESSES[chainId];
}

/** Mirrors CurveLaunchpad.TOTAL_SUPPLY (1B tokens, 18 decimals). */
export const CURVE_TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n;
export const BPS = 10_000n;

export const curveLaunchpadAbi = parseAbi([
  "function launch(string name, string symbol, string contractURI, bytes32 userSalt) returns (address token)",
  "function buy(address token, uint256 minTokensOut) payable returns (uint256 tokensOut)",
  "function sell(address token, uint256 tokenAmount, uint256 minEthOut) returns (uint256 ethOut)",
  "function claimFees(address token) returns (uint256 amount)",
  "function pools(address token) view returns (address creator, uint128 realEth, uint128 tokenReserve, bool graduated)",
  "function creatorFees(address token) view returns (uint256)",
  "function spotPrice(address token) view returns (uint256)",
  "function VIRTUAL_ETH() view returns (uint256)",
  "function GRAD_ETH() view returns (uint256)",
  "function FEE_BPS() view returns (uint256)",
  "function CREATOR_SHARE_BPS() view returns (uint256)",
  "event Launched(address indexed token, address indexed creator, string name, string symbol, string contractURI)",
  "event Trade(address indexed token, address indexed trader, bool indexed isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 fee, uint256 realEth, uint256 tokenReserve)",
  "event Graduated(address indexed token, uint256 ethToLp, uint256 tokensToLp, uint256 tokensBurned)"
]);

/** Economics constants read once from the deployed contract and threaded to the client. */
export type CurveParams = {
  virtualEth: string; // wei, as string for RSC serialization
  gradEth: string;
  feeBps: number;
  creatorShareBps: number;
};

/** Live reserves for one pool, post-latest-trade. Strings for RSC serialization. */
export type CurveReserves = {
  realEth: string; // wei
  tokenReserve: string; // base units
};

export type CurveQuote = {
  /** Base units (buy) or wei (sell) out, before slippage tolerance. */
  amountOut: bigint;
  priceImpactPct: number;
};

/** Exact mirror of CurveLaunchpad.buy math. */
export function quoteBuy(ethInWei: bigint, reserves: { realEth: bigint; tokenReserve: bigint }, params: { virtualEth: bigint; feeBps: bigint }): CurveQuote {
  if (ethInWei <= 0n) return { amountOut: 0n, priceImpactPct: 0 };
  const fee = (ethInWei * params.feeBps) / BPS;
  const ethNet = ethInWei - fee;
  const vEth = params.virtualEth + reserves.realEth;
  const k = params.virtualEth * CURVE_TOTAL_SUPPLY;
  const newVTok = k / (vEth + ethNet);
  const tokensOut = reserves.tokenReserve - newVTok;
  const impact = spotImpact(vEth, reserves.tokenReserve, vEth + ethNet, newVTok);
  return { amountOut: tokensOut > 0n ? tokensOut : 0n, priceImpactPct: impact };
}

/** Exact mirror of CurveLaunchpad.sell math. */
export function quoteSell(tokensIn: bigint, reserves: { realEth: bigint; tokenReserve: bigint }, params: { virtualEth: bigint; feeBps: bigint }): CurveQuote {
  if (tokensIn <= 0n) return { amountOut: 0n, priceImpactPct: 0 };
  const vEth = params.virtualEth + reserves.realEth;
  const k = params.virtualEth * CURVE_TOTAL_SUPPLY;
  const newVTok = reserves.tokenReserve + tokensIn;
  const ethGross = vEth - k / newVTok;
  if (ethGross <= 0n) return { amountOut: 0n, priceImpactPct: 0 };
  const fee = (ethGross * params.feeBps) / BPS;
  const impact = spotImpact(vEth, reserves.tokenReserve, vEth - ethGross, newVTok);
  return { amountOut: ethGross - fee, priceImpactPct: Math.abs(impact) };
}

function spotImpact(vEth: bigint, vTok: bigint, newVEth: bigint, newVTok: bigint): number {
  // price = vEth/vTok; impact in % computed in float, display-only.
  const before = Number(vEth) / Number(vTok);
  const after = Number(newVEth) / Number(newVTok);
  if (!Number.isFinite(before) || before === 0) return 0;
  return ((after - before) / before) * 100;
}

/** Spot price in ETH per whole token, as a display float. */
export function spotPriceEth(reserves: { realEth: bigint; tokenReserve: bigint }, virtualEth: bigint): number {
  if (reserves.tokenReserve === 0n) return 0;
  return Number(virtualEth + reserves.realEth) / Number(reserves.tokenReserve);
}

// ---------------------------------------------------------------------------
// Shared board/coin data shape, produced by lib/launchpad.ts (live) and
// lib/launchpad-mock.ts (preview). ETH-denominated: no oracle, no fake USD.
// ---------------------------------------------------------------------------

export type LaunchStatus = "bonding" | "graduating" | "graduated";

export type CurveToken = {
  address: Address;
  chainId: ChainId;
  name: string;
  symbol: string;
  creator: Address;
  status: LaunchStatus;
  priceEth: number;
  marketCapEth: number;
  /** Curve reserve (pre-grad) / null once liquidity moved to the DEX. */
  liquidityEth: number | null;
  /** Volume over the scanned window; null when unknown. */
  volumeEth: number | null;
  /** Price change over the scanned window; null when unknown. */
  changePct: number | null;
  /** Holder count; null in live mode (needs a full transfer index to be honest). */
  holders: number | null;
  bondingProgress: number; // 0..1
  ageMinutes: number | null;
  /** Raw reserves for exact client-side quoting; null in preview mode. */
  reserves: CurveReserves | null;
};

export type PricePoint = { t: number; price: number };
export type TradeRow = { side: "buy" | "sell"; trader: Address; ethAmount: number; tokenAmount: number; minutesAgo: number };
export type HolderRow = { address: Address; pct: number; isCreator: boolean };

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function subscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUBSCRIPT_DIGITS[Number(d)])
    .join("");
}

/**
 * Human-readable token price in ETH. Never scientific notation:
 * plain decimals down to 0.000001, then the DEX-screener subscript form
 * (0.0₇78 = seven zeros then 78) so micro-cap prices stay scannable.
 */
export function fmtPriceEth(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1000) return Math.round(n).toLocaleString();
  if (n >= 0.01) return trimZeros(n.toFixed(4));
  if (n >= 1e-6) return trimZeros(n.toFixed(8));
  const zeros = Math.floor(-Math.log10(n)) - 1;
  const digits = Math.round(n * 10 ** (zeros + 3));
  return `0.0${subscript(zeros)}${String(digits).replace(/0+$/, "") || "0"}`;
}

function trimZeros(s: string): string {
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/** Compact USD, for market caps: $12.4K / $3.20M. */
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(n < 10 ? 2 : 0)}`;
}

export function fmtEth(n: number): string {
  if (n === 0) return "0 ETH";
  if (n < 0.001) return `${n.toExponential(1)} ETH`;
  if (n < 1) return `${n.toFixed(3)} ETH`;
  if (n < 1000) return `${n.toFixed(2)} ETH`;
  return `${(n / 1000).toFixed(2)}K ETH`;
}

export function fmtAge(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}
