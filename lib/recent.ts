import { getAddress, isAddress } from "viem";
import type { B20Report, ChainId, RecentCheck } from "@/lib/types";

const RECENT_LIMIT = 12;
const RECENT_TTL_SECONDS = 60 * 60 * 24 * 14;
const memoryRecent = new Map<ChainId, RecentCheck[]>();

function hasKvEnv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function key(chainId: ChainId) {
  return `b20proof:recent:${chainId}`;
}

export async function recordRecent(report: B20Report): Promise<void> {
  if (report.status === "unavailable") return;

  const entry: RecentCheck = {
    chainId: report.chainId,
    address: report.address,
    status: report.status,
    label: report.label,
    checkedAt: report.checkedAt
  };

  if (hasKvEnv()) {
    const { kv } = await import("@vercel/kv");
    const current = ((await kv.get<RecentCheck[]>(key(report.chainId))) ?? []).filter(
      (item) => item.address.toLowerCase() !== entry.address.toLowerCase()
    );
    await kv.set(key(report.chainId), [entry, ...current].slice(0, RECENT_LIMIT), { ex: RECENT_TTL_SECONDS });
    return;
  }

  const current = (memoryRecent.get(report.chainId) ?? []).filter(
    (item) => item.address.toLowerCase() !== entry.address.toLowerCase()
  );
  memoryRecent.set(report.chainId, [entry, ...current].slice(0, RECENT_LIMIT));
}

export async function getRecent(chainId: ChainId): Promise<RecentCheck[]> {
  if (hasKvEnv()) {
    const { kv } = await import("@vercel/kv");
    return (await kv.get<RecentCheck[]>(key(chainId))) ?? [];
  }

  return memoryRecent.get(chainId) ?? [];
}

export function parseRecentAddress(address: string): string | null {
  if (!isAddress(address)) return null;
  return getAddress(address);
}
