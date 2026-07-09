"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const AmbientLiquidScene = dynamic(
  () => import("@/components/ambient-liquid-scene").then((mod) => mod.AmbientLiquidScene),
  { ssr: false, loading: () => null }
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

export function AmbientLiquid() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Render immediately (like the hero) and use the observer only to pause the shader when the
  // section is well off-screen — never gate the initial mount on the observer firing.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), {
      rootMargin: "300px"
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="home-ambient" aria-hidden="true">
      {reduced ? <div className="home-ambient-static" /> : <AmbientLiquidScene active={visible} />}
    </div>
  );
}
