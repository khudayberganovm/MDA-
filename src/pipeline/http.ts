import fs from "node:fs";
import { PipelineError } from "./errors.js";

const ALLOWED_DOWNLOAD_HOSTS = [/\.pexels\.com$/, /^player\.vimeo\.com$/, /\.vimeocdn\.com$/];

export async function fetchJson(url: string, init: RequestInit, label: string, timeoutMs = 20000) {
  let r: Response;
  try { r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (e) { throw new PipelineError(`${label}: tarmoq xatosi (${(e as Error).message})`, true); }
  if (!r.ok) throw new PipelineError(`${label}: HTTP ${r.status}`, r.status === 429 || r.status >= 500);
  return r.json();
}

/** Download a file from an allow-listed HTTPS host with a size cap. */
export async function download(url: string, dest: string, maxBytes: number, timeoutMs = 60000) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !ALLOWED_DOWNLOAD_HOSTS.some((re) => re.test(u.hostname))) throw new PipelineError("Ruxsat etilmagan media manzili", false);
  const r = await fetch(u, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  if (!r.ok || !r.body) throw new PipelineError(`Yuklab olish xatosi: HTTP ${r.status}`, true);
  const final = new URL(r.url);
  if (!ALLOWED_DOWNLOAD_HOSTS.some((re) => re.test(final.hostname))) throw new PipelineError("Ruxsat etilmagan yo'naltirish", false);
  const tmp = dest + ".part";
  const out = fs.createWriteStream(tmp);
  let size = 0;
  try {
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > maxBytes) throw new PipelineError("Media fayl juda katta", false);
      if (!out.write(chunk)) await new Promise<void>((res) => out.once("drain", () => res()));
    }
    await new Promise<void>((res, rej) => out.end((e?: Error) => (e ? rej(e) : res())));
    fs.renameSync(tmp, dest);
  } catch (e) { out.destroy(); fs.rmSync(tmp, { force: true }); throw e; }
}
