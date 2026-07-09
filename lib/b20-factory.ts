import type { Address, Hex } from "viem";
import { encodeAbiParameters, encodeFunctionData, getAddress, keccak256, parseUnits, toBytes, toHex } from "viem";
import { B20_FACTORY_ADDRESS } from "@/lib/abi";

// ---------------------------------------------------------------------------
// Canonical B20 factory create surface. Verified against base-std:
//   createB20(uint8 variant, bytes32 salt, bytes params, bytes[] initCalls) payable returns (address)
//   getB20Address(uint8 variant, address sender, bytes32 salt) view returns (address)
// Variant is encoded in address byte [10]: ASSET = 0, STABLECOIN = 1.
// ---------------------------------------------------------------------------

export const B20_VARIANT = { asset: 0, stablecoin: 1 } as const;
export type LaunchVariant = keyof typeof B20_VARIANT;

export const CREATE_PARAMS_VERSION = 1;

// Inclusive bounds from B20Constants.sol.
export const MIN_ASSET_DECIMALS = 6;
export const MAX_ASSET_DECIMALS = 18;
export const STABLECOIN_DECIMALS = 6;
export const MAX_SUPPLY_CAP = 2n ** 128n - 1n; // type(uint128).max — also the "no cap" sentinel
export const WAD = 10n ** 18n;

const MAX_UINT64 = 2n ** 64n - 1n;

// Role + policy identifiers (keccak of the canonical names).
export const ROLES = {
  DEFAULT_ADMIN_ROLE: ("0x" + "00".repeat(32)) as Hex,
  MINT_ROLE: keccak256(toBytes("MINT_ROLE")),
  BURN_ROLE: keccak256(toBytes("BURN_ROLE")),
  PAUSE_ROLE: keccak256(toBytes("PAUSE_ROLE")),
  METADATA_ROLE: keccak256(toBytes("METADATA_ROLE"))
} as const;

export const TRANSFER_SENDER_POLICY = keccak256(toBytes("TRANSFER_SENDER_POLICY"));

// Built-in policy sentinels: 0 = always allow, type(uint64).max = always reject.
export const POLICY_OPEN = 0n;
export const POLICY_REJECT = MAX_UINT64;

