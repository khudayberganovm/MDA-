// Single DB-backed render worker. One job at a time; crash-safe via stale-lock recovery.
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { db } from "../db.js";
import { PipelineError } from "../pipeline/errors.js";
import { prepareRenderer } from "../pipeline/render.js";
import { runProject } from "../pipeline/run.js";
import { notifyDone, notifyFailed } from "./notify.js";

const STALE_MS = config.RENDER_TIMEOUT_MS + 60_000;
let stopping = false;

export async function recover() {
  // Jobs left "running" by a crashed/restarted worker go back to the queue (counts as a retry).
  const stale = await db.job.findMany({ where: { status: "running" } });
  for (const j of stale) {
    if (j.lockedAt && Date.now() - j.lockedAt.getTime() < STALE_MS && process.env.WORKER_SHARED === "1") continue;
    await requeueOrFail(j.id, j.projectId, j.retryCount, "Worker qayta ishga tushdi");
  }
  if (stale.length) console.log(`[worker] recovered ${stale.length} job(s)`);
}

async function requeueOrFail(jobId: string, projectId: string, retries: number, msg: string, retryable = true) {
  if (retryable && retries < config.MAX_JOB_RETRIES) {
    await db.job.update({ where: { id: jobId }, data: { status: "queued", retryCount: retries + 1, error: msg, lockedAt: null, runAfter: new Date(Date.now() + 15_000 * (retries + 1)) } });
    await db.project.update({ where: { id: projectId }, data: { status: "queued" } });
  } else {
    await db.job.update({ where: { id: jobId }, data: { status: "failed", error: msg, lockedAt: null } });
    await db.project.update({ where: { id: projectId }, data: { status: "failed", error: msg } });
    await notifyFailed(projectId, msg);
  }
}

async function claim() {
  const next = await db.job.findFirst({ where: { status: "queued", runAfter: { lte: new Date() } }, orderBy: { createdAt: "asc" } });
  if (!next) return null;
  const { count } = await db.job.updateMany({ where: { id: next.id, status: "queued" }, data: { status: "running", lockedAt: new Date() } });
  return count ? next : null;
}

export async function processOne(): Promise<boolean> {
  const job = await claim();
  if (!job) return false;
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new PipelineError("Render vaqti tugadi", true)), config.RENDER_TIMEOUT_MS).unref());
  try {
    await Promise.race([runProject(job.id, job.projectId), timeout]);
    await db.job.update({ where: { id: job.id }, data: { status: "done", stage: "completed", progress: 1, lockedAt: null, error: null } });
    await notifyDone(job.projectId);
  } catch (e) {
    const err = e as Error;
    const retryable = e instanceof PipelineError ? e.retryable : true;
    console.error(`[worker] job ${job.id} failed:`, err.message);
    await requeueOrFail(job.id, job.projectId, job.retryCount, err.message.slice(0, 500), retryable);
  }
  return true;
}

function cleanup() {
  // Delete outputs older than KEEP_OUTPUT_DAYS.
  const dir = path.join(config.mediaDir, "projects");
  if (!fs.existsSync(dir)) return;
  const cutoff = Date.now() - config.KEEP_OUTPUT_DAYS * 86400_000;
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d);
    if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { recursive: true, force: true });
  }
}

export async function startWorker() {
  fs.mkdirSync(config.mediaDir, { recursive: true });
  await recover();
  console.log("[worker] preparing renderer (bundle + browser)...");
  await prepareRenderer();
  console.log("[worker] ready");
  cleanup();
  setInterval(cleanup, 6 * 3600_000).unref();
  process.once("SIGTERM", () => (stopping = true));
  process.once("SIGINT", () => (stopping = true));
  while (!stopping) {
    const did = await processOne().catch((e) => { console.error("[worker]", e); return false; });
    if (!did) await new Promise((r) => setTimeout(r, 2000));
  }
}
