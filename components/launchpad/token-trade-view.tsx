"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPublicClient, formatEther, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { TokenAvatar } from "@/components/token-avatar";
import { PriceChart } from "@/components/launchpad/price-chart";
import { TradeWidget } from "@/components/launchpad/trade-widget";
import { shortenAddress, useWallet } from "@/lib/wallet";
import { CHAINS, tokenRoute, explorerAddressUrl } from "@/lib/chains";
import { curveAddress, curveLaunchpadAbi, fmtAge, fmtEth, fmtPriceEth, fmtUsd, type CurveToken, type TradeRow } from "@/lib/curve";
import type { CoinData } from "@/lib/launchpad";
import type { ChainId } from "@/lib/types";

function readClient(chainId: ChainId) {
  return createPublicClient({ chain: chainId === 8453 ? base : baseSepolia, transport: http(CHAINS[chainId].rpcUrl) });
}

function StatusPill({ status }: { status: CurveToken["status"] }) {
  const label = status === "bonding" ? "Bonding" : status === "graduating" ? "About to graduate" : "Graduated";
  return <span className={`coin-status coin-status-${status}`}>{label}</span>;
}

function BondingMeter({ token }: { token: CurveToken }) {
  if (token.status === "graduated") {
    return (
      <div className="coin-meter">
        <div className="coin-meter-head">
          <span>Graduated to DEX</span>
        </div>
        <p className="coin-meter-note">Full bonding-curve supply migrated, liquidity now lives on a Base DEX pool.</p>
      </div>
    );
  }
  const pct = Math.round(token.bondingProgress * 100);
  return (
    <div className="coin-meter">
      <div className="coin-meter-head">
        <span>Bonding progress</span>
        <span className="mono">{pct}%</span>
      </div>
      <div className="board-progress-track coin-meter-track">
        <div className={`board-progress-fill ${pct >= 90 ? "hot" : ""}`} style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <p className="coin-meter-note">
        Graduates to a Base DEX pool once the curve fills. {pct >= 90 ? "Almost there." : `${100 - pct}% of the curve left to fill.`}
      </p>
    </div>
  );
}

