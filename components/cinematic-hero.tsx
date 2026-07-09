"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { routeForToken } from "@/lib/b20";
import { LiquidGlassFilter } from "@/components/liquid-glass";
import type { ChainId } from "@/lib/types";

const CinematicLiquidScene = dynamic(
  () => import("@/components/cinematic-liquid-scene").then((mod) => mod.CinematicLiquidScene),
  {
    ssr: false,
    loading: () => <div className="liquid-static-fallback" aria-hidden="true" />
  }
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

function HeroVerifier() {
  const router = useRouter();
  const [chainId, setChainId] = useState<ChainId>(8453);
  const [address, setAddress] = useState("0xB200...17A3F8C2");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isAddress(address.trim())) {
      setError("Paste a full Base token address.");
      return;
    }

    const normalized = getAddress(address.trim());
    startTransition(() => router.push(routeForToken(chainId, normalized)));
  }

  return (
    <form className="cinematic-checker" onSubmit={submit}>
      <label htmlFor="cinematic-address">Verify token address</label>
      <div className="cinematic-input-row">
        <input
          id="cinematic-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onFocus={() => {
            if (address === "0xB200...17A3F8C2") setAddress("");
          }}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={Boolean(error)}
        />
        <select
          aria-label="Network"
          value={chainId}
          onChange={(event) => setChainId(Number(event.target.value) as ChainId)}
        >
          <option value={8453}>Mainnet</option>
          <option value={84532}>Sepolia</option>
        </select>
        <button type="submit" disabled={isPending}>
          {isPending ? "Checking" : "Verify"}
        </button>
      </div>
      {error ? <p className="cinematic-error">{error}</p> : null}
    </form>
  );
}

export function CinematicHero() {
  const reduced = useReducedMotion();
  const { ref, visible } = useInView();

  return (
    <section ref={ref} className="cinematic-hero" aria-labelledby="cinematic-title">
      <LiquidGlassFilter />
      <div className="cinematic-noise" aria-hidden="true" />
      <div className="cinematic-liquid" aria-hidden="true">
        {reduced ? <div className="liquid-static-fallback reduced" /> : <CinematicLiquidScene active={visible} />}
      </div>

      <div className="cinematic-content">
        <h1 id="cinematic-title">
          <span>Is this token</span>
          <span>
            actually native <em>B20?</em>
          </span>
        </h1>

        <div className="cinematic-stack">
          <HeroVerifier />

          <div className="cinematic-result" aria-label="Example verification result">
            <span>
              Verification result
              <em className="cinematic-tag">Example</em>
            </span>
            <strong>
              <i aria-hidden="true" /> Native B20 <b>—</b> Factory confirmed
            </strong>
          </div>

          <div className="cinematic-proof-grid">
            <article>
              <span>Supply</span>
              <strong>Fixed</strong>
              <p>Immutable by design</p>
            </article>
            <article>
              <span>Transfers</span>
              <strong>Permissionless</strong>
              <p>Open and unrestricted</p>
            </article>
            <article>
              <span>Controls</span>
              <strong>None</strong>
              <p>No owner. No admin.</p>
            </article>
          </div>

          <p className="cinematic-example-note">
            Example output. Paste a Base token address above to run a live check.
          </p>
        </div>
      </div>
    </section>
  );
}
