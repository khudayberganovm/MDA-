// Pexels video search (official API). Falls back to typography scenes when unavailable.
import fs from "node:fs";
import { config } from "../config.js";
import { ensureDir, mediaPath } from "../lib/paths.js";
import { download, fetchJson } from "./http.js";
import type { Storyboard } from "./storyboard.js";

export interface Clip { file: string; credit: { provider: "pexels"; id: number; author: string; authorUrl: string; url: string } }

interface PexelsVideo { id: number; url: string; duration: number; width: number; height: number; user: { name: string; url: string };
  video_files: { link: string; width: number | null; height: number | null; file_type: string }[] }

async function search(q: string): Promise<PexelsVideo[]> {
  const url = `https://api.pexels.com/videos/search?${new URLSearchParams({ query: q, orientation: "portrait", per_page: "8", size: "medium" })}`;
  const j = await fetchJson(url, { headers: { Authorization: config.PEXELS_API_KEY } }, "Pexels");
  return j.videos ?? [];
}

function pickFile(v: PexelsVideo) {
  const files = v.video_files.filter((f) => f.file_type === "video/mp4" && f.width && f.height && f.height >= f.width);
  // Prefer ~1080p portrait, avoid 4K to limit download/render cost.
  files.sort((a, b) => Math.abs((a.height ?? 0) - 1920) - Math.abs((b.height ?? 0) - 1920));
  return files.find((f) => (f.height ?? 0) <= 2560) ?? null;
}

/** Returns a clip per scene index, or null for typography fallback. */
export async function sourceClips(sb: Storyboard, log: (m: string) => void): Promise<(Clip | null)[]> {
  if (!config.providers.pexels) { log("Pexels disabled -> typography scenes"); return sb.scenes.map(() => null); }
  const cache = ensureDir(mediaPath("cache", "pexels"));
  const used = new Set<number>();
  const out: (Clip | null)[] = [];
  for (const scene of sb.scenes) {
    let clip: Clip | null = null;
    for (const q of scene.keywords.slice(0, 3)) {
      try {
        const vids = (await search(q)).filter((v) => !used.has(v.id) && v.duration >= Math.min(scene.durationSec, 6));
        for (const v of vids) {
          const f = pickFile(v);
          if (!f) continue;
          const file = `${cache}/${v.id}.mp4`;
          if (!fs.existsSync(file)) await download(f.link, file, 80 * 1024 * 1024);
          used.add(v.id);
          clip = { file, credit: { provider: "pexels", id: v.id, author: v.user.name, authorUrl: v.user.url, url: v.url } };
          break;
        }
      } catch (e) { log(`Pexels "${q}" failed: ${(e as Error).message}`); }
      if (clip) break;
    }
    out.push(clip);
  }
  return out;
}
