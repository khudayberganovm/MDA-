// Shared project/user services used by the API and the bot.
import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../db.js";
import { ProjectOptions } from "../pipeline/storyboard.js";

export async function upsertUser(u: { id: number; first_name: string; last_name?: string; username?: string; language_code?: string }) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").slice(0, 100) || "User";
  return db.user.upsert({
    where: { telegramId: BigInt(u.id) },
    update: { name, username: u.username ?? null },
    create: { telegramId: BigInt(u.id), name, username: u.username ?? null, language: u.language_code === "ru" ? "ru" : "uz" },
  });
}

export class LimitError extends Error {}

export async function createProject(userId: number, prompt: string, rawOptions: unknown) {
  const options = ProjectOptions.parse(rawOptions);
  const text = prompt.trim();
  if (text.length < 10 || text.length > 1500) throw new LimitError("Prompt length must be 10-1500 characters");
  const since = new Date(Date.now() - 86400_000);
  const [today, active] = await Promise.all([
    db.project.count({ where: { userId, createdAt: { gte: since } } }),
    db.project.count({ where: { userId, status: { notIn: ["completed", "failed", "draft"] } } }),
  ]);
  if (today >= config.MAX_PROJECTS_PER_DAY || active >= config.MAX_ACTIVE_JOBS_PER_USER) throw new LimitError("limit");
  return db.project.create({
    data: { userId, prompt: text, options: JSON.stringify(options), duration: options.duration, status: "queued", jobs: { create: {} } },
  });
}

export function publicProject(p: { id: string; prompt: string; status: string; duration: number; createdAt: Date; error: string | null; demo: boolean; outputPath: string | null; script: string | null; attributions: string | null; options: string }, job?: { stage: string; progress: number } | null) {
  return {
    id: p.id, prompt: p.prompt, status: p.status, duration: p.duration, createdAt: p.createdAt, demo: p.demo,
    error: p.status === "failed" ? p.error : null, hasVideo: Boolean(p.outputPath && p.status === "completed"),
    script: p.script, attributions: p.attributions ? JSON.parse(p.attributions) : [], options: JSON.parse(p.options),
    progress: job?.progress ?? (p.status === "completed" ? 1 : 0),
  };
}

/** Short-lived signed download URL (no auth header needed, e.g. Telegram.openLink). */
export function signDownload(projectId: string, ttlSec = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = crypto.createHmac("sha256", config.APP_SECRET).update(`${projectId}.${exp}`).digest("hex");
  return `/dl/${projectId}?exp=${exp}&sig=${sig}`;
}
export function verifyDownload(projectId: string, exp: string, sig: string) {
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000 || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const want = crypto.createHmac("sha256", config.APP_SECRET).update(`${projectId}.${exp}`).digest();
  return crypto.timingSafeEqual(want, Buffer.from(sig, "hex"));
}
