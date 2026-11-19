// Shared schemas, labels and text builders (Mini App API, bot messages, Claude brief).
import { z } from "zod";

export type Lang = "uz" | "ru";

export const INCLUDES = ["avia", "hotel", "transfer", "food", "visa", "excursions", "insurance", "guide"] as const;
export const INCLUDE_LABEL: Record<(typeof INCLUDES)[number], string> = {
  avia: "Aviachipta", hotel: "Mehmonxona", transfer: "Transfer", food: "Ovqatlanish",
  visa: "Viza", excursions: "Ekskursiyalar", insurance: "Sug‘urta", guide: "Gid",
};

const text = (max: number) => z.string().trim().max(max).optional().default("");
export const Brief = z.object({
  destination: z.string().trim().min(2, "Yo‘nalishni kiriting").max(120),
  dates: text(120),
  price: text(80),
  includes: z.array(z.enum(INCLUDES)).max(INCLUDES.length).optional().default([]),
  hotel: text(120),
  offer: text(200),
  phone: z.string().trim().min(5, "Telefon raqamini kiriting").max(40),
  language: z.enum(["uz", "ru"]).optional().default("uz"),
  voice: z.enum(["male", "female", "music"]).optional().default("male"),
  extra: text(1500),
});
export type Brief = z.infer<typeof Brief>;

/** Accepts "@name", "name", "instagram.com/name", full URLs; returns the bare handle. */
export function instagramHandle(v: string): string {
  const s = v.trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?instagram\.com\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
  if (!/^[A-Za-z0-9._]{1,30}$/.test(s)) throw new z.ZodError([{ code: "custom", path: ["instagram"], message: "Instagram sahifa nomi noto‘g‘ri", input: v }]);
  return s;
}

export const AgencyInput = z.object({
  name: z.string().trim().min(2, "Agentlik nomini kiriting").max(80),
  instagram: z.string().trim().min(1, "Instagram sahifani kiriting").max(120).transform(instagramHandle),
  phone: z.string().trim().regex(/^[+\d][\d\s()-]{4,30}$/, "Telefon raqami noto‘g‘ri"),
  telegram: z.string().trim().max(40).optional().default("").transform((v) => v.replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "")),
  city: text(60),
  logoFileId: z.string().regex(/^[a-z0-9]{20,40}$/).nullish(),
});
export type AgencyInput = z.infer<typeof AgencyInput>;
export interface AgencySnapshot { name: string; instagram: string; phone: string; telegram: string | null; city: string | null; logoFileId: string | null }

