import type { Address } from "viem";
import { getAddress, isAddress } from "viem";
import { getPublicClient } from "@/lib/report";
import {
  CURVE_TOTAL_SUPPLY,
  curveAddress,
  curveLaunchpadAbi,
  spotPriceEth,
  type CurveParams,
  type CurveToken,
  type LaunchStatus,
  type PricePoint,
  type TradeRow
} from "@/lib/curve";
import type { ChainId } from "@/lib/types";

// ---------------------------------------------------------------------------
// Server-side reads for the live CurveLaunchpad. Same lite-indexer approach as
// lib/explore.ts: a bounded window of Launched/Trade events scanned back from
// head, then per-pool state reads. Honest by construction — anything the window
// can't prove (holders, all-time volume) is null, and the UI shows "—".
// ---------------------------------------------------------------------------

const CHUNK: Record<ChainId, bigint> = { 8453: 9_000n, 84532: 1_900n };
const MAX_CHUNKS = 4;
const BASE_BLOCK_SECONDS = 2;

export type BoardData = {
  chainId: ChainId;
  live: boolean;
  tokens: CurveToken[];
  params: CurveParams | null;
  scannedBlocks: number;
  error: string | null;
};

export type CoinData = {
  live: true;
  token: CurveToken;
  params: CurveParams;
  history: PricePoint[];
  trades: TradeRow[];
};

/** Coin page loader: live curve data only. Null when the curve isn't deployed on this chain. */
export async function getCoinPageData(chainId: ChainId, address: string): Promise<CoinData | null> {
  if (!curveAddress(chainId)) return null;
  return getLiveCoin(chainId, address);
}

async function readCurveParams(chainId: ChainId, pad: Address): Promise<CurveParams> {
  const client = getPublicClient(chainId);
  const [virtualEth, gradEth, feeBps, creatorShareBps] = await Promise.all([
    client.readContract({ address: pad, abi: curveLaunchpadAbi, functionName: "VIRTUAL_ETH" }),
    client.readContract({ address: pad, abi: curveLaunchpadAbi, functionName: "GRAD_ETH" }),
    client.readContract({ address: pad, abi: curveLaunchpadAbi, functionName: "FEE_BPS" }),
    client.readContract({ address: pad, abi: curveLaunchpadAbi, functionName: "CREATOR_SHARE_BPS" })
  ]);
  return {
    virtualEth: (virtualEth as bigint).toString(),
    gradEth: (gradEth as bigint).toString(),
    feeBps: Number(feeBps),
    creatorShareBps: Number(creatorShareBps)
  };
}

type ScanResult = {
  launched: { token: Address; creator: Address; name: string; symbol: string; block: bigint }[];
  trades: { token: Address; trader: Address; isBuy: boolean; ethAmount: bigint; tokenAmount: bigint; realEth: bigint; tokenReserve: bigint; block: bigint }[];
  fromBlock: bigint;
  latest: bigint;
  scanned: number;
  error: string | null;
};

