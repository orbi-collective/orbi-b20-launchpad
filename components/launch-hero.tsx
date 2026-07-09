"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TokenAvatar } from "@/components/token-avatar";
import { MAINNET_LIVE } from "@/lib/chains";

export type TickerItem = { address: string; symbol: string | null; name: string | null };

const CinematicLiquidScene = dynamic(
  () => import("@/components/cinematic-liquid-scene").then((mod) => mod.CinematicLiquidScene),
  { ssr: false, loading: () => <div className="liquid-static-fallback" aria-hidden="true" /> }
);

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const listener = () => setReduced(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  return reduced;
}

function useInView() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), {
      rootMargin: "180px"
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

export function LaunchHero({ launches = [] }: { launches?: TickerItem[] }) {
  const reduced = useReducedMotion();
  const { ref, visible } = useInView();
  const ticker = launches.length >= 3 ? [...launches, ...launches] : launches;

  return (
    <section ref={ref} className="cinematic-hero launch-hero" aria-labelledby="launch-title">
      <div className="cinematic-noise" aria-hidden="true" />
      <div className="cinematic-liquid" aria-hidden="true">
        {reduced ? <div className="liquid-static-fallback reduced" /> : <CinematicLiquidScene active={visible} />}
      </div>

      <div className="cinematic-content launch-hero-content">
        <h1 id="launch-title">
          <span>Launch your</span>
          <span>
            native <em>B20</em>
          </span>
        </h1>

        <p className="launch-hero-sub">
          Deploy an Asset or Stablecoin token straight from Base&rsquo;s Factory precompile. No Solidity, nothing to audit
          later: it is native to the chain. Set mint, supply cap, and transfer policy in a single transaction.
        </p>

        <div className="launch-hero-cta">
          <Link className="hero-cta-primary" href="/launch">
            Launch a token
          </Link>
          <Link className="hero-cta-ghost" href="/verify">
            Verify a token
          </Link>
          <Link className="hero-cta-ghost" href="/explore">
            Explore launches
          </Link>
        </div>

        <p className="launch-hero-meta">
          <span className="launch-hero-dot" aria-hidden="true" />{" "}
          {MAINNET_LIVE ? "Live on Base Mainnet and Sepolia." : "Live on Base Sepolia now. Mainnet at launch."}
        </p>
      </div>

      {launches.length >= 3 ? (
        <div className="hero-ticker" aria-hidden="true">
          <span className="hero-ticker-label">Just launched</span>
          <div className="hero-ticker-mask">
            <div className={`hero-ticker-track ${reduced ? "is-static" : ""}`}>
              {ticker.map((t, i) => (
                <span className="ticker-chip" key={`${t.address}-${i}`}>
                  <TokenAvatar symbol={t.symbol} size={22} />
                  <span className="ticker-sym mono">{t.symbol || "—"}</span>
                  <span className="ticker-name">{t.name || "Unnamed"}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