export const ORDER_STATUSES = ["awaiting_payment", "new", "in_progress", "delivered", "revision", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const STATUS_LABEL: Record<Lang, Record<OrderStatus, string>> = {
  uz: { awaiting_payment: "To‘lov kutilmoqda", new: "Qabul qilindi", in_progress: "Tayyorlanmoqda", delivered: "Tayyor — tekshiring", revision: "Tahrirda", completed: "Yakunlandi", cancelled: "Bekor qilindi" },
  ru: { awaiting_payment: "Ожидает оплаты", new: "Принят", in_progress: "В работе", delivered: "Готово — проверьте", revision: "На правках", completed: "Завершён", cancelled: "Отменён" },
};
export const STATUS_ICON: Record<OrderStatus, string> = { awaiting_payment: "💳", new: "🆕", in_progress: "🎬", delivered: "📦", revision: "✏️", completed: "✅", cancelled: "❌" };

export const orderCode = (id: number) => `MA-${String(id).padStart(4, "0")}`;
export const money = (n: number) => `${n.toLocaleString("ru-RU").replace(/ /g, " ")} so‘m`;
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const VOICE: Record<Brief["voice"], string> = { male: "Erkak ovozi", female: "Ayol ovozi", music: "Ovozsiz, faqat musiqa" };
const LANG_NAME: Record<Lang, string> = { uz: "O‘zbekcha", ru: "Ruscha" };

interface OrderLike {
  id: number; status: string; brief: string; agency: string; revisionsLeft: number; revisionNote: string | null; assignee: string | null; createdAt: Date;
  template: { title: string; category: string; durationSec: number; format: string; agentNotes?: string | null };
  user: { name: string; username: string | null; telegramId: bigint };
}
export const parseOrder = (o: { brief: string; agency: string }) => ({ brief: JSON.parse(o.brief) as Brief, agency: JSON.parse(o.agency) as AgencySnapshot });

/** Order card for the admin Telegram group (HTML). */
export function adminCard(o: OrderLike): string {
  const { brief: b, agency: a } = parseOrder(o);
  const line = (k: string, v?: string | null) => (v ? `\n<b>${k}:</b> ${esc(v)}` : "");
  const st = o.status as OrderStatus;
  return [
    `${STATUS_ICON[st] ?? "•"} <b>${orderCode(o.id)}</b> — ${esc(STATUS_LABEL.uz[st] ?? o.status)}${o.assignee ? ` (${esc(o.assignee)})` : ""}`,
    `🎞 <b>${esc(o.template.title)}</b> · ${esc(o.template.category)} · ${o.template.durationSec}s · ${esc(o.template.format)}`,
    `\n🏢 <b>${esc(a.name)}</b>` + line("Instagram", `instagram.com/${a.instagram}`) + line("Telefon", a.phone) + line("Telegram", a.telegram ? `@${a.telegram}` : "") + line("Shahar", a.city),
    `\n✈️ <b>Tur</b>` + line("Yo‘nalish", b.destination) + line("Sanalar", b.dates) + line("Narx", b.price) +
      line("Narxga kiradi", b.includes.map((i) => INCLUDE_LABEL[i]).join(", ")) + line("Mehmonxona", b.hotel) + line("Aksiya", b.offer) +
      line("Videodagi telefon", b.phone) + line("Til / ovoz", `${LANG_NAME[b.language]} · ${VOICE[b.voice]}`) + line("Izoh", b.extra),
    o.status === "revision" && o.revisionNote ? `\n✏️ <b>Tahrir so‘rovi:</b> ${esc(o.revisionNote)}` : "",
    `\n👤 ${esc(o.user.name)}${o.user.username ? ` @${esc(o.user.username)}` : ""} · ID ${o.user.telegramId} · tahrirlar qoldi: ${o.revisionsLeft}`,
  ].filter(Boolean).join("\n").slice(0, 4000);
}

/** Markdown brief to paste into a new Claude chat with the video agent. */
export function claudeBrief(o: OrderLike, files: { name: string; kind: string; url: string | null }[]): string {
  const { brief: b, agency: a } = parseOrder(o);
  const row = (k: string, v?: string | null) => (v ? `- **${k}:** ${v}\n` : "");
  const logo = files.find((f) => f.kind === "logo");
  const mats = files.filter((f) => f.kind === "material");
  return `# MOTION AI buyurtma ${orderCode(o.id)}

Turagentlik uchun reklama videosi tayyorla. Quyidagi ma’lumotlardan foydalan, faktlarni (narx, sana, telefon) o‘zgartirma.

## Shablon
${row("Shablon", `${o.template.title} (${o.template.category})`)}${row("Davomiylik", `${o.template.durationSec} soniya`)}${row("Format", o.template.format)}${o.template.agentNotes ? `\n${o.template.agentNotes.trim()}\n` : ""}
## Video tili va ovoz
${row("Til", LANG_NAME[b.language])}${row("Ovoz", VOICE[b.voice])}
## Turagentlik
${row("Nomi", a.name)}${row("Instagram", `https://instagram.com/${a.instagram}`)}${row("Telefon", a.phone)}${row("Telegram", a.telegram ? `@${a.telegram}` : "")}${row("Shahar", a.city)}${row("Logo", logo?.url ?? (a.logoFileId ? "fayl biriktirilgan" : "yo‘q — agentlik nomini matn bilan ko‘rsat"))}
## Tur ma’lumotlari
${row("Yo‘nalish", b.destination)}${row("Sanalar", b.dates)}${row("Narx", b.price)}${row("Narxga kiradi", b.includes.map((i) => INCLUDE_LABEL[i]).join(", "))}${row("Mehmonxona", b.hotel)}${row("Aksiya / taklif", b.offer)}${row("Videoda ko‘rsatiladigan telefon", b.phone)}
${b.extra ? `## Mijoz izohi\n${b.extra}\n\n` : ""}${mats.length ? `## Mijoz materiallari\n${mats.map((f) => `- ${f.name}${f.url ? `: ${f.url}` : ""}`).join("\n")}\n\n` : ""}${o.revisionNote && o.status === "revision" ? `## Tahrir so‘rovi (oldingi versiyaga)\n${o.revisionNote}\n\n` : ""}## Yakuniy talab
- Oxirida CTA: agentlik nomi, telefon va Instagram.
- Matn va subtitrlar ${LANG_NAME[b.language].toLowerCase()} tilida, imlo xatosiz.
`;
}
