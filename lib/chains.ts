import type { ChainId } from "@/lib/types";

export const CHAIN_IDS = [8453, 84532] as const satisfies readonly ChainId[];

/**
 * Base activated B20 creation on mainnet on 2026-07-09 (verified onchain: createB20 simulation
 * succeeds against the Factory precompile). Live by default; set NEXT_PUBLIC_MAINNET_LIVE=false
 * to force the pre-activation gate back on without a code change.
 */
export const MAINNET_LIVE = process.env.NEXT_PUBLIC_MAINNET_LIVE !== "false";

export type ChainConfig = {
  id: ChainId;
  name: string;
  shortName: string;
  routePrefix: "" | "/sepolia";
  explorerBaseUrl: string;
  /** Primary RPC, kept for display/back-compat. First entry of {@link rpcUrls}. */
  rpcUrl: string;
  /** Ordered RPC endpoints used by a viem fallback transport (first healthy wins). */
  rpcUrls: string[];
};

function rpcList(envValue: string | undefined, defaults: string[]): string[] {
  // BASE_*_RPC_URL may hold a single URL or a comma-separated list of endpoints.
  const fromEnv = (envValue ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const merged = [...fromEnv, ...defaults];
  return [...new Set(merged)];
}

const MAINNET_RPCS = rpcList(process.env.BASE_MAINNET_RPC_URL, [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org"
]);

const SEPOLIA_RPCS = rpcList(process.env.BASE_SEPOLIA_RPC_URL, [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
  "https://base-sepolia.drpc.org"
]);

export const CHAINS: Record<ChainId, ChainConfig> = {
  8453: {
    id: 8453,
    name: "Base Mainnet",
    shortName: "Mainnet",
    routePrefix: "",
    explorerBaseUrl: "https://basescan.org",
    rpcUrl: MAINNET_RPCS[0],
    rpcUrls: MAINNET_RPCS
  },
  84532: {
    id: 84532,
    name: "Base Sepolia",
    shortName: "Sepolia",
    routePrefix: "/sepolia",
    explorerBaseUrl: "https://sepolia.basescan.org",
    rpcUrl: SEPOLIA_RPCS[0],
    rpcUrls: SEPOLIA_RPCS
  }
};

export function getChain(chainId: ChainId): ChainConfig {
  return CHAINS[chainId];
}

export function parseChainId(value: string | null): ChainId | null {
  const numeric = Number(value);
  return numeric === 8453 || numeric === 84532 ? numeric : null;
}

export function tokenRoute(chainId: ChainId, address: string): string {
  return `${CHAINS[chainId].routePrefix}/token/${address}`;
}

/** Launchpad trade/detail route for a bonding-curve token, distinct from the Verify report route. */
export function coinRoute(chainId: ChainId, address: string): string {
  return `${CHAINS[chainId].routePrefix}/coin/${address}`;
}

export function explorerAddressUrl(chainId: ChainId, address: string): string {
  return `${CHAINS[chainId].explorerBaseUrl}/address/${address}`;
}
