declare global { interface Window { Telegram?: { WebApp: { initData: string; ready(): void; expand(): void; openLink(u: string): void; downloadFile?(p: { url: string; file_name: string }): void; HapticFeedback?: { impactOccurred(s: string): void }; setHeaderColor?(c: string): void } } } }

export const tg = window.Telegram?.WebApp;
// Inside Telegram: signed initData (verified server-side). Outside: dev auth (server refuses it in production).
function authHeader(): string {
  if (tg?.initData) return `tma ${tg.initData}`;
  let id = localStorage.getItem("devId");
  if (!id) { id = String(100000 + Math.floor(Math.random() * 900000)); localStorage.setItem("devId", id); }
  return `dev ${id}`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: authHeader() };
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const r = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? `HTTP ${r.status}`), { status: r.status, body: j });
  return j as T;
}

export interface Project { id: string; prompt: string; status: string; duration: number; createdAt: string; demo: boolean; error: string | null; hasVideo: boolean; progress: number; script: string | null; attributions: { author: string; url: string }[] }
export interface Me { user: { name: string; username: string | null; language: "uz" | "ru"; telegramId: string; createdAt: string }; providers: Record<string, boolean>; demoMode: boolean; voices: Record<"uz" | "ru", { male: boolean; female: boolean }> }
