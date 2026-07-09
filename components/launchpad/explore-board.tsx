"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TokenAvatar } from "@/components/token-avatar";
import { coinRoute } from "@/lib/chains";
import { fmtAge, fmtEth, fmtPriceEth, fmtUsd, type CurveToken } from "@/lib/curve";

type Sort = "trending" | "new" | "graduating" | "graduated";

const TABS: { id: Sort; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
  { id: "graduating", label: "About to graduate" },
  { id: "graduated", label: "Graduated" }
];

function sortTokens(tokens: CurveToken[], sort: Sort): CurveToken[] {
  const t = [...tokens];
  switch (sort) {
    case "new":
      return t.sort((a, b) => (a.ageMinutes ?? Number.MAX_SAFE_INTEGER) - (b.ageMinutes ?? Number.MAX_SAFE_INTEGER));
    case "graduating":
      return t.filter((x) => x.status !== "graduated").sort((a, b) => b.bondingProgress - a.bondingProgress);
    case "graduated":
      return t.filter((x) => x.status === "graduated").sort((a, b) => b.marketCapEth - a.marketCapEth);
    default:
      return t.sort((a, b) => (b.volumeEth ?? 0) - (a.volumeEth ?? 0) || b.marketCapEth - a.marketCapEth);
  }
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="board-delta muted">—</span>;
  const up = pct >= 0;
  return (
    <span className={`board-delta ${up ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function ProgressCell({ token }: { token: CurveToken }) {
  if (token.status === "graduated") {
    return <span className="board-graduated">Graduated</span>;
  }
  const pct = Math.round(token.bondingProgress * 100);
  return (
    <div className="board-progress" title={`${pct}% to graduation`}>
      <div className="board-progress-track">
        <div className={`board-progress-fill ${pct >= 90 ? "hot" : ""}`} style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <span className="board-progress-pct">{pct}%</span>
    </div>
  );
}

export function ExploreBoard({
  tokens,
  ethUsd,
  scannedBlocks,
  error
}: {
  tokens: CurveToken[];
  ethUsd: number | null;
  scannedBlocks: number;
  error: string | null;
}) {
  const [sort, setSort] = useState<Sort>("trending");
  const rows = useMemo(() => sortTokens(tokens, sort), [tokens, sort]);

  // Market cap reads in dollars when a spot rate is available; falls back to ETH, never a fake rate.
  const mcap = (eth: number) => (eth <= 0 ? "—" : ethUsd !== null ? fmtUsd(eth * ethUsd) : fmtEth(eth));

  return (
    <div className="board">
      <div className="board-toolbar">
        <div className="board-tabs" role="tablist" aria-label="Sort tokens">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={sort === t.id}
              className={`board-tab ${sort === t.id ? "is-active" : ""}`}
              onClick={() => setSort(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="board-live-tag" title={`Read onchain from the curve contract over the last ${scannedBlocks.toLocaleString()} blocks.`}>
          Onchain
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="board-empty">
          {error ? (
            <p>
              Couldn&apos;t read the curve right now ({error}). Refresh to retry, or check <Link href="/status">status</Link>.
            </p>
          ) : (
            <p>
              No launches in the last {scannedBlocks > 0 ? scannedBlocks.toLocaleString() : "few thousand"} blocks
              {sort !== "trending" ? " for this tab" : ""}. <Link href="/launch">Launch the first one.</Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="board-head" aria-hidden="true">
            <span>Token</span>
            <span>Bonding</span>
            <span className="board-num">Price</span>
            <span className="board-num">Change</span>
            <span className="board-num">Market cap</span>
            <span className="board-num">Liquidity</span>
            <span className="board-num">Holders</span>
          </div>

          <ul className="board-list">
            {rows.map((token) => (
              <li key={token.address}>
                <Link className="board-row" href={coinRoute(token.chainId, token.address)}>
                  <span className="board-token">
                    <TokenAvatar symbol={token.symbol} size={38} />
                    <span className="board-token-id">
                      <strong>{token.name}</strong>
                      <span className="board-token-sub mono">
                        {token.symbol} · {fmtAge(token.ageMinutes)}
                      </span>
                    </span>
                  </span>
                  <ProgressCell token={token} />
                  <span className="board-num board-cell-price mono" data-label="Price">
                    {fmtPriceEth(token.priceEth)}
                  </span>
                  <span className="board-num board-cell-delta" data-label="Change">
                    <Delta pct={token.changePct} />
                  </span>
                  <span className="board-num board-cell-mcap mono board-mcap" data-label="Market cap">
                    {mcap(token.marketCapEth)}
                  </span>
                  <span className="board-num board-cell-liq mono" data-label="Liquidity">
                    {token.liquidityEth !== null ? fmtEth(token.liquidityEth) : "on DEX"}
                  </span>
                  <span className="board-num board-cell-holders mono" data-label="Holders">
                    {token.holders !== null ? token.holders.toLocaleString() : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
