// Telegram messages sent by the server: admin group order cards and client updates.
import { Api, InlineKeyboard, InputFile } from "grammy";
import fs from "node:fs";
import { config } from "../config.js";
import { db } from "../db.js";
import { adminCard, claudeBrief, esc, money, orderCode, STATUS_LABEL, type Lang, type OrderStatus } from "./format.js";
import { filesForOrder, signFile } from "./files.js";
import { mediaPath } from "./paths.js";

export const tgApi = config.BOT_TOKEN ? new Api(config.BOT_TOKEN) : null;
const adminChat = () => (tgApi && /^-?\d+$/.test(config.ADMIN_CHAT_ID) ? config.ADMIN_CHAT_ID : null);
const log = (where: string) => (e: unknown) => console.error(`[notify:${where}]`, (e as Error).message);

let botUsername = "";
export async function getBotUsername() {
  if (!botUsername && tgApi) botUsername = (await tgApi.getMe().catch(() => null))?.username ?? "";
  return botUsername;
}

const loadOrder = (id: number) => db.order.findUnique({ where: { id }, include: { template: true, user: true } });
type FullOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

const T = {
  uz: {
    received: (c: string) => `✅ Buyurtmangiz qabul qilindi: <b>${c}</b>\nJamoamiz videoni tayyorlashni boshlaydi. Tayyor bo‘lgach shu yerga yuboramiz.`,
    inProgress: (c: string) => `🎬 <b>${c}</b> — videongiz tayyorlanmoqda.`,
    ready: (c: string, left: number) => `📦 <b>${c}</b> — videongiz tayyor!\nTekshirib ko‘ring. Hammasi yaxshi bo‘lsa «Qabul qilaman» ni bosing${left > 0 ? `, o‘zgartirish kerak bo‘lsa «Tahrir so‘rash» (yana ${left} ta tahrir bepul).` : "."}`,
    accept: "✅ Qabul qilaman", revise: "✏️ Tahrir so‘rash", open: "📱 Buyurtmalarim",
    cancelled: (c: string, refund: boolean) => `❌ <b>${c}</b> bekor qilindi.${refund ? " 1 video balansingizga qaytarildi." : ""}`,
    paid: (n: number, amount: string) => `💳 To‘lov qabul qilindi: ${amount}.\nBalansingizga ${n} ta video qo‘shildi.`,
  },
  ru: {
    received: (c: string) => `✅ Заказ принят: <b>${c}</b>\nКоманда приступит к работе и пришлёт видео сюда.`,
    inProgress: (c: string) => `🎬 <b>${c}</b> — ваше видео в работе.`,
    ready: (c: string, left: number) => `📦 <b>${c}</b> — видео готово!\nПроверьте. Если всё хорошо — «Принимаю»${left > 0 ? `, если нужны изменения — «Запросить правки» (бесплатно ещё ${left}).` : "."}`,
    accept: "✅ Принимаю", revise: "✏️ Запросить правки", open: "📱 Мои заказы",
    cancelled: (c: string, refund: boolean) => `❌ <b>${c}</b> отменён.${refund ? " 1 видео возвращено на баланс." : ""}`,
    paid: (n: number, amount: string) => `💳 Оплата получена: ${amount}.\nНа баланс добавлено видео: ${n}.`,
  },
};
const tx = (l: string) => T[(l === "ru" ? "ru" : "uz") as Lang];
const appButton = (l: string) => (config.WEBAPP_URL.startsWith("https://") ? new InlineKeyboard().webApp(tx(l).open, config.WEBAPP_URL) : undefined);

function cardKeyboard(o: FullOrder) {
  const kb = new InlineKeyboard();
  if (o.status === "new" || o.status === "revision") kb.text("▶️ Ishga olish", `take:${o.id}`);
  if (!["completed", "cancelled", "awaiting_payment"].includes(o.status)) kb.text("🤖 Claude brifi", `brief:${o.id}`).row().text("📎 Materiallar", `files:${o.id}`).text("❌ Bekor qilish", `cancel:${o.id}`);
  return kb;
}
const cardFooter = (o: FullOrder) => ["completed", "cancelled"].includes(o.status) ? "" : "\n\n<i>Tayyor videoni shu xabarga javob (reply) qilib yuboring — mijozga avtomatik boradi.</i>";