/** One windowed scan for both event types, newest window first. */
async function scanCurveEvents(chainId: ChainId, pad: Address): Promise<ScanResult> {
  const client = getPublicClient(chainId);
  const chunk = CHUNK[chainId];
  const latest = await client.getBlockNumber();

  const launched: ScanResult["launched"] = [];
  const trades: ScanResult["trades"] = [];
  let to = latest;
  let scanned = 0;
  let lastError: string | null = null;
  let from = latest;

  for (let i = 0; i < MAX_CHUNKS; i++) {
    from = to > chunk ? to - chunk : 0n;
    scanned += Number(to - from);
    try {
      const [launchEvents, tradeEvents] = await Promise.all([
        client.getContractEvents({ address: pad, abi: curveLaunchpadAbi, eventName: "Launched", fromBlock: from, toBlock: to }),
        client.getContractEvents({ address: pad, abi: curveLaunchpadAbi, eventName: "Trade", fromBlock: from, toBlock: to })
      ]);
      for (const e of launchEvents) {
        if (!e.args?.token) continue;
        launched.push({
          token: getAddress(e.args.token as Address),
          creator: getAddress((e.args.creator ?? "0x0000000000000000000000000000000000000000") as Address),
          name: typeof e.args.name === "string" ? e.args.name : "",
          symbol: typeof e.args.symbol === "string" ? e.args.symbol : "",
          block: e.blockNumber ?? 0n
        });
      }
      for (const e of tradeEvents) {
        if (!e.args?.token) continue;
        trades.push({
          token: getAddress(e.args.token as Address),
          trader: getAddress((e.args.trader ?? "0x0000000000000000000000000000000000000000") as Address),
          isBuy: Boolean(e.args.isBuy),
          ethAmount: (e.args.ethAmount as bigint) ?? 0n,
          tokenAmount: (e.args.tokenAmount as bigint) ?? 0n,
          realEth: (e.args.realEth as bigint) ?? 0n,
          tokenReserve: (e.args.tokenReserve as bigint) ?? 0n,
          block: e.blockNumber ?? 0n
        });
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message.split("\n")[0] : "Log scan failed";
    }
    if (from === 0n) break;
    to = from - 1n;
  }

  return { launched, trades, fromBlock: from, latest, scanned, error: lastError };
}

function toEth(wei: bigint): number {
  return Number(wei) / 1e18;
}

function statusFrom(graduated: boolean, progress: number): LaunchStatus {
  if (graduated) return "graduated";
  return progress >= 0.9 ? "graduating" : "bonding";
}

function buildToken(
  chainId: ChainId,
  address: Address,
  creator: Address,
  name: string,
  symbol: string,
  pool: { realEth: bigint; tokenReserve: bigint; graduated: boolean },
  params: { virtualEth: bigint; gradEth: bigint },
  extras: { volumeEth: number | null; changePct: number | null; ageMinutes: number | null }
): CurveToken {
  const price = pool.graduated || pool.tokenReserve === 0n ? 0 : spotPriceEth(pool, params.virtualEth);
  const progress = pool.graduated ? 1 : Math.min(1, toEth(pool.realEth) / toEth(params.gradEth));
  return {
    address,
    chainId,
    name,
    symbol,
    creator,
    status: statusFrom(pool.graduated, progress),
    priceEth: price,
    marketCapEth: price * Number(CURVE_TOTAL_SUPPLY / 10n ** 18n),
    liquidityEth: pool.graduated ? null : toEth(pool.realEth),
    volumeEth: extras.volumeEth,
    changePct: extras.changePct,
    holders: null,
    bondingProgress: progress,
    ageMinutes: extras.ageMinutes,
    readyToGraduate: !pool.graduated && pool.realEth >= params.gradEth,
    reserves: pool.graduated ? null : { realEth: pool.realEth.toString(), tokenReserve: pool.tokenReserve.toString() }
  };
}

/** Board data for /explore: live when the curve is deployed on this chain, otherwise not live. */
export async function getLiveBoard(chainId: ChainId): Promise<BoardData> {
  const pad = curveAddress(chainId);
  if (!pad) return { chainId, live: false, tokens: [], params: null, scannedBlocks: 0, error: null };

  try {
    const [params, scan] = await Promise.all([readCurveParams(chainId, pad), scanCurveEvents(chainId, pad)]);
    const virtualEth = BigInt(params.virtualEth);
    const gradEth = BigInt(params.gradEth);
    const client = getPublicClient(chainId);

    // Every token that launched or traded inside the window.
    const known = new Map<Address, { creator: Address; name: string; symbol: string; block: bigint | null }>();
    for (const l of scan.launched) known.set(l.token, { creator: l.creator, name: l.name, symbol: l.symbol, block: l.block });
    for (const t of scan.trades) {
      if (!known.has(t.token)) known.set(t.token, { creator: "0x0000000000000000000000000000000000000000", name: "", symbol: "", block: null });
    }

    const tokens: CurveToken[] = [];
    for (const [address, meta] of known) {
      const [creator, realEth, tokenReserve, graduated] = (await client.readContract({
        address: pad,
        abi: curveLaunchpadAbi,
        functionName: "pools",
        args: [address]
      })) as readonly [Address, bigint, bigint, boolean];
      if (creator === "0x0000000000000000000000000000000000000000") continue;

      // Identity for tokens that only traded in-window comes from the B20 itself.
      let { name, symbol } = meta;
      if (!symbol) {
        try {
          const [n, s] = await Promise.all([
            client.readContract({ address, abi: erc20IdentityAbi, functionName: "name" }),
            client.readContract({ address, abi: erc20IdentityAbi, functionName: "symbol" })
          ]);
          name = n as string;
          symbol = s as string;
        } catch {
          name = name || "Unknown token";
          symbol = symbol || "?";
        }
      }

      const tokenTrades = scan.trades.filter((t) => t.token === address).sort((a, b) => Number(a.block - b.block));
      const volumeEth = tokenTrades.length > 0 ? tokenTrades.reduce((sum, t) => sum + toEth(t.ethAmount), 0) : null;
      let changePct: number | null = null;
      if (tokenTrades.length > 1) {
        const first = spotPriceEth({ realEth: tokenTrades[0].realEth, tokenReserve: tokenTrades[0].tokenReserve }, virtualEth);
        const last = spotPriceEth({ realEth: tokenTrades[tokenTrades.length - 1].realEth, tokenReserve: tokenTrades[tokenTrades.length - 1].tokenReserve }, virtualEth);
        if (first > 0) changePct = ((last - first) / first) * 100;
      }
      const ageMinutes = meta.block !== null ? Math.max(1, Math.round((Number(scan.latest - meta.block) * BASE_BLOCK_SECONDS) / 60)) : null;

      tokens.push(buildToken(chainId, address, meta.creator !== "0x0000000000000000000000000000000000000000" ? meta.creator : creator, name, symbol, { realEth, tokenReserve, graduated }, { virtualEth, gradEth }, { volumeEth, changePct, ageMinutes }));
    }

    return { chainId, live: true, tokens, params, scannedBlocks: scan.scanned, error: tokens.length === 0 ? scan.error : null };
  } catch (error) {
    return { chainId, live: true, tokens: [], params: null, scannedBlocks: 0, error: error instanceof Error ? error.message.split("\n")[0] : "Curve read failed" };
  }
}

const erc20IdentityAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }
] as const;

