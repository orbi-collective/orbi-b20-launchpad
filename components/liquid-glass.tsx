"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * LiquidGlassFilter — real edge refraction for the hero glass panels.
 *
 * Technique adapted from Outpace Studios' "liquid glass" writeup
 * (https://glass.outpacestudios.com): instead of painting a frosted gradient, we build a
 * squircle-dome displacement map and feed it to an SVG `feDisplacementMap`. Each map pixel
 * stores an x/y sampling offset in its R/G channels (128 = "leave it put"); the bend is
 * computed from the surface normal so it concentrates at the rim while the centre stays clear,
 * exactly how a thick piece of glass behaves.
 *
 * Cross-browser reality (per the same writeup): `backdrop-filter` only runs an SVG displacement
 * filter in Chromium — Safari/Firefox accept the property and silently keep just the blur. So
 * this is a progressive enhancement: the refraction lights up in Chromium, everyone else still
 * gets the blur + specular rim defined in CSS. We gate the `url()` on `data-glass-ready` so the
 * backdrop never flashes empty while the map is being generated, honour
 * `prefers-reduced-transparency`, and hand the map to the filter as a blob URL (WebKit refuses
 * `data:` URIs inside `feImage`).
 */

const MAP_WIDTH = 480;
const MAP_HEIGHT = 300;
const CORNER_RADIUS = 46; // map-space corner radius of the squircle.
const BEZEL = 30; // width of the refractive rim band, in map pixels.
const GAIN = 96; // peak channel offset away from 128 at the rim.

function roundedRectSdf(x: number, y: number, halfW: number, halfH: number, radius: number): number {
  const qx = Math.abs(x) - halfW + radius;
  const qy = Math.abs(y) - halfH + radius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius; // < 0 inside, 0 on the edge, > 0 outside.
}

function buildDisplacementMap(): ImageData {
  const data = new Uint8ClampedArray(MAP_WIDTH * MAP_HEIGHT * 4);
  const halfW = MAP_WIDTH / 2;
  const halfH = MAP_HEIGHT / 2;

  for (let py = 0; py < MAP_HEIGHT; py += 1) {
    for (let px = 0; px < MAP_WIDTH; px += 1) {
      const x = px - halfW;
      const y = py - halfH;

      const sdf = roundedRectSdf(x, y, halfW, halfH, CORNER_RADIUS);
      const depth = Math.max(0, -sdf); // distance inward from the nearest edge.

      // Rim profile: 1 at the very edge, easing to 0 by the time we reach `BEZEL` inward.
      const t = Math.max(0, 1 - depth / BEZEL);
      const profile = t * t; // bias the bend toward the outermost pixels.

      // Outward surface normal = gradient of the SDF (finite differences).
      const dx = roundedRectSdf(x + 1, y, halfW, halfH, CORNER_RADIUS) - roundedRectSdf(x - 1, y, halfW, halfH, CORNER_RADIUS);
      const dy = roundedRectSdf(x, y + 1, halfW, halfH, CORNER_RADIUS) - roundedRectSdf(x, y - 1, halfW, halfH, CORNER_RADIUS);
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;

      const offset = profile * GAIN;
      const i = (py * MAP_WIDTH + px) * 4;
      // Convex lens: sample toward the centre at the rim (magnify middle, bend the edge in).
      data[i] = 128 - nx * offset; // R -> x displacement
      data[i + 1] = 128 - ny * offset; // G -> y displacement
      data[i + 2] = 128; // B unused by the displacement pass
      data[i + 3] = 255;
    }
  }

  return new ImageData(data, MAP_WIDTH, MAP_HEIGHT);
}

export function LiquidGlassFilter() {
  const reactId = useId();
  const filterId = `glass-refraction-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reducedTransparency = window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches;
    if (reducedTransparency) return; // opaque panels instead of refraction.

    let cancelled = false;
    const canvas = document.createElement("canvas");
    canvas.width = MAP_WIDTH;
    canvas.height = MAP_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.putImageData(buildDisplacementMap(), 0, 0);

    canvas.toBlob((blob) => {
      if (cancelled || !blob) return;
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setMapUrl(url);
      document.documentElement.dataset.glassReady = "1";
      document.documentElement.style.setProperty("--glass-filter", `url(#${filterId})`);
    }, "image/png");

    return () => {
      cancelled = true;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      delete document.documentElement.dataset.glassReady;
      document.documentElement.style.removeProperty("--glass-filter");
    };
  }, [filterId]);

  if (!mapUrl) return null;

  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }}>
      <defs>
        <filter
          id={filterId}
          x="0"
          y="0"
          width="100%"
          height="100%"
          // sRGB keeps the grey-to-offset mapping linear in display space; the default
          // linearRGB quietly changes how far each value displaces.
          colorInterpolationFilters="sRGB"
        >
          <feImage href={mapUrl} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="34" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
