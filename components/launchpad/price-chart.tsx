"use client";

import { useId, useMemo, useState } from "react";
import { fmtPriceEth, type PricePoint } from "@/lib/curve";

function buildPath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

export function PriceChart({ history, up }: { history: PricePoint[]; up: boolean }) {
  const gradientId = useId();
  const [hover, setHover] = useState<{ x: number; index: number } | null>(null);
  const width = 640;
  const height = 220;
  const padY = 14;

  const { linePoints, min, max } = useMemo(() => {
    const prices = history.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || max || 1;
    const linePoints = history.map((p, i) => ({
      x: (i / (history.length - 1)) * width,
      y: height - padY - ((p.price - min) / span) * (height - padY * 2)
    }));
    return { linePoints, min, max };
  }, [history]);

  const areaPath = `${buildPath(linePoints)} L${width},${height} L0,${height} Z`;
  const linePath = buildPath(linePoints);
  const stroke = up ? "#6ee6aa" : "#ff7a8a";
  const active = hover ? history[hover.index] : history[history.length - 1];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const index = Math.round(ratio * (history.length - 1));
    setHover({ x: linePoints[index].x, index });
  }

  return (
    <div className="price-chart">
      <div className="price-chart-readout">
        <span className="mono price-chart-price">{fmtPriceEth(active.price)} ETH</span>
        <span className="price-chart-time">{new Date(active.t).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}</span>
      </div>
      <svg
        className="price-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Price chart, currently ${active.price} ETH`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover ? (
          <line x1={hover.x} y1={0} x2={hover.x} y2={height} stroke="rgba(210,222,248,0.28)" strokeWidth="1" strokeDasharray="3 4" />
        ) : null}
        {hover ? <circle cx={hover.x} cy={linePoints[hover.index].y} r="3.5" fill={stroke} /> : null}
      </svg>
      <div className="price-chart-scale">
        <span>{fmtPriceEth(max)}</span>
        <span>{fmtPriceEth(min)}</span>
      </div>
    </div>
  );
}