/** New paid order -> admin group card + confirmation to the client. */
export async function newOrder(orderId: number) {
  const o = await loadOrder(orderId);
  if (!o || !tgApi) return;
  await tgApi.sendMessage(Number(o.user.telegramId), tx(o.user.language).received(orderCode(o.id)), { parse_mode: "HTML", reply_markup: appButton(o.user.language) }).catch(log("client"));
  const chat = adminChat();
  if (!chat) return;
  const m = await tgApi.sendMessage(chat, adminCard(o) + cardFooter(o), { parse_mode: "HTML", reply_markup: cardKeyboard(o), link_preview_options: { is_disabled: true } }).catch(log("admin"));
  if (m) await db.order.update({ where: { id: o.id }, data: { adminMessageId: m.message_id } });
}

/** Re-render the admin group card after a status change. */
export async function refreshCard(orderId: number) {
  const o = await loadOrder(orderId);
  const chat = adminChat();
  if (!o?.adminMessageId || !chat) return;
  await tgApi!.editMessageText(chat, o.adminMessageId, adminCard(o) + cardFooter(o), { parse_mode: "HTML", reply_markup: cardKeyboard(o), link_preview_options: { is_disabled: true } })
    .catch((e) => { if (!/not modified/.test((e as Error).message)) log("card")(e); });
}

export async function clientStatus(orderId: number, status: OrderStatus, opts: { refund?: boolean } = {}) {
  const o = await loadOrder(orderId);
  if (!o || !tgApi) return;
  const t = tx(o.user.language), c = orderCode(o.id);
  const text = status === "in_progress" ? t.inProgress(c) : status === "cancelled" ? t.cancelled(c, Boolean(opts.refund)) : null;
  if (text) await tgApi.sendMessage(Number(o.user.telegramId), text, { parse_mode: "HTML" }).catch(log("status"));
}

/** Send the finished video to the client with accept / revision buttons. */
export async function deliverToClient(orderId: number, fileId: string) {
  const [o, f] = await Promise.all([loadOrder(orderId), db.fileAsset.findUnique({ where: { id: fileId } })]);
  if (!o || !f || !tgApi) return false;
  const t = tx(o.user.language);
  const kb = new InlineKeyboard().text(t.accept, `acc:${o.id}`);
  if (o.revisionsLeft > 0) kb.text(t.revise, `rev:${o.id}`);
  const caption = t.ready(orderCode(o.id), o.revisionsLeft);
  const chatId = Number(o.user.telegramId);
  try {
    if (f.tgFileId) {
      if (f.mime.startsWith("video/")) await tgApi.sendVideo(chatId, f.tgFileId, { caption, parse_mode: "HTML", reply_markup: kb, supports_streaming: true });
      else await tgApi.sendDocument(chatId, f.tgFileId, { caption, parse_mode: "HTML", reply_markup: kb });
    } else if (f.path && fs.statSync(mediaPath(f.path)).size < 49 * 1024 * 1024) {
      const msg = await tgApi.sendVideo(chatId, new InputFile(mediaPath(f.path), `${orderCode(o.id)}.mp4`), { caption, parse_mode: "HTML", reply_markup: kb, supports_streaming: true });
      const id = msg.video?.file_id;
      if (id) await db.fileAsset.update({ where: { id: f.id }, data: { tgFileId: id } });
    } else {
      await tgApi.sendMessage(chatId, `${caption}\n\n⬇️ ${signFile(f.id)}`, { parse_mode: "HTML", reply_markup: kb });
    }
    return true;
  } catch (e) { log("deliver")(e); return false; }
}

export async function revisionRequested(orderId: number) {
  const o = await loadOrder(orderId);
  const chat = adminChat();
  if (!o || !chat) return;
  await tgApi!.sendMessage(chat, `✏️ <b>${orderCode(o.id)}</b> — mijoz tahrir so‘radi:\n${esc(o.revisionNote ?? "")}`, {
    parse_mode: "HTML", reply_parameters: o.adminMessageId ? { message_id: o.adminMessageId, allow_sending_without_reply: true } : undefined,
  }).catch(log("revision"));
  await refreshCard(orderId);
}