export const b20FactoryWriteAbi = [
  {
    type: "function",
    name: "createB20",
    stateMutability: "payable",
    inputs: [
      { name: "variant", type: "uint8" },
      { name: "salt", type: "bytes32" },
      { name: "params", type: "bytes" },
      { name: "initCalls", type: "bytes[]" }
    ],
    outputs: [{ name: "token", type: "address" }]
  },
  {
    type: "function",
    name: "getB20Address",
    stateMutability: "view",
    inputs: [
      { name: "variant", type: "uint8" },
      { name: "sender", type: "address" },
      { name: "salt", type: "bytes32" }
    ],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

// Token-side selectors used to build initCalls (executed on the new token during creation).
const tokenInitAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "updateSupplyCap", stateMutability: "nonpayable", inputs: [{ name: "newSupplyCap", type: "uint256" }], outputs: [] },
  { type: "function", name: "grantRole", stateMutability: "nonpayable", inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [] },
  { type: "function", name: "updatePolicy", stateMutability: "nonpayable", inputs: [{ name: "policyScope", type: "bytes32" }, { name: "newPolicyId", type: "uint64" }], outputs: [] },
  { type: "function", name: "updateMultiplier", stateMutability: "nonpayable", inputs: [{ name: "newMultiplier", type: "uint256" }], outputs: [] }
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export type LaunchConfig = {
  variant: LaunchVariant;
  name: string;
  symbol: string;
  decimals: number | null; // asset only; stablecoin is fixed at 6
  currency: string | null; // stablecoin only
  initialAdmin: Address | null; // null => admin-less (address(0))
  initialMint: { to: Address; amount: string } | null; // amount in whole tokens (human units)
  supplyCap: string | null; // whole tokens; null => unbounded
  grantMintRole: boolean; // grant MINT_ROLE to the admin so they can mint after launch
  multiplier: string | null; // asset only; whole-number WAD multiplier, e.g. "1" => 1e18
  transferPolicy: "open" | "restricted" | null; // sentinel policy on TRANSFER_SENDER_POLICY
};

export function tokenDecimals(config: Pick<LaunchConfig, "variant" | "decimals">): number {
  return config.variant === "stablecoin" ? STABLECOIN_DECIMALS : config.decimals ?? MAX_ASSET_DECIMALS;
}

export function randomSalt(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function encodeCreateParams(config: LaunchConfig): Hex {
  const admin = config.initialAdmin ?? ZERO_ADDRESS;
  if (config.variant === "stablecoin") {
    return encodeAbiParameters(
      [{ type: "tuple", components: [{ type: "uint8" }, { type: "string" }, { type: "string" }, { type: "address" }, { type: "string" }] }],
      [[CREATE_PARAMS_VERSION, config.name, config.symbol, admin, (config.currency ?? "").toUpperCase()]]
    );
  }
  return encodeAbiParameters(
    [{ type: "tuple", components: [{ type: "uint8" }, { type: "string" }, { type: "string" }, { type: "address" }, { type: "uint8" }] }],
    [[CREATE_PARAMS_VERSION, config.name, config.symbol, admin, tokenDecimals(config)]]
  );
}

/**
 * Bootstrap calls run on the new token inside the creation window, where factory-originated
 * calls bypass the token's role gates (so we can mint / set cap / grant roles without holding a
 * role). Ordering matters: grant role, then mint, then cap (cap must be >= minted supply),
 * then variant tweaks, then the transfer policy.
 */
export function encodeInitCalls(config: LaunchConfig): Hex[] {
  const calls: Hex[] = [];
  const decimals = tokenDecimals(config);
  const admin = config.initialAdmin;

  if (config.grantMintRole && admin && admin !== ZERO_ADDRESS) {
    calls.push(encodeFunctionData({ abi: tokenInitAbi, functionName: "grantRole", args: [ROLES.MINT_ROLE, admin] }));
  }

  if (config.initialMint && config.initialMint.amount.trim() !== "") {
    const amount = parseUnits(config.initialMint.amount, decimals);
    if (amount > 0n) {
      calls.push(encodeFunctionData({ abi: tokenInitAbi, functionName: "mint", args: [config.initialMint.to, amount] }));
    }
  }

  if (config.supplyCap && config.supplyCap.trim() !== "") {
    const cap = parseUnits(config.supplyCap, decimals);
    calls.push(encodeFunctionData({ abi: tokenInitAbi, functionName: "updateSupplyCap", args: [cap] }));
  }

  if (config.variant === "asset" && config.multiplier && config.multiplier.trim() !== "") {
    const m = parseUnits(config.multiplier, 18);
    if (m > 0n && m !== WAD) {
      calls.push(encodeFunctionData({ abi: tokenInitAbi, functionName: "updateMultiplier", args: [m] }));
    }
  }

  if (config.transferPolicy) {
    const policyId = config.transferPolicy === "restricted" ? POLICY_REJECT : POLICY_OPEN;
    calls.push(encodeFunctionData({ abi: tokenInitAbi, functionName: "updatePolicy", args: [TRANSFER_SENDER_POLICY, policyId] }));
  }

  return calls;
}

export type CreateTx = {
  address: typeof B20_FACTORY_ADDRESS;
  variant: number;
  salt: Hex;
  params: Hex;
  initCalls: Hex[];
};

export function buildCreateTx(config: LaunchConfig, salt: Hex): CreateTx {
  return {
    address: B20_FACTORY_ADDRESS,
    variant: B20_VARIANT[config.variant],
    salt,
    params: encodeCreateParams(config),
    initCalls: encodeInitCalls(config)
  };
}

// ---------------------------------------------------------------------------
// Validation — mirrors the factory's own guards so the form catches errors before a tx.
// ---------------------------------------------------------------------------

export type FieldErrors = Partial<Record<"name" | "symbol" | "decimals" | "currency" | "initialAdmin" | "initialMint" | "supplyCap" | "multiplier", string>>;

export function validateConfig(config: LaunchConfig): FieldErrors {
  const errors: FieldErrors = {};

  if (!config.name.trim()) errors.name = "Name is required.";
  else if (config.name.length > 64) errors.name = "Keep the name under 64 characters.";

  if (!config.symbol.trim()) errors.symbol = "Symbol is required.";
  else if (config.symbol.length > 16) errors.symbol = "Keep the symbol under 16 characters.";

  if (config.variant === "asset") {
    const d = config.decimals;
    if (d === null || Number.isNaN(d)) errors.decimals = "Set decimals between 6 and 18.";
    else if (d < MIN_ASSET_DECIMALS || d > MAX_ASSET_DECIMALS) errors.decimals = "Decimals must be 6 to 18.";
  }

  if (config.variant === "stablecoin") {
    const c = (config.currency ?? "").trim();
    if (!c) errors.currency = "Currency code is required.";
    else if (!/^[A-Za-z]+$/.test(c)) errors.currency = "Currency must be letters A to Z only.";
  }

  if (config.initialAdmin && config.initialAdmin !== ZERO_ADDRESS && !/^0x[0-9a-fA-F]{40}$/.test(config.initialAdmin)) {
    errors.initialAdmin = "Enter a valid address, or leave blank to deploy admin-less.";
  }

  const decimals = tokenDecimals(config);
  let mintedRaw: bigint | null = null;
  if (config.initialMint && config.initialMint.amount.trim() !== "") {
    try {
      mintedRaw = parseUnits(config.initialMint.amount, decimals);
      if (mintedRaw < 0n) errors.initialMint = "Mint amount cannot be negative.";
      if (!/^0x[0-9a-fA-F]{40}$/.test(config.initialMint.to)) errors.initialMint = "Set a valid recipient for the initial mint.";
    } catch {
      errors.initialMint = "Enter a valid mint amount.";
    }
  }

  if (config.supplyCap && config.supplyCap.trim() !== "") {
    try {
      const cap = parseUnits(config.supplyCap, decimals);
      if (cap > MAX_SUPPLY_CAP) errors.supplyCap = "Supply cap exceeds the protocol maximum.";
      else if (mintedRaw !== null && cap < mintedRaw) errors.supplyCap = "Supply cap must be at least the initial mint.";
    } catch {
      errors.supplyCap = "Enter a valid supply cap.";
    }
  }

  if (config.variant === "asset" && config.multiplier && config.multiplier.trim() !== "") {
    try {
      parseUnits(config.multiplier, 18);
    } catch {
      errors.multiplier = "Enter a valid multiplier.";
    }
  }

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

// Map a factory / wallet revert into something a launcher user can act on.
export function mapLaunchError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const m = raw.toLowerCase();
  if (m.includes("user rejected") || m.includes("user denied") || m.includes("rejected the request")) {
    return "You rejected the transaction in your wallet.";
  }
  if (m.includes("featurenotactivated") || m.includes("feature not activated")) {
    return "B20 creation is not activated on this network yet. Switch to Base Sepolia.";
  }
  if (m.includes("tokenalreadyexists")) return "A token already exists at this salt. Generate a new salt and try again.";
  if (m.includes("invaliddecimals")) return "Decimals must be between 6 and 18.";
  if (m.includes("invalidcurrency")) return "Currency must be uppercase letters A to Z.";
  if (m.includes("missingrequiredfield")) return "A required field is empty.";
  if (m.includes("unsupportedversion")) return "Unsupported encoding version for this variant.";
  if (m.includes("initcallfailed")) return "Token setup (mint, cap, or policy) reverted. Check your supply and mint values.";
  if (m.includes("insufficient funds")) return "Not enough ETH to cover gas on this network.";
  return raw.split("\n")[0] ?? "The transaction could not be completed.";
}

export function normalizeAdmin(value: string): Address | null {
  const v = value.trim();
  if (!v) return null;
  try {
    return getAddress(v);
  } catch {
    return v as Address; // surfaced by validateConfig
  }
}
