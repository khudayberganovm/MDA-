// Telegram Mini App initData validation (HMAC-SHA256, per core.telegram.org/bots/webapps).
import crypto from "node:crypto";

export interface TgUser { id: number; first_name: string; last_name?: string; username?: string; language_code?: string }

export function validateInitData(initData: string, botToken: string, maxAgeSec = 86400): TgUser | null {
  if (!botToken || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calc = crypto.createHmac("sha256", secret).update(dataCheck).digest();
  if (!crypto.timingSafeEqual(calc, Buffer.from(hash, "hex"))) return null;
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try { const u = JSON.parse(params.get("user") ?? ""); return typeof u?.id === "number" ? u : null; } catch { return null; }
}
