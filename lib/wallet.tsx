"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Address, WalletClient } from "viem";
import { createWalletClient, custom, getAddress } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { ChainId } from "@/lib/types";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const CHAINS = { 8453: base, 84532: baseSepolia } as const;

// Params for wallet_addEthereumChain when the wallet doesn't know the network yet.
const ADD_CHAIN_PARAMS: Record<ChainId, Record<string, unknown>> = {
  8453: {
    chainId: "0x2105",
    chainName: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"]
  },
  84532: {
    chainId: "0x14a34",
    chainName: "Base Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.base.org"],
    blockExplorerUrls: ["https://sepolia.basescan.org"]
  }
};

export type WalletStatus = "disconnected" | "connecting" | "connected";

type WalletContextValue = {
  status: WalletStatus;
  address: Address | null;
  chainId: number | null;
  hasProvider: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: (chainId: ChainId) => Promise<void>;
  getWalletClient: (chainId: ChainId) => WalletClient | null;
};

const WalletContext = createContext<WalletContextValue | null>(null);

// window.ethereum is an external system, so provider presence is read via useSyncExternalStore:
// no state, no effect, and the server snapshot keeps SSR hydration consistent.
const subscribeToNothing = () => () => {};
const getProviderSnapshot = () => typeof window !== "undefined" && Boolean(window.ethereum);
const getProviderServerSnapshot = () => false;

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const hasProvider = useSyncExternalStore(subscribeToNothing, getProviderSnapshot, getProviderServerSnapshot);
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const provider = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!provider) return;

    // Re-attach to an already-authorized session without prompting.
    void (async () => {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        if (accounts.length > 0) {
          setAddress(getAddress(accounts[0]));
          setStatus("connected");
          const cid = (await provider.request({ method: "eth_chainId" })) as string;
          setChainId(Number.parseInt(cid, 16));
        }
      } catch {
        /* no authorized session */
      }
    })();

    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        setAddress(null);
        setStatus("disconnected");
      } else {
        setAddress(getAddress(accounts[0]));
        setStatus("connected");
      }
    };
    const onChain = (...args: unknown[]) => setChainId(Number.parseInt(args[0] as string, 16));

    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) {
      setError("No Ethereum wallet detected. Install MetaMask, Rabby, or a Base-compatible wallet.");
      return;
    }
    setError(null);
    setStatus("connecting");
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(getAddress(accounts[0]));
      const cid = (await provider.request({ method: "eth_chainId" })) as string;
      setChainId(Number.parseInt(cid, 16));
      setStatus("connected");
    } catch (err) {
      setStatus("disconnected");
      setError(err instanceof Error ? err.message.split("\n")[0] : "Wallet connection failed.");
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setStatus("disconnected");
    setError(null);
  }, []);

  const switchChain = useCallback(async (target: ChainId) => {
    const provider = window.ethereum;
    if (!provider) return;
    const hexId = "0x" + target.toString(16);
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 4902 || /unrecognized chain|add this network/i.test(String((err as Error)?.message))) {
        await provider.request({ method: "wallet_addEthereumChain", params: [ADD_CHAIN_PARAMS[target]] });
      } else {
        throw err;
      }
    }
  }, []);

  const getWalletClient = useCallback(
    (target: ChainId): WalletClient | null => {
      const provider = window.ethereum;
      if (!provider || !address) return null;
      return createWalletClient({ account: address, chain: CHAINS[target], transport: custom(provider) });
    },
    [address]
  );

  const value = useMemo<WalletContextValue>(
    () => ({ status, address, chainId, hasProvider, error, connect, disconnect, switchChain, getWalletClient }),
    [status, address, chainId, hasProvider, error, connect, disconnect, switchChain, getWalletClient]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
