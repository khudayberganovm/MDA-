import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/** Resolve a path inside MEDIA_DIR; throws on traversal. */
export function mediaPath(...parts: string[]): string {
  const p = path.resolve(config.mediaDir, ...parts);
  if (p !== config.mediaDir && !p.startsWith(config.mediaDir + path.sep)) throw new Error("Invalid path");
  return p;
}
export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}
export const safeId = (s: string) => {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(s)) throw new Error("Invalid id");
  return s;
};
