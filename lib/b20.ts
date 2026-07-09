import type { Address, Hex } from "viem";
import { formatUnits, getAddress, keccak256, toBytes } from "viem";
import type {
  B20Variant,
  ChainId,
  PauseFeature,
  PolicyFact,
  PolicyKind,
  RoleHolder,
  RoleSummary,
  SupplyStatus,
  TokenIdentity
} from "@/lib/types";
import { tokenRoute } from "@/lib/chains";

export const MAX_UINT64 = (2n ** 64n - 1n).toString();
export const MAX_UINT128 = 2n ** 128n - 1n;

export const ACTIVATION_FEATURES = {
  B20_ASSET: keccak256(toBytes("base.b20_asset")),
  B20_STABLECOIN: keccak256(toBytes("base.b20_stablecoin"))
} as const;

export const ROLE_DEFINITIONS = [
  { name: "DEFAULT_ADMIN_ROLE", hash: "0x0000000000000000000000000000000000000000000000000000000000000000" },
  { name: "MINT_ROLE", hash: keccak256(toBytes("MINT_ROLE")) },
  { name: "BURN_ROLE", hash: keccak256(toBytes("BURN_ROLE")) },
  { name: "BURN_BLOCKED_ROLE", hash: keccak256(toBytes("BURN_BLOCKED_ROLE")) },
  { name: "PAUSE_ROLE", hash: keccak256(toBytes("PAUSE_ROLE")) },
  { name: "UNPAUSE_ROLE", hash: keccak256(toBytes("UNPAUSE_ROLE")) },
  { name: "METADATA_ROLE", hash: keccak256(toBytes("METADATA_ROLE")) },
  { name: "OPERATOR_ROLE", hash: keccak256(toBytes("OPERATOR_ROLE")) }
] as const satisfies readonly { name: string; hash: Hex }[];

export const POLICY_SCOPES = [
  { scopeName: "TRANSFER_SENDER_POLICY", scope: keccak256(toBytes("TRANSFER_SENDER_POLICY")) },
  { scopeName: "TRANSFER_RECEIVER_POLICY", scope: keccak256(toBytes("TRANSFER_RECEIVER_POLICY")) },
  { scopeName: "TRANSFER_EXECUTOR_POLICY", scope: keccak256(toBytes("TRANSFER_EXECUTOR_POLICY")) },
  { scopeName: "MINT_RECEIVER_POLICY", scope: keccak256(toBytes("MINT_RECEIVER_POLICY")) }
] as const satisfies readonly { scopeName: string; scope: Hex }[];

// IB20.PausableFeature enum order (base-std). Append-only; do not reorder.
export const PAUSE_FEATURES = [
  { index: 0, label: "TRANSFER" },
  { index: 1, label: "MINT" },
  { index: 2, label: "BURN" }
] as const satisfies readonly { index: number; label: PauseFeature }[];

export function getVariantByte(address: Address | string): number | null {
  const hex = address.replace(/^0x/i, "");
  if (hex.length !== 40) return null;
  const byte = hex.slice(20, 22);
  return Number.parseInt(byte, 16);
}

export function variantFromByte(byte: number | null): B20Variant {
  if (byte === 0) return "asset";
  if (byte === 1) return "stablecoin";
  return "unknown";
}

export function routeForToken(chainId: ChainId, address: Address | string): string {
  return tokenRoute(chainId, getAddress(address));
}

