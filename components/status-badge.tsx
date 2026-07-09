import clsx from "clsx";
import type { ReportStatus } from "@/lib/types";

export function StatusBadge({ status, label }: { status: ReportStatus; label: string }) {
  return <span className={clsx("status-badge", `status-${status}`)}>{label}</span>;
}
