import { describe, expect, it } from "vitest";
import { decodeAbiParameters, decodeFunctionData, parseUnits, slice } from "viem";
import {
  B20_VARIANT,
  POLICY_REJECT,
  ROLES,
  TRANSFER_SENDER_POLICY,
  buildCreateTx,
  encodeCreateParams,
  encodeInitCalls,
  randomSalt,
  validateConfig,
  type LaunchConfig
} from "@/lib/b20-factory";
import { B20_FACTORY_ADDRESS } from "@/lib/abi";

const admin = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

function assetConfig(over: Partial<LaunchConfig> = {}): LaunchConfig {
  return {
    variant: "asset",
    name: "Test Asset",
    symbol: "TST",
    decimals: 18,
    currency: null,
    initialAdmin: admin,
    initialMint: null,
    supplyCap: null,
    grantMintRole: false,
    multiplier: null,
    transferPolicy: null,
    ...over
  };
}

const tokenInitAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "updateSupplyCap", stateMutability: "nonpayable", inputs: [{ name: "newSupplyCap", type: "uint256" }], outputs: [] },
  { type: "function", name: "grantRole", stateMutability: "nonpayable", inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [] },
  { type: "function", name: "updatePolicy", stateMutability: "nonpayable", inputs: [{ name: "policyScope", type: "bytes32" }, { name: "newPolicyId", type: "uint64" }], outputs: [] },
  { type: "function", name: "updateMultiplier", stateMutability: "nonpayable", inputs: [{ name: "newMultiplier", type: "uint256" }], outputs: [] }
] as const;

describe("B20 factory encoding", () => {
  it("encodes asset create params that round-trip with version 1", () => {
    const params = encodeCreateParams(assetConfig({ decimals: 8 }));
    const [decoded] = decodeAbiParameters(
      [{ type: "tuple", components: [{ type: "uint8" }, { type: "string" }, { type: "string" }, { type: "address" }, { type: "uint8" }] }],
      params
    ) as unknown as [[number, string, string, string, number]];
    expect(decoded[0]).toBe(1);
    expect(decoded[1]).toBe("Test Asset");
    expect(decoded[2]).toBe("TST");
    expect(decoded[4]).toBe(8);
  });

  it("encodes stablecoin params with uppercased currency", () => {
    const params = encodeCreateParams(assetConfig({ variant: "stablecoin", currency: "usd", decimals: null }));
    const [decoded] = decodeAbiParameters(
      [{ type: "tuple", components: [{ type: "uint8" }, { type: "string" }, { type: "string" }, { type: "address" }, { type: "string" }] }],
      params
    ) as unknown as [[number, string, string, string, string]];
    expect(decoded[4]).toBe("USD");
  });

  it("maps variant to the address-byte discriminator", () => {
    expect(buildCreateTx(assetConfig(), randomSalt()).variant).toBe(B20_VARIANT.asset);
    expect(buildCreateTx(assetConfig({ variant: "stablecoin", currency: "USD" }), randomSalt()).variant).toBe(B20_VARIANT.stablecoin);
    expect(buildCreateTx(assetConfig(), randomSalt()).address).toBe(B20_FACTORY_ADDRESS);
  });

  it("orders bootstrap initCalls: grant role, mint, cap, multiplier, policy", () => {
    const calls = encodeInitCalls(
      assetConfig({
        decimals: 18,
        grantMintRole: true,
        initialMint: { to: admin, amount: "1000" },
        supplyCap: "5000",
        multiplier: "2",
        transferPolicy: "restricted"
      })
    );
    const names = calls.map((c) => decodeFunctionData({ abi: tokenInitAbi, data: c }).functionName);
    expect(names).toEqual(["grantRole", "mint", "updateSupplyCap", "updateMultiplier", "updatePolicy"]);

    const mint = decodeFunctionData({ abi: tokenInitAbi, data: calls[1] });
    expect(mint.args?.[1]).toBe(parseUnits("1000", 18));

    const grant = decodeFunctionData({ abi: tokenInitAbi, data: calls[0] });
    expect(grant.args?.[0]).toBe(ROLES.MINT_ROLE);

    const policy = decodeFunctionData({ abi: tokenInitAbi, data: calls[4] });
    expect(policy.args?.[0]).toBe(TRANSFER_SENDER_POLICY);
    expect(policy.args?.[1]).toBe(POLICY_REJECT);
  });

  it("skips a no-op multiplier of exactly 1 WAD", () => {
    const calls = encodeInitCalls(assetConfig({ multiplier: "1" }));
    expect(calls).toHaveLength(0);
  });

  it("produces an empty initCalls array for a bare create", () => {
    expect(encodeInitCalls(assetConfig())).toEqual([]);
  });

  it("generates unique 32-byte salts", () => {
    const a = randomSalt();
    expect(slice(a, 0, 32)).toBe(a);
    expect(a).not.toBe(randomSalt());
  });
});

describe("B20 launch validation", () => {
  it("requires name, symbol, and valid asset decimals", () => {
    expect(validateConfig(assetConfig({ name: "" })).name).toBeTruthy();
    expect(validateConfig(assetConfig({ symbol: "" })).symbol).toBeTruthy();
    expect(validateConfig(assetConfig({ decimals: 4 })).decimals).toBeTruthy();
    expect(validateConfig(assetConfig({ decimals: 18 })).decimals).toBeUndefined();
  });

  it("enforces stablecoin currency as A-Z letters", () => {
    expect(validateConfig(assetConfig({ variant: "stablecoin", currency: "US1", decimals: null })).currency).toBeTruthy();
    expect(validateConfig(assetConfig({ variant: "stablecoin", currency: "EUR", decimals: null })).currency).toBeUndefined();
  });

  it("rejects a supply cap below the initial mint", () => {
    const cfg = assetConfig({ decimals: 18, initialMint: { to: admin, amount: "1000" }, supplyCap: "500" });
    expect(validateConfig(cfg).supplyCap).toBeTruthy();
  });

  it("accepts a supply cap at or above the initial mint", () => {
    const cfg = assetConfig({ decimals: 18, initialMint: { to: admin, amount: "1000" }, supplyCap: "1000" });
    expect(validateConfig(cfg).supplyCap).toBeUndefined();
  });
});
