import fs from "node:fs";
import { Api, InputFile } from "grammy";
import { config } from "../config.js";
import { db } from "../db.js";
import { t } from "../lib/i18n.js";
import { mediaPath } from "../lib/paths.js";

const api = config.BOT_TOKEN ? new Api(config.BOT_TOKEN) : null;

async function target(projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, include: { user: true } });
  return p && api ? p : null;
}

export async function notifyDone(projectId: string) {
  const p = await target(projectId);
  if (!p || !p.outputPath) return;
  const L = p.user.language as "uz" | "ru";
  const file = mediaPath(p.outputPath);
  try {
    const caption = `✅ ${t(L, "videoReady")}${p.demo ? "\n(DEMO)" : ""}`;
    if (fs.statSync(file).size < 49 * 1024 * 1024) {
      await api!.sendVideo(Number(p.user.telegramId), new InputFile(file, "motion-ai.mp4"), { caption, width: 1080, height: 1920, supports_streaming: true });
    } else await api!.sendMessage(Number(p.user.telegramId), caption);
  } catch (e) { console.error("[notify]", (e as Error).message); }
}

export async function notifyFailed(projectId: string, msg: string) {
  const p = await target(projectId);
  if (!p) return;
  const L = p.user.language as "uz" | "ru";
  await api!.sendMessage(Number(p.user.telegramId), `❌ ${t(L, "videoFailed")}\n${msg.slice(0, 300)}`).catch((e) => console.error("[notify]", e.message));
}
