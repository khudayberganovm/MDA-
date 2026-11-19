interface TgWebApp {
  initData: string; colorScheme?: string;
  ready(): void; expand(): void; openLink(u: string): void; openTelegramLink?(u: string): void;
  showConfirm?(m: string, cb: (ok: boolean) => void): void;
  HapticFeedback?: { impactOccurred(s: string): void; notificationOccurred?(s: string): void };
  setHeaderColor?(c: string): void; setBackgroundColor?(c: string): void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
}
declare global { interface Window { Telegram?: { WebApp: TgWebApp } } }

export const tg = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;

// Inside Telegram: signed initData (verified server-side). Outside: dev auth (refused by the server in production).
function authHeader(): string {
  if (tg?.initData) return `tma ${tg.initData}`;
  let id: string | null = null;
  try { id = localStorage.getItem("devId"); } catch { /* storage blocked */ }
  if (!id) { id = new URLSearchParams(location.search).get("dev") ?? String(100000 + Math.floor(Math.random() * 900000)); try { localStorage.setItem("devId", id); } catch { /* ignore */ } }
  return `dev ${id}`;
}

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: authHeader() };
  if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const r = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, r.status === 401 ? "unauthorized" : r.status >= 500 ? "Server xatosi. Birozdan keyin urinib ko‘ring." : j.error ?? `Xatolik (${r.status})`);
  return j as T;
}
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

/** Multipart upload with progress (fetch has no upload progress). */
export function upload<T>(path: string, file: File, onProgress?: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", path);
    x.setRequestHeader("Authorization", authHeader());
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      let j: { error?: string } = {};
      try { j = JSON.parse(x.responseText); } catch { /* not json */ }
      if (x.status >= 200 && x.status < 300) resolve(j as T);
      else reject(new ApiError(x.status, x.status === 413 ? "Fayl juda katta" : j.error ?? `Xatolik (${x.status})`));
    };
    x.onerror = () => reject(new ApiError(0, "Internet aloqasini tekshiring"));
    const fd = new FormData(); fd.append("file", file);
    x.send(fd);
  });
}

export const openUrl = (url: string) => (tg ? tg.openLink(url) : window.open(url, "_blank"));
export const haptic = (k: "light" | "medium" | "success" | "error" = "light") => {
  if (k === "success" || k === "error") tg?.HapticFeedback?.notificationOccurred?.(k);
  else tg?.HapticFeedback?.impactOccurred(k);
};
export const confirmBox = (m: string) => new Promise<boolean>((res) => (tg?.showConfirm ? tg.showConfirm(m, res) : res(window.confirm(m))));

export const money = (n: number) => `${n.toLocaleString("ru-RU").replace(/ /g, " ")} so‘m`;
export const dateTime = (s: string) => new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export type PayProvider = "payme" | "click" | "manual" | "dev";
export interface Agency { name: string; instagram: string; phone: string; telegram: string; city: string; logoFileId: string | null; logoUrl: string | null }
export interface Me {
  user: { name: string; username: string | null; language: "uz" | "ru"; telegramId: string; credits: number; createdAt: string };
  agency: Agency | null; isAdmin: boolean; payments: Record<PayProvider, boolean>; manualPayInfo: string | null; support: string | null; revisionsPerOrder: number;
}
export interface Template { id: number; title: string; category: string; description: string; durationSec: number; format: string; previewUrl: string | null; posterUrl: string | null; active: boolean; sortOrder: number; agentNotes?: string }
export interface Pkg { id: number; title: string; videos: number; price: number; oldPrice: number | null; badge: string | null; active?: boolean; sortOrder?: number }
export interface Catalog { templates: Template[]; packages: Pkg[] }
export interface FileRef { id: string; kind: string; name: string; mime: string; size: number; url: string | null; inTelegram: boolean; createdAt: string }
export interface Brief { destination: string; dates: string; price: string; includes: string[]; hotel: string; offer: string; phone: string; language: "uz" | "ru"; voice: "male" | "female" | "music"; extra: string }
export interface OrderListItem { id: number; code: string; status: string; statusLabel: string; template: { title: string; posterUrl: string | null }; destination: string; createdAt: string }
export interface OrderFull {
  id: number; code: string; status: string; statusLabel: string; template: Template; brief: Brief; agency: Omit<Agency, "logoUrl">;
  revisionsLeft: number; revisionNote: string | null; assignee: string | null; createdAt: string; updatedAt: string; deliveredAt: string | null;
  events: { type: string; note: string | null; by: string | null; at: string }[]; results: FileRef[]; materials: FileRef[];
  user?: { name: string; username: string | null; telegramId: string; credits: number }; claudeBrief?: string;
}
export interface PurchaseStart { id: number; amount: number; videos: number; provider: PayProvider; status: string; payUrl: string | null; manualPayInfo: string | null }

export const INCLUDES: [string, string][] = [["avia", "Aviachipta"], ["hotel", "Mehmonxona"], ["transfer", "Transfer"], ["food", "Ovqatlanish"], ["visa", "Viza"], ["excursions", "Ekskursiyalar"], ["insurance", "Sug‘urta"], ["guide", "Gid"]];
export const STATUS_COLOR: Record<string, string> = {
  awaiting_payment: "bg-amber-500/15 text-amber-300 ring-amber-400/30", new: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  in_progress: "bg-violet-500/15 text-violet-300 ring-violet-400/30", delivered: "bg-pink-500/15 text-pink-300 ring-pink-400/30",
  revision: "bg-orange-500/15 text-orange-300 ring-orange-400/30", completed: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 ring-zinc-400/20",
};
