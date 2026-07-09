"use client";

import { useEffect, useRef, useState } from "react";
import { shortenAddress, useWallet } from "@/lib/wallet";
import type { ChainId } from "@/lib/types";

const NETWORKS: { id: ChainId; label: string }[] = [
  { id: 8453, label: "Base Mainnet" },
  { id: 84532, label: "Base Sepolia" }
];

export function ConnectButton() {
  const { status, address, chainId, connect, disconnect, switchChain, error } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (status !== "connected" || !address) {
    return (
      <button
        type="button"
        className="connect-btn"
        onClick={connect}
        disabled={status === "connecting"}
        title={error ?? undefined}
      >
        {status === "connecting" ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const network = NETWORKS.find((n) => n.id === chainId);
  const onB20Network = chainId === 8453 || chainId === 84532;

  return (
    <div className="connect-wrap" ref={ref}>
      <button type="button" className="connect-pill" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`connect-net-dot ${onB20Network ? "ok" : "warn"}`} aria-hidden="true" />
        <span className="connect-net">{network?.label.replace("Base ", "") ?? "Wrong network"}</span>
        <span className="connect-addr">{shortenAddress(address)}</span>
      </button>
      {open ? (
        <div className="connect-menu" role="menu">
          <p className="connect-menu-label">Network</p>
          {NETWORKS.map((n) => (
            <button
              key={n.id}
              type="button"
              role="menuitemradio"
              aria-checked={chainId === n.id}
              className={`connect-menu-item ${chainId === n.id ? "is-active" : ""}`}
              onClick={async () => {
                await switchChain(n.id);
                setOpen(false);
              }}
            >
              <span className={`connect-net-dot ${n.id === 84532 ? "ok" : "mainnet"}`} aria-hidden="true" />
              {n.label}
            </button>
          ))}
          <div className="connect-menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="connect-menu-item connect-menu-danger"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