function TradeFeed({ trades, symbol }: { trades: TradeRow[]; symbol: string }) {
  return (
    <div className="coin-panel">
      <h2>Recent trades</h2>
      {trades.length === 0 ? (
        <p className="coin-meter-note">No trades in the scanned window yet.</p>
      ) : (
        <ul className="trade-feed-list">
          {trades.map((t, i) => (
            <li key={i} className="trade-feed-row">
              <span className={`trade-feed-side ${t.side}`}>{t.side}</span>
              <span className="mono trade-feed-addr">{shortenAddress(t.trader)}</span>
              <span className="mono trade-feed-amt">
                {t.ethAmount.toFixed(3)} ETH → {t.tokenAmount < 1000 ? t.tokenAmount.toFixed(1) : Math.round(t.tokenAmount).toLocaleString()}{" "}
                {symbol}
              </span>
              <span className="trade-feed-time">{t.minutesAgo === 0 ? "now" : `${t.minutesAgo}m ago`}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="coin-meter-note">Read from Trade events over the recent block window.</p>
    </div>
  );
}

function ClaimFeePanel({ token, creatorShareBps }: { token: CurveToken; creatorShareBps: number }) {
  const { status, address, connect, getWalletClient, switchChain, chainId: walletChain } = useWallet();
  const [claimable, setClaimable] = useState<bigint | null>(null);
  const [claimState, setClaimState] = useState<"idle" | "claiming" | "done" | "error">("idle");
  const pad = curveAddress(token.chainId);
  const isCreator = Boolean(address && address.toLowerCase() === token.creator.toLowerCase());

  useEffect(() => {
    if (!pad) return;
    let cancelled = false;
    readClient(token.chainId)
      .readContract({ address: pad, abi: curveLaunchpadAbi, functionName: "creatorFees", args: [token.address] })
      .then((v) => {
        if (!cancelled) setClaimable(v as bigint);
      })
      .catch(() => {
        if (!cancelled) setClaimable(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pad, token.address, token.chainId, claimState]);

  async function claim() {
    if (!pad || !address) return;
    setClaimState("claiming");
    try {
      if (walletChain !== token.chainId) await switchChain(token.chainId);
      const wallet = getWalletClient(token.chainId);
      if (!wallet) throw new Error("Wallet unavailable");
      const pub = readClient(token.chainId);
      const { request } = await pub.simulateContract({
        account: address,
        address: pad,
        abi: curveLaunchpadAbi,
        functionName: "claimFees",
        args: [token.address]
      });
      const hash = await wallet.writeContract(request);
      await pub.waitForTransactionReceipt({ hash, confirmations: 1 });
      setClaimState("done");
    } catch {
      setClaimState("error");
    }
  }

  return (
    <div className="coin-panel claim-panel">
      <div className="claim-head">
        <h2>Creator fees</h2>
      </div>
      <p className="claim-claimable">
        <span className="mono">{claimable !== null ? `${Number(formatEther(claimable)).toFixed(5)} ETH` : "—"}</span>
        <span>claimable now</span>
      </p>
      <p className="coin-meter-note">
        {creatorShareBps / 100}% of every trade&apos;s fee accrues here for {shortenAddress(token.creator)}, the rest goes
        to the protocol. Claim any time, no minimum.
      </p>
      {status !== "connected" ? (
        <button type="button" className="ghost-btn claim-btn" onClick={connect}>
          Connect wallet
        </button>
      ) : (
        <button
          type="button"
          className="ghost-btn claim-btn"
          onClick={claim}
          disabled={!isCreator || claimState === "claiming" || claimable === null || claimable === 0n}
        >
          {!isCreator
            ? "Only the creator can claim"
            : claimState === "claiming"
              ? "Claiming…"
              : claimState === "done"
                ? "Claimed"
                : claimState === "error"
                  ? "Claim failed, retry"
                  : "Claim fees"}
        </button>
      )}
    </div>
  );
}

export function TokenTradeView({ data, ethUsd }: { data: CoinData; ethUsd: number | null }) {
  const { token, history, trades, params } = data;
  const [copied, setCopied] = useState(false);
  const up = (token.changePct ?? 0) >= 0;
  const mcap = token.marketCapEth <= 0 ? "—" : ethUsd !== null ? fmtUsd(token.marketCapEth * ethUsd) : fmtEth(token.marketCapEth);

  async function copyAddress() {
    await navigator.clipboard.writeText(token.address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <main className="page coin-page">
      <header className="coin-header">
        <TokenAvatar symbol={token.symbol} size={64} />
        <div className="coin-header-id">
          <div className="coin-header-name-row">
            <h1>{token.name}</h1>
            <StatusPill status={token.status} />
          </div>
          <div className="coin-header-meta">
            <span className="mono">{token.symbol}</span>
            <span>·</span>
            <button type="button" className="coin-addr-btn mono" onClick={copyAddress}>
              {copied ? "Copied" : shortenAddress(token.address)}
            </button>
            {token.ageMinutes !== null ? (
              <>
                <span>·</span>
                <span>Launched {fmtAge(token.ageMinutes)} ago</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="coin-header-links">
          <Link className="ghost-btn" href={tokenRoute(token.chainId, token.address)}>
            Verify report
          </Link>
          <a className="ghost-btn" href={explorerAddressUrl(token.chainId, token.address)} target="_blank" rel="noreferrer">
            Explorer
          </a>
        </div>
      </header>

      <div className="coin-stat-strip">
        <div>
          <span>Price</span>
          <strong className="mono">{fmtPriceEth(token.priceEth)} ETH</strong>
        </div>
        <div>
          <span>Change</span>
          {token.changePct !== null ? (
            <strong className={`mono ${up ? "board-delta up" : "board-delta down"}`}>
              {up ? "▲" : "▼"} {Math.abs(token.changePct).toFixed(1)}%
            </strong>
          ) : (
            <strong className="mono">—</strong>
          )}
        </div>
        <div>
          <span>Market cap</span>
          <strong className="mono">{mcap}</strong>
        </div>
        <div>
          <span>Liquidity</span>
          <strong className="mono">{token.liquidityEth !== null ? fmtEth(token.liquidityEth) : "on DEX"}</strong>
        </div>
        <div>
          <span>Volume</span>
          <strong className="mono">{token.volumeEth !== null ? fmtEth(token.volumeEth) : "—"}</strong>
        </div>
        <div>
          <span>Holders</span>
          <strong className="mono">{token.holders !== null ? token.holders.toLocaleString() : "—"}</strong>
        </div>
      </div>

      <div className="coin-grid">
        <div className="coin-main">
          <div className="coin-panel coin-chart-panel">
            {history.length > 1 ? (
              <PriceChart history={history} up={up} />
            ) : (
              <p className="coin-meter-note">Not enough trades in the scanned window to chart yet.</p>
            )}
          </div>
          <BondingMeter token={token} />
          <TradeFeed trades={trades} symbol={token.symbol} />
        </div>
        <aside className="coin-side">
          <TradeWidget token={token} params={params} />
          <ClaimFeePanel token={token} creatorShareBps={params.creatorShareBps} />
        </aside>
      </div>
    </main>
  );
}
