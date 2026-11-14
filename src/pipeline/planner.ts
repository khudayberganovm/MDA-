import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";
import { PipelineError } from "./errors.js";
import { demoStoryboard } from "./demo.js";
import { LlmStoryboard, Storyboard, type ProjectOptions } from "./storyboard.js";

const SYSTEM = `You are a senior short-form video ad copywriter for small businesses in Uzbekistan.
Write a vertical (9:16) social video ad plan from the user's request.
Rules:
- Write narration, subtitles, headlines and CTA in the requested language (Uzbek Latin script for "uz", Russian Cyrillic for "ru").
- Never invent facts: no prices, discounts, ratings, testimonials, guarantees, addresses or phone numbers unless the user gave them.
- Narration must be speakable in the scene duration (about 2.3 words per second).
- keywords are concrete English stock-footage queries (e.g. "air conditioner", "modern living room").
- Use the given CTA text if provided; otherwise write a neutral one (e.g. "Hoziroq buyurtma bering").
- Scene durations must add up to the target total.`;

export async function planStoryboard(prompt: string, o: ProjectOptions): Promise<{ storyboard: Storyboard; demo: boolean }> {
  if (!config.providers.anthropic) {
    if (config.DEMO_MODE) return { storyboard: demoStoryboard(o), demo: true };
    throw new PipelineError("Anthropic API kaliti sozlanmagan (ANTHROPIC_API_KEY / ENABLE_PAID_APIS).", false);
  }
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 });
  const sceneCount = o.duration === 15 ? "3-4" : "4-7";
  const user = `Request: """${prompt}"""
Target total duration: ${o.duration} seconds. Scenes: ${sceneCount}. Language: ${o.language}.
Style: ${o.style}. Business name: ${o.businessName || "(not given)"}. CTA text: ${o.cta || "(not given)"}.`;

  let res;
  try {
    res = await client.messages.parse({
      model: config.ANTHROPIC_MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low", format: zodOutputFormat(LlmStoryboard) },
    });
  } catch (e) {
    const retryable = e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError;
    throw new PipelineError(`AI rejalashtirish xatosi: ${(e as Error).message}`, retryable);
  }
  if (res.stop_reason === "refusal") throw new PipelineError("AI bu so'rovni bajarishni rad etdi. So'rovni o'zgartiring.", false);
  const parsed = Storyboard.safeParse(res.parsed_output);
  if (!parsed.success) throw new PipelineError("AI noto'g'ri formatdagi ssenariy qaytardi.", true);
  const sb = parsed.data;
  sb.scenes.sort((a, b) => a.order - b.order);
  if (o.cta) sb.cta.text = o.cta;
  return { storyboard: sb, demo: false };
}
