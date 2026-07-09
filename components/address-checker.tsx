"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getAddress, isAddress } from "viem";
import type { ChainId } from "@/lib/types";
import { routeForToken } from "@/lib/b20";

export function AddressChecker({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [chainId, setChainId] = useState<ChainId>(8453);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isAddress(address.trim())) {
      setError("Paste a valid EVM contract address.");
      return;
    }

    const normalized = getAddress(address.trim());
    startTransition(() => {
      router.push(routeForToken(chainId, normalized));
    });
  }

  return (
    <form className={compact ? "checker checker-compact" : "checker"} onSubmit={submit}>
      <div className="checker-row">
        <label className="sr-only" htmlFor="token-address">
          Token contract address
        </label>
        <input
          id="token-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0x token address on Base"
          spellCheck={false}
          autoComplete="off"
        />
        <label className="sr-only" htmlFor="network">
          Network
        </label>
        <select id="network" value={chainId} onChange={(event) => setChainId(Number(event.target.value) as ChainId)}>
          <option value={8453}>Mainnet</option>
          <option value={84532}>Sepolia</option>
        </select>
        <button type="submit" disabled={isPending}>
          {isPending ? "Checking…" : "Check"}
        </button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
