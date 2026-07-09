import Link from "next/link";
import { routeForToken } from "@/lib/b20";
import type { RecentCheck } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function RecentChecks({ checks }: { checks: RecentCheck[] }) {
  if (checks.length === 0) {
    return (
      <div className="empty-recent">
        Recent checks will appear here after the first successful verification.
      </div>
    );
  }

  return (
    <div className="recent-list">
      {checks.map((check) => (
        <Link className="recent-row" key={`${check.chainId}-${check.address}`} href={routeForToken(check.chainId, check.address)}>
          <span className="mono">{shortAddress(check.address)}</span>
          <StatusBadge status={check.status} label={check.label} />
        </Link>
      ))}
    </div>
  );
}
