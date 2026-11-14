import { z } from "zod";

export const MOTIONS = ["fade", "slide", "scale", "zoom"] as const;

// Schema sent to the model (kept simple for structured outputs).
export const LlmStoryboard = z.object({
  topic: z.string().describe("Short marketing topic"),
  language: z.enum(["uz", "ru"]),
  title: z.string().describe("Video headline, max 6 words"),
  scenes: z.array(z.object({
    order: z.number().int(),
    durationSec: z.number().describe("Target seconds for this scene"),
    visual: z.string().describe("What the viewer sees"),
    keywords: z.array(z.string()).describe("1-3 English stock video search queries, 1-3 words each"),
    narration: z.string().describe("Exact voice-over text for this scene, in the video language"),
    subtitle: z.string().describe("On-screen caption; usually equal to narration"),
    headline: z.string().describe("Big on-screen text, max 5 words"),
    motion: z.enum(MOTIONS),
  })),
  cta: z.object({ text: z.string(), subtext: z.string() }),
});

// Strict validation applied to every storyboard (AI or demo).
export const Storyboard = LlmStoryboard.extend({
  title: z.string().min(1).max(80),
  scenes: z.array(LlmStoryboard.shape.scenes.element.extend({
    durationSec: z.number().min(1.5).max(12),
    keywords: z.array(z.string().min(1).max(60)).min(1).max(4),
    narration: z.string().min(1).max(400),
    subtitle: z.string().min(1).max(400),
    headline: z.string().min(1).max(60),
  })).min(3).max(7),
  cta: z.object({ text: z.string().min(1).max(80), subtext: z.string().max(120) }),
});
export type Storyboard = z.infer<typeof Storyboard>;

export const ProjectOptions = z.object({
  duration: z.union([z.literal(15), z.literal(30)]),
  language: z.enum(["uz", "ru"]),
  voice: z.enum(["male", "female"]),
  style: z.enum(["professional", "dynamic", "minimal"]),
  cta: z.string().trim().max(80).optional().default(""),
  businessName: z.string().trim().max(60).optional().default(""),
  logoPath: z.string().optional(),
});
export type ProjectOptions = z.infer<typeof ProjectOptions>;

export const scriptText = (sb: Storyboard) => sb.scenes.map((s) => s.narration).join(" ");
