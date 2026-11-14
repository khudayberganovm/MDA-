import "./lib/env.js";
import path from "node:path";
import { z } from "zod";

const bool = z.string().optional().transform((v) => v === "true" || v === "1");
const int = (d: number) => z.coerce.number().int().positive().default(d);

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: int(8080),
  PUBLIC_URL: z.string().default("http://localhost:8080"),
  MEDIA_DIR: z.string().default("./media"),
  APP_SECRET: z.string().min(16, "APP_SECRET must be at least 16 chars"),
  BOT_TOKEN: z.string().optional().default(""),
  WEBAPP_URL: z.string().optional().default(""),
  DEV_AUTH: bool,
  DEMO_MODE: bool,
  ENABLE_PAID_APIS: bool,
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  PEXELS_API_KEY: z.string().optional().default(""),
  ELEVENLABS_API_KEY: z.string().optional().default(""),
  ELEVENLABS_MODEL_UZ: z.string().default("eleven_v3"),
  ELEVENLABS_MODEL_RU: z.string().default("eleven_multilingual_v2"),
  ELEVENLABS_VOICE_UZ_MALE: z.string().optional().default(""),
  ELEVENLABS_VOICE_UZ_FEMALE: z.string().optional().default(""),
  ELEVENLABS_VOICE_RU_MALE: z.string().optional().default(""),
  ELEVENLABS_VOICE_RU_FEMALE: z.string().optional().default(""),
  MAX_PROJECTS_PER_DAY: int(10),
  MAX_ACTIVE_JOBS_PER_USER: int(2),
  MAX_JOB_RETRIES: z.coerce.number().int().min(0).default(2),
  RENDER_CONCURRENCY: int(2),
  RENDER_TIMEOUT_MS: int(900000),
  KEEP_OUTPUT_DAYS: int(14),
});

const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === "production";
if (isProd && env.DEV_AUTH) throw new Error("DEV_AUTH must be disabled in production");

const paid = (key: string) => Boolean(key) && env.ENABLE_PAID_APIS;
export const config = {
  ...env,
  mediaDir: path.resolve(env.MEDIA_DIR),
  rootDir: path.resolve(import.meta.dirname, ".."),
  providers: {
    anthropic: paid(env.ANTHROPIC_API_KEY),
    pexels: paid(env.PEXELS_API_KEY),
    elevenlabs: paid(env.ELEVENLABS_API_KEY),
  },
};

export function voiceId(lang: "uz" | "ru", gender: "male" | "female"): string {
  const k = `ELEVENLABS_VOICE_${lang.toUpperCase()}_${gender.toUpperCase()}` as keyof typeof env;
  return String(env[k] || "");
}
