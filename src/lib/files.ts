// Uploaded files: type sniffing, storage under MEDIA_DIR and signed download links.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { db } from "../db.js";
import { ensureDir, mediaPath } from "./paths.js";

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

export type Sniffed = { mime: string; ext: string; kind: "image" | "video" };
/** Detect type from magic bytes (never trust the client's content type). */
export function sniff(buf: Buffer): Sniffed | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png", kind: "image" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp", kind: "image" };
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (/^(heic|heix|mif1|msf1)$/.test(brand)) return { mime: "image/heic", ext: "heic", kind: "image" };
    if (brand === "qt  ") return { mime: "video/quicktime", ext: "mov", kind: "video" };
    return { mime: "video/mp4", ext: "mp4", kind: "video" };
  }
  return null;
}

export function storeBuffer(dir: string, buf: Buffer, ext: string): string {
  const rel = path.join(dir, `${crypto.randomUUID()}.${ext}`);
  ensureDir(path.dirname(mediaPath(rel)));
  fs.writeFileSync(mediaPath(rel), buf);
  return rel;
}

export const cleanName = (n: string) => (n || "file").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(-80);

/** Signed, expiring link to a stored file (works without auth headers, e.g. from Telegram or Claude). */
export function signFile(fileId: string, ttlSec = 7 * 86400): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = crypto.createHmac("sha256", config.APP_SECRET).update(`file.${fileId}.${exp}`).digest("hex");
  return `${config.publicUrl}/f/${fileId}?exp=${exp}&sig=${sig}`;
}
export function verifyFile(fileId: string, exp: string, sig: string): boolean {
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000 || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const want = crypto.createHmac("sha256", config.APP_SECRET).update(`file.${fileId}.${exp}`).digest();
  return crypto.timingSafeEqual(want, Buffer.from(sig, "hex"));
}

export async function filesForOrder(orderId: number) {
  const files = await db.fileAsset.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
  return files.map((f) => ({ id: f.id, kind: f.kind, name: f.name, mime: f.mime, size: f.size, createdAt: f.createdAt, url: f.path ? signFile(f.id) : null, inTelegram: Boolean(f.tgFileId) }));
}