/** Full coin-page data for one live token, or null when unknown to the curve. */
export async function getLiveCoin(chainId: ChainId, rawAddress: string): Promise<CoinData | null> {
  const pad = curveAddress(chainId);
  if (!pad || !isAddress(rawAddress)) return null;
  const address = getAddress(rawAddress);
  const client = getPublicClient(chainId);

  const [creator, realEth, tokenReserve, graduated] = (await client.readContract({
    address: pad,
    abi: curveLaunchpadAbi,
    functionName: "pools",
    args: [address]
  })) as readonly [Address, bigint, bigint, boolean];
  if (creator === "0x0000000000000000000000000000000000000000") return null;

  const [params, scan, name, symbol] = await Promise.all([
    readCurveParams(chainId, pad),
    scanCurveEvents(chainId, pad),
    client.readContract({ address, abi: erc20IdentityAbi, functionName: "name" }).catch(() => "Unknown token"),
    client.readContract({ address, abi: erc20IdentityAbi, functionName: "symbol" }).catch(() => "?")
  ]);
  const virtualEth = BigInt(params.virtualEth);
  const gradEth = BigInt(params.gradEth);

  const tokenTrades = scan.trades.filter((t) => t.token === address).sort((a, b) => Number(a.block - b.block));
  const launch = scan.launched.find((l) => l.token === address) ?? null;

  const now = Date.now();
  const blockToTime = (block: bigint) => now - Number(scan.latest - block) * BASE_BLOCK_SECONDS * 1000;

  const history: PricePoint[] = tokenTrades.map((t) => ({
    t: blockToTime(t.block),
    price: spotPriceEth({ realEth: t.realEth, tokenReserve: t.tokenReserve }, virtualEth)
  }));
  // Anchor the series at the current spot so a token with few trades still charts.
  const current = graduated || tokenReserve === 0n ? null : spotPriceEth({ realEth, tokenReserve }, virtualEth);
  if (current !== null) {
    if (history.length === 0) {
      const startT = launch ? blockToTime(launch.block) : now - 60_000;
      history.push({ t: startT, price: spotPriceEth({ realEth: 0n, tokenReserve: CURVE_TOTAL_SUPPLY }, virtualEth) });
    }
    history.push({ t: now, price: current });
  }

  const trades: TradeRow[] = tokenTrades
    .slice(-12)
    .reverse()
    .map((t) => ({
      side: t.isBuy ? "buy" : "sell",
      trader: t.trader,
      ethAmount: toEth(t.ethAmount),
      tokenAmount: Number(t.tokenAmount / 10n ** 12n) / 1e6, // whole tokens, 6dp headroom
      minutesAgo: Math.max(0, Math.round((Number(scan.latest - t.block) * BASE_BLOCK_SECONDS) / 60))
    }));

  const volumeEth = tokenTrades.length > 0 ? tokenTrades.reduce((sum, t) => sum + toEth(t.ethAmount), 0) : null;
  let changePct: number | null = null;
  if (history.length > 1 && history[0].price > 0) {
    changePct = ((history[history.length - 1].price - history[0].price) / history[0].price) * 100;
  }
  const ageMinutes = launch ? Math.max(1, Math.round((Number(scan.latest - launch.block) * BASE_BLOCK_SECONDS) / 60)) : null;

  const token = buildToken(chainId, address, launch?.creator ?? creator, name as string, symbol as string, { realEth, tokenReserve, graduated }, { virtualEth, gradEth }, { volumeEth, changePct, ageMinutes });

  return { live: true, token, params, history, trades };
}
