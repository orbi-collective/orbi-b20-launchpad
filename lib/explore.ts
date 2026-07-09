import type { Address } from "viem";
import { getAddress } from "viem";
import { b20FactoryAbi, B20_FACTORY_ADDRESS } from "@/lib/abi";
import { getPublicClient } from "@/lib/report";
import { variantFromByte } from "@/lib/b20";
import type { B20Variant, ChainId } from "@/lib/types";

export type RecentLaunch = {
  chainId: ChainId;
  address: Address;
  variant: B20Variant;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  block: string;
};

export type ExploreResult = {
  chainId: ChainId;
  items: RecentLaunch[];
  scannedBlocks: number;
  /** Chain head at scan time, for deriving approximate launch age from block deltas. */
  latestBlock: string | null;
  error: string | null;
};

// Public Base RPCs cap eth_getLogs at 10k (mainnet) / 2k (sepolia) blocks. We scan a few chunks
// back from head — enough for a lite "recently launched" feed without a full indexer.
const CHUNK: Record<ChainId, bigint> = { 8453: 9000n, 84532: 1900n };
const MAX_CHUNKS = 4;

export async function getRecentLaunches(chainId: ChainId, limit = 12): Promise<ExploreResult> {
  const client = getPublicClient(chainId);
  const chunk = CHUNK[chainId];

  let latest: bigint;
  try {
    latest = await client.getBlockNumber();
  } catch (error) {
    return {
      chainId,
      items: [],
      scannedBlocks: 0,
      latestBlock: null,
      error: error instanceof Error ? error.message.split("\n")[0] : "RPC unreachable"
    };
  }

  const items: RecentLaunch[] = [];
  let to = latest;
  let scanned = 0;
  let lastError: string | null = null;

  for (let i = 0; i < MAX_CHUNKS && items.length < limit; i++) {
    const from = to > chunk ? to - chunk : 0n;
    scanned += Number(to - from);
    try {
      const events = await client.getContractEvents({
        address: B20_FACTORY_ADDRESS,
        abi: b20FactoryAbi,
        eventName: "B20Created",
        fromBlock: from,
        toBlock: to
      });
      for (const e of events) {
        const token = e.args?.token as Address | undefined;
        if (!token) continue;
        items.push({
          chainId,
          address: getAddress(token),
          variant: variantFromByte(Number(e.args?.variant ?? -1)),
          name: typeof e.args?.name === "string" ? e.args.name : null,
          symbol: typeof e.args?.symbol === "string" ? e.args.symbol : null,
          decimals: e.args?.decimals !== undefined ? Number(e.args.decimals) : null,
          block: (e.blockNumber ?? 0n).toString()
        });
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message.split("\n")[0] : "Log scan failed";
    }
    if (from === 0n) break;
    to = from - 1n;
  }

  items.sort((a, b) => Number(BigInt(b.block) - BigInt(a.block)));
  const deduped = items.filter((item, i) => items.findIndex((x) => x.address === item.address) === i).slice(0, limit);

  return { chainId, items: deduped, scannedBlocks: scanned, latestBlock: latest.toString(), error: deduped.length === 0 ? lastError : null };
}