export async function orderAccepted(orderId: number) {
  const o = await loadOrder(orderId);
  const chat = adminChat();
  if (o && chat) await tgApi!.sendMessage(chat, `✅ <b>${orderCode(o.id)}</b> — mijoz videoni qabul qildi.`, { parse_mode: "HTML", reply_parameters: o.adminMessageId ? { message_id: o.adminMessageId, allow_sending_without_reply: true } : undefined }).catch(log("accepted"));
  await refreshCard(orderId);
}

export async function purchasePaid(purchaseId: number) {
  const p = await db.purchase.findUnique({ where: { id: purchaseId }, include: { user: true, package: true } });
  if (!p || !tgApi) return;
  await tgApi.sendMessage(Number(p.user.telegramId), tx(p.user.language).paid(p.videos, money(p.amount)), { reply_markup: appButton(p.user.language) }).catch(log("paid"));
  const chat = adminChat();
  if (chat) await tgApi.sendMessage(chat, `💰 To‘lov: ${money(p.amount)} (${p.provider}) — ${esc(p.user.name)}, paket «${esc(p.package.title)}» (${p.videos} video). Xarid #${p.id}`, { parse_mode: "HTML" }).catch(log("paid-admin"));
}

/** Client says they paid by card transfer: ask admins to confirm. */
export async function manualPaymentClaim(purchaseId: number) {
  const p = await db.purchase.findUnique({ where: { id: purchaseId }, include: { user: true, package: true } });
  const chat = adminChat();
  if (!p || !chat) return false;
  await tgApi!.sendMessage(chat, `💳 <b>Karta orqali to‘lov tasdig‘i kerak</b>\nXarid #${p.id}: ${money(p.amount)} — paket «${esc(p.package.title)}» (${p.videos} video)\nMijoz: ${esc(p.user.name)}${p.user.username ? ` @${esc(p.user.username)}` : ""} · ID ${p.user.telegramId}\n\nPul tushganini tekshirib, tasdiqlang.`, {
    parse_mode: "HTML", reply_markup: new InlineKeyboard().text("✅ To‘lov tushdi", `mpaid:${p.id}`).text("🚫 Rad etish", `mrej:${p.id}`),
  });
  return true;
}

/** Claude brief as a .md document (plus file links) into a chat. */
export async function sendBrief(chatId: number | string, orderId: number) {
  const o = await loadOrder(orderId);
  if (!o || !tgApi) return;
  const md = claudeBrief(o, await briefFiles(o.id, o.agency));
  await tgApi.sendDocument(chatId, new InputFile(Buffer.from(md, "utf8"), `${orderCode(o.id)}-brief.md`), {
    caption: `🤖 ${orderCode(o.id)} — Claude agent uchun brif. Faylni yangi chatga yuklang yoki matnini nusxa qiling.`,
  });
}

export async function briefFiles(orderId: number, agencyJson: string) {
  const files: { name: string; kind: string; url: string | null }[] = (await filesForOrder(orderId)).filter((f) => f.kind !== "result");
  const logoId = (JSON.parse(agencyJson) as { logoFileId?: string | null }).logoFileId;
  if (logoId) {
    const logo = await db.fileAsset.findUnique({ where: { id: logoId } });
    if (logo?.path) files.unshift({ name: logo.name, kind: "logo", url: signFile(logo.id) });
  }
  return files;
}

/** Client materials (and logo) into a chat as documents, so the team can download originals. */
export async function sendMaterials(chatId: number | string, orderId: number) {
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o || !tgApi) return 0;
  const ids = [(JSON.parse(o.agency) as { logoFileId?: string | null }).logoFileId, ...(await db.fileAsset.findMany({ where: { orderId, kind: "material" } })).map((f) => f.id)].filter(Boolean) as string[];
  let sent = 0;
  for (const id of ids) {
    const f = await db.fileAsset.findUnique({ where: { id } });
    if (!f?.path) continue;
    const big = f.size > 49 * 1024 * 1024;
    await (big
      ? tgApi.sendMessage(chatId, `${f.name}: ${signFile(f.id)}`)
      : tgApi.sendDocument(chatId, new InputFile(mediaPath(f.path), f.name), { caption: `${orderCode(orderId)} · ${f.kind === "logo" ? "logo" : "material"}` })
    ).then(() => sent++).catch(log("materials"));
  }
  return sent;
}

export const statusText = (s: OrderStatus, l: Lang = "uz") => STATUS_LABEL[l][s];