export function formatTokenAmount(raw: bigint | null | undefined, decimals: number | null | undefined): string | null {
  if (raw === null || raw === undefined || decimals === null || decimals === undefined) return null;
  const formatted = formatUnits(raw, decimals);
  const [whole, frac = ""] = formatted.split(".");
  const trimmedFrac = frac.replace(/0+$/, "").slice(0, 6);
  const compact = trimmedFrac ? `${whole}.${trimmedFrac}` : whole;
  return compact.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function supplyStatus(totalSupplyRaw: bigint | null, supplyCapRaw: bigint | null, decimals: number | null): SupplyStatus {
  if (supplyCapRaw === null || decimals === null) {
    return { capRaw: null, cap: null, label: "Unable to determine", utilizationPct: null };
  }

  if (supplyCapRaw === MAX_UINT128) {
    return {
      capRaw: supplyCapRaw.toString(),
      cap: formatTokenAmount(supplyCapRaw, decimals),
      label: "Unbounded supply cap",
      utilizationPct: null
    };
  }

  const utilizationPct =
    totalSupplyRaw !== null && supplyCapRaw > 0n ? Number((totalSupplyRaw * 10_000n) / supplyCapRaw) / 100 : null;

  return {
    capRaw: supplyCapRaw.toString(),
    cap: formatTokenAmount(supplyCapRaw, decimals),
    label: totalSupplyRaw !== null && totalSupplyRaw === supplyCapRaw ? "Fixed supply" : "Supply can change",
    utilizationPct
  };
}

export function emptyIdentity(): TokenIdentity {
  return {
    name: null,
    symbol: null,
    decimals: null,
    totalSupply: null,
    totalSupplyRaw: null
  };
}

export function policyKind(policyId: string | null): PolicyKind {
  if (policyId === null) return "unknown";
  if (policyId === "0") return "always-allow";
  if (policyId === MAX_UINT64) return "always-reject";
  return "custom";
}

export function policyLabel(policyId: string | null): string {
  const kind = policyKind(policyId);
  if (kind === "always-allow") return "Open transfers";
  if (kind === "always-reject") return "Policy blocks this scope";
  if (kind === "custom") return "Policy controlled transfers";
  return "Unable to determine";
}

export function describePause(paused: PauseFeature[]): string {
  if (paused.length === 0) return "Transfers, mint, and burn are not paused";
  return `${paused.join(", ")} paused`;
}

type RoleEvent = {
  eventName: "RoleGranted" | "RoleRevoked";
  role: Hex;
  account: Address;
  blockNumber?: bigint;
  logIndex?: number;
};

export function reconcileRoleEvents(events: RoleEvent[], fromBlock: bigint | null, toBlock: bigint | null): RoleSummary {
  const roleNames = new Map<Hex, string>(ROLE_DEFINITIONS.map((role) => [role.hash, role.name]));
  const holders = new Map<Hex, Set<Address>>();
  const sorted = [...events].sort((a, b) => {
    const blockDiff = Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n));
    if (blockDiff !== 0) return blockDiff;
    return (a.logIndex ?? 0) - (b.logIndex ?? 0);
  });

  for (const event of sorted) {
    if (!roleNames.has(event.role)) continue;
    const set = holders.get(event.role) ?? new Set<Address>();
    if (event.eventName === "RoleGranted") {
      set.add(getAddress(event.account));
    } else {
      set.delete(getAddress(event.account));
    }
    holders.set(event.role, set);
  }

  const roleHolders: RoleHolder[] = ROLE_DEFINITIONS.map((role) => ({
    role: role.hash,
    roleName: role.name,
    accounts: [...(holders.get(role.hash) ?? new Set<Address>())].sort()
  })).filter((role) => role.accounts.length > 0);

  const adminRole = roleHolders.find((role) => role.roleName === "DEFAULT_ADMIN_ROLE");

  return {
    status: "observed",
    label: adminRole && adminRole.accounts.length > 0 ? "Admin role observed" : "No observed admin",
    fromBlock: fromBlock?.toString() ?? null,
    toBlock: toBlock?.toString() ?? null,
    holders: roleHolders,
    note: null
  };
}

export function unableRoles(note: string, fromBlock: bigint | null = null, toBlock: bigint | null = null): RoleSummary {
  return {
    status: "unable",
    label: "Unable to determine",
    fromBlock: fromBlock?.toString() ?? null,
    toBlock: toBlock?.toString() ?? null,
    holders: [],
    note
  };
}

export function makePolicyFact(input: {
  scope: Hex;
  scopeName: string;
  policyId: string | null;
  exists: boolean | null;
  admin: Address | null;
  pendingAdmin: Address | null;
}): PolicyFact {
  const kind = policyKind(input.policyId);
  return {
    ...input,
    kind,
    label: policyLabel(input.policyId)
  };
}
