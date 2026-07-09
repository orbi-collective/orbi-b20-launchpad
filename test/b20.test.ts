import { describe, expect, it } from "vitest";
import { getAddress, keccak256, toBytes } from "viem";
import {
  MAX_UINT128,
  MAX_UINT64,
  PAUSE_FEATURES,
  getVariantByte,
  policyKind,
  policyLabel,
  reconcileRoleEvents,
  routeForToken,
  supplyStatus,
  variantFromByte
} from "@/lib/b20";
import { isRangeLimitError, scanLogs } from "@/lib/report";

function addressWithVariant(byte: string) {
  return getAddress(`0x${"00".repeat(10)}${byte}${"00".repeat(9)}`);
}

describe("B20 helpers", () => {
  it("parses the B20 variant byte from address byte 10", () => {
    expect(getVariantByte(addressWithVariant("00"))).toBe(0);
    expect(getVariantByte(addressWithVariant("01"))).toBe(1);
    expect(variantFromByte(0)).toBe("asset");
    expect(variantFromByte(1)).toBe("stablecoin");
    expect(variantFromByte(9)).toBe("unknown");
  });

  it("generates canonical token routes", () => {
    const address = getAddress("0x0000000000000000000000000000000000000001");
    expect(routeForToken(8453, address)).toBe(`/token/${address}`);
    expect(routeForToken(84532, address)).toBe(`/sepolia/token/${address}`);
  });

  it("labels supply cap states without a score", () => {
    expect(supplyStatus(100n, 100n, 2).label).toBe("Fixed supply");
    expect(supplyStatus(10n, 100n, 2).label).toBe("Supply can change");
    expect(supplyStatus(10n, MAX_UINT128, 2).label).toBe("Unbounded supply cap");
    expect(supplyStatus(null, null, null).label).toBe("Unable to determine");
  });

  it("classifies built-in and custom policy IDs", () => {
    expect(policyKind("0")).toBe("always-allow");
    expect(policyLabel("0")).toBe("Open transfers");
    expect(policyKind(MAX_UINT64)).toBe("always-reject");
    expect(policyKind("42")).toBe("custom");
    expect(policyLabel("42")).toBe("Policy controlled transfers");
  });

  it("tracks only the three on-chain PausableFeature values", () => {
    // IB20.PausableFeature is { TRANSFER, MINT, BURN }. isPaused(3) would revert, so a
    // REDEEM feature must never creep back in.
    expect(PAUSE_FEATURES.map((feature) => feature.label)).toEqual(["TRANSFER", "MINT", "BURN"]);
    expect(PAUSE_FEATURES.map((feature) => feature.index)).toEqual([0, 1, 2]);
  });

  it("reconciles role grant and revoke events", () => {
    const admin = getAddress("0x00000000000000000000000000000000000000aa");
    const minter = getAddress("0x00000000000000000000000000000000000000bb");
    const defaultAdmin = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const mintRole = keccak256(toBytes("MINT_ROLE"));

    const roles = reconcileRoleEvents(
      [
        { eventName: "RoleGranted", role: defaultAdmin, account: admin, blockNumber: 1n, logIndex: 0 },
        { eventName: "RoleGranted", role: mintRole, account: minter, blockNumber: 2n, logIndex: 0 },
        { eventName: "RoleRevoked", role: mintRole, account: minter, blockNumber: 3n, logIndex: 0 }
      ],
      1n,
      3n
    );

    expect(roles.label).toBe("Admin role observed");
    expect(roles.holders).toHaveLength(1);
    expect(roles.holders[0]?.roleName).toBe("DEFAULT_ADMIN_ROLE");
  });
});

describe("resilient log scanning", () => {
  it("detects RPC range-limit errors by message", () => {
    expect(isRangeLimitError(new Error("query exceeds max block range of 10000"))).toBe(true);
    expect(isRangeLimitError(new Error("eth_getLogs is limited to a 10000 range"))).toBe(true);
    expect(isRangeLimitError(new Error("execution reverted"))).toBe(false);
  });

  it("uses the single full-range request when the RPC accepts it", async () => {
    const calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    const client = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getContractEvents: async (params: any) => {
        calls.push({ fromBlock: params.fromBlock, toBlock: params.toBlock });
        return [{ blockNumber: 5n }];
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await scanLogs(client as any, { eventName: "RoleGranted" }, 0n, 1_000_000n);
    expect(out).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("falls back to chunked scanning and aggregates results on range errors", async () => {
    let firstCall = true;
    const windows: Array<bigint> = [];
    const client = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getContractEvents: async (params: any) => {
        if (firstCall) {
          firstCall = false;
          throw new Error("block range is too large");
        }
        windows.push((params.toBlock as bigint) - (params.fromBlock as bigint) + 1n);
        return [{ blockNumber: params.fromBlock }];
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await scanLogs(client as any, { eventName: "RoleGranted" }, 0n, 20_000n);
    // 0..20000 inclusive in 1_900-block windows => 11 chunks, one event each.
    expect(out).toHaveLength(11);
    expect(windows.every((span) => span <= 1_900n)).toBe(true);
  });
});
