import type { CSSProperties } from "react";

// Deterministic coin avatar: a launchpad-style token mark generated from the symbol, so every
// token reads as its own coin without an image upload.
function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function TokenAvatar({ symbol, size = 44 }: { symbol?: string | null; size?: number }) {
  const clean = (symbol ?? "").trim();
  const initials = clean ? clean.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "B" : "B";
  const h = clean ? hue(clean.toUpperCase()) : 218;
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.36),
    "--h1": h,
    "--h2": (h + 28) % 360
  } as CSSProperties;
  return (
    <span className="token-avatar" style={style} aria-hidden="true">
      {initials}
    </span>
  );
}
