import { Composition } from "remotion";
import { Ad } from "./Ad";
import type { AdProps } from "./types";

const sample: AdProps = {
  template: "business", style: "professional", title: "MOTION AI", businessName: "MOTION AI", demo: true,
  cta: { text: "Hoziroq buyurtma bering", subtext: "" },
  scenes: [
    { durationInFrames: 90, narrationFrames: 80, headline: "Biznesingiz uchun", subtitle: "Biznesingizni yangi bosqichga olib chiqing.", motion: "zoom" },
    { durationInFrames: 90, narrationFrames: 80, headline: "Bugunoq bog‘laning", subtitle: "Biz bilan bog‘laning!", motion: "scale" },
  ],
};

export const Root = () => (
  <Composition
    id="Ad"
    component={Ad}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={180}
    defaultProps={sample}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(30, props.scenes.reduce((a, s) => a + s.durationInFrames, 0)) })}
  />
);
