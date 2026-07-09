"use client";

import { LiquidMetal } from "@paper-design/shaders-react";

type SceneProps = {
  active: boolean;
};

// Same material vocabulary as the hero (cinematic-liquid-scene) so the lower section reads as
// the same glossy liquid-metal surface, just a calmer two-ribbon composition.
const common = {
  colorBack: "#00102e",
  colorTint: "#83d9ff",
  contour: 0.54,
  distortion: 0.18,
  softness: 0.12,
  repetition: 2,
  shiftRed: 0.04,
  shiftBlue: -0.08,
  maxPixelCount: 900_000,
  minPixelRatio: 1,
  style: { width: "100%", height: "100%" }
} as const;

export function AmbientLiquidScene({ active }: SceneProps) {
  const speed = active ? 0.3 : 0;

  return (
    <>
      <div className="liquid-layer ambient-layer-a">
        <LiquidMetal {...common} speed={speed} angle={48} scale={0.92} shape="none" fit="cover" />
      </div>
      <div className="liquid-layer ambient-layer-b">
        <LiquidMetal
          {...common}
          speed={speed * 0.82}
          angle={126}
          scale={0.82}
          repetition={1.85}
          colorBack="#001236"
          colorTint="#a5e7ff"
          contour={0.56}
          shape="none"
          fit="cover"
        />
      </div>
    </>
  );
}
