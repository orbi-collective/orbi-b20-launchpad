import Link from "next/link";
import { TokenAvatar } from "@/components/token-avatar";
import { CHAINS, tokenRoute } from "@/lib/chains";
import type { RecentLaunch } from "@/lib/explore";

// Real B20Created launches read from the Factory precompile. This board carries
// /explore until the bonding curve deploys; curve trading columns replace it then.

export type LaunchBoardItem = RecentLaunch & { ageMinutes: number | null };

function fmtLaunchAge(min: number | null): string {
  if (min === null) return "—";
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.floor(min / 60)}h ago`;
  return `${Math.floor(min / 1440)}d ago`;
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function LaunchesBoard({ items, error }: { items: LaunchBoardItem[]; error: string | null }) {
  if (items.length === 0) {
    return (
      <div className="board-empty">
        {error ? (
          <p>Couldn&apos;t read the Factory right now ({error}). Refresh to retry.</p>
        ) : (
          <p>
            No launches in the recent block window. <Link href="/launch">Launch the first one.</Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="board">
      <div className="board-head launches-head" aria-hidden="true">
        <span>Token</span>
        <span>Variant</span>
        <span>Network</span>
        <span>Launched</span>
        <span className="board-num">Address</span>
      </div>
      <ul className="board-list">
        {items.map((item) => (
          <li key={`${item.chainId}-${item.address}`}>
            <Link className="board-row launches-row" href={tokenRoute(item.chainId, item.address)}>
              <span className="board-token">
                <TokenAvatar symbol={item.symbol} size={38} />
                <span className="board-token-id">
                  <strong>{item.name || "Unnamed token"}</strong>
                  <span className="board-token-sub mono">{item.symbol || "—"}</span>
                </span>
              </span>
              <span data-label="Variant">
                <span className={`feed-variant ${item.variant}`}>{item.variant}</span>
              </span>
              <span className="launches-chain" data-label="Network">
                {CHAINS[item.chainId].shortName}
              </span>
              <span className="launches-age" data-label="Launched">
                {fmtLaunchAge(item.ageMinutes)}
              </span>
              <code className="board-num mono launches-addr" data-label="Address">
                {shortAddress(item.address)}
              </code>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
