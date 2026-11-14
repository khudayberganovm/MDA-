export type Motion = "fade" | "slide" | "scale" | "zoom";
export interface SceneProps {
  durationInFrames: number;
  clipUrl?: string;
  audioUrl?: string;
  narrationFrames: number;
  headline: string;
  subtitle: string;
  motion: Motion;
}
export interface AdProps {
  [key: string]: unknown;
  template: "business" | "minimal";
  style: "professional" | "dynamic" | "minimal";
  title: string;
  businessName: string;
  logoUrl?: string;
  scenes: SceneProps[];
  cta: { text: string; subtext: string };
  demo: boolean;
}
