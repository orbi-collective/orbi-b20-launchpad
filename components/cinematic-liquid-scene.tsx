"use client";

import { LiquidMetal } from "@paper-design/shaders-react";

type SceneProps = {
  active: boolean;
};

const common = {
  colorBack: "#001033",
  colorTint: "#83d9ff",
  contour: 0.54,
  distortion: 0.2,
  softness: 0.12,
  repetition: 2.05,
  shiftRed: 0.04,
  shiftBlue: -0.08,
  maxPixelCount: 1_200_000,
  minPixelRatio: 1,
  style: { width: "100%", height: "100%" }
} as const;

export function CinematicLiquidScene({ active }: SceneProps) {
  const speed = active ? 0.34 : 0;

  return (
    <>
      <div className="liquid-layer liquid-layer-left">
        <LiquidMetal {...common} speed={speed} angle={62} scale={0.9} shape="none" fit="cover" />
      </div>
      <div className="liquid-layer liquid-layer-right">
        <LiquidMetal
          {...common}
          speed={speed * 0.86}
          angle={112}
          scale={0.82}
          repetition={1.9}
          colorBack="#001135"
          colorTint="#a5e7ff"
          contour={0.56}
          softness={0.12}
          shape="none"
          fit="cover"
        />
      </div>
      <div className="liquid-layer liquid-layer-bottom">
        <LiquidMetal
          {...common}
          speed={speed * 0.72}
          angle={76}
          scale={0.96}
          repetition={2.35}
          colorBack="#00123e"
          colorTint="#68cfff"
          contour={0.52}
          softness={0.14}
          shape="none"
          fit="cover"
        />
      </div>
    </>
  );
}
