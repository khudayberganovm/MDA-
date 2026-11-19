import { Bot, InlineKeyboard, type Context } from "grammy";
import { config, isAdmin } from "../config.js";
import { db } from "../db.js";
import { orderCode, STATUS_ICON, STATUS_LABEL, type Lang, type OrderStatus } from "../lib/format.js";
import * as orders from "../lib/orders.js";
import { sendBrief, sendMaterials } from "../lib/notify.js";
import { HttpError } from "../lib/files.js";
import { t } from "../lib/i18n.js";

const lang = (u: { language: string }): Lang => (u.language === "ru" ? "ru" : "uz");
const isAdminChat = (ctx: Context) => Boolean(config.ADMIN_CHAT_ID) && String(ctx.chat?.id) === config.ADMIN_CHAT_ID;
const staffName = (ctx: Context) => (ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name ?? "admin");
/** Team members: anyone in the admin group, or a listed admin. */
const isStaff = (ctx: Context) => isAdminChat(ctx) || (ctx.from ? isAdmin(ctx.from.id) : false);
const errText = (e: unknown) => (e instanceof HttpError ? e.message : "Xatolik yuz berdi");

async function userOf(ctx: Context) {
  if (!ctx.from || ctx.from.is_bot) return null;
  return orders.upsertUser(ctx.from); // identity from Telegram's update, authenticated by the bot token
}

function appKeyboard(L: Lang) {
  return config.WEBAPP_URL.startsWith("https://") ? new InlineKeyboard().webApp(t(L, "open"), config.WEBAPP_URL) : undefined;
}

export async function startBot() {
  if (!config.BOT_TOKEN) { console.warn("[bot] BOT_TOKEN missing - bot disabled"); return null; }
  const bot = new Bot(config.BOT_TOKEN);

  // ---------- helpers for any chat ----------
  bot.command("chatid", (ctx) => ctx.reply(`Chat ID: <code>${ctx.chat.id}</code>`, { parse_mode: "HTML" }));
  bot.command("myid", (ctx) => ctx.reply(`Sizning Telegram ID: <code>${ctx.from?.id}</code>`, { parse_mode: "HTML" }));

  // ---------- admin group ----------
  const orderFromCb = (ctx: Context & { match: RegExpMatchArray | string }) => Number((ctx.match as RegExpMatchArray)[1]);

  bot.callbackQuery(/^take:(\d+)$/, async (ctx) => {
    if (!isStaff(ctx)) return ctx.answerCallbackQuery({ text: "Faqat jamoa uchun" });
    try { await orders.takeOrder(orderFromCb(ctx), staffName(ctx)); await ctx.answerCallbackQuery({ text: "Ishga olindi" }); }
    catch (e) { await ctx.answerCallbackQuery({ text: errText(e), show_alert: true }); }
  });

  bot.callbackQuery(/^brief:(\d+)$/, async (ctx) => {
    if (!isStaff(ctx)) return ctx.answerCallbackQuery({ text: "Faqat jamoa uchun" });
    await ctx.answerCallbackQuery();
    await sendBrief(ctx.chat!.id, orderFromCb(ctx)).catch((e) => ctx.reply(`Brif yuborilmadi: ${(e as Error).message}`));
  });

  bot.callbackQuery(/^files:(\d+)$/, async (ctx) => {
    if (!isStaff(ctx)) return ctx.answerCallbackQuery({ text: "Faqat jamoa uchun" });
    await ctx.answerCallbackQuery({ text: "Yuborilmoqda…" });
    const n = await sendMaterials(ctx.chat!.id, orderFromCb(ctx));
    if (!n) await ctx.reply(`${orderCode(orderFromCb(ctx))}: mijoz material yuklamagan.`);
  });

  bot.callbackQuery(/^cancel:(\d+)$/, async (ctx) => {
    if (!isStaff(ctx)) return ctx.answerCallbackQuery({ text: "Faqat jamoa uchun" });
    const id = orderFromCb(ctx);
    await ctx.answerCallbackQuery();
    await ctx.reply(`${orderCode(id)} ni bekor qilasizmi? Mijozga 1 video balansga qaytariladi.`, {
      reply_markup: new InlineKeyboard().text("Ha, bekor qilish", `cancelok:${id}`).text("Yo‘q", "noop"),
    });
  });
  bot.callbackQuery(/^cancelok:(\d+)$/, async (ctx) => {
    if (!isStaff(ctx)) return ctx.answerCallbackQuery({ text: "Faqat jamoa uchun" });
    try { await orders.cancelOrder(orderFromCb(ctx), staffName(ctx)); await ctx.editMessageText(`❌ ${orderCode(orderFromCb(ctx))} bekor qilindi (${staffName(ctx)}).`); await ctx.answerCallbackQuery(); }
    catch (e) { await ctx.answerCallbackQuery({ text: errText(e), show_alert: true }); }
  });
  bot.callbackQuery("noop", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.deleteMessage().catch(() => {}); });

  bot.callbackQuery(/^mpaid:(\d+)$/, async (ctx) => {
    if (!isStaff(ctx)) return ctx.answerCallbackQuery({ text: "Faqat jamoa uchun" });
    const ok = await orders.markPurchasePaid(orderFromCb(ctx), "manual");
    await ctx.answerCallbackQuery({ text: ok ? "Tasdiqlandi" : "Allaqachon ko‘rib chiqilgan" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    if (ok) await ctx.reply(`✅ Xarid #${orderFromCb(ctx)} tasdiqlandi (${staffName(ctx)}).`);
  });
  bot.callbackQuery(/^mrej:(\d+)$/, async (ctx) => {
    if (!isStaff(ctx)) return ctx.answerCallbackQuery({ text: "Faqat jamoa uchun" });
    const p = await db.purchase.findUnique({ where: { id: orderFromCb(ctx) }, include: { user: true } });
    if (p?.status === "pending") {
      await db.purchase.update({ where: { id: p.id }, data: { status: "cancelled" } });
      await ctx.api.sendMessage(Number(p.user.telegramId), lang(p.user) === "ru" ? "❌ Оплата не найдена. Если вы оплатили, напишите в поддержку." : "❌ To‘lov topilmadi. Agar to‘lagan bo‘lsangiz, qo‘llab-quvvatlashga yozing.").catch(() => {});
    }
    await ctx.answerCallbackQuery({ text: "Rad etildi" });
    await ctx.editMessageReplyMarkup().catch(() => {});
  });

  /** Finished video: reply to the order card (or put MA-0012 in the caption). */
  bot.on(["message:video", "message:document", "message:animation"], async (ctx, next) => {
    if (!isAdminChat(ctx)) return next();
    const m = ctx.message;
    const media = m.video ?? m.animation ?? m.document;
    if (!media) return;
    let order = m.reply_to_message ? await db.order.findFirst({ where: { adminMessageId: m.reply_to_message.message_id } }) : null;
    const code = (m.caption ?? "").match(/MA-?(\d{1,7})/i);
    if (!order && code) order = await db.order.findUnique({ where: { id: Number(code[1]) } });
    if (!order) return; // a regular file in the group
    const mime = "mime_type" in media && media.mime_type ? media.mime_type : "video/mp4";
    if (m.document && !mime.startsWith("video/")) return ctx.reply("Video fayl yuboring (MP4).", { reply_parameters: { message_id: m.message_id } });
    try {
      const r = await orders.deliverOrder(order.id, { tgFileId: media.file_id, name: ("file_name" in media && media.file_name) || `${orderCode(order.id)}.mp4`, mime, size: media.file_size ?? 0 }, staffName(ctx));
      await ctx.reply(r.sentToClient ? `📤 ${orderCode(order.id)}: video mijozga yuborildi.` : `⚠️ ${orderCode(order.id)}: saqlandi, lekin mijozga yuborib bo‘lmadi (botni bloklagan bo‘lishi mumkin).`, { reply_parameters: { message_id: m.message_id } });
    } catch (e) { await ctx.reply(`⚠️ ${errText(e)}`, { reply_parameters: { message_id: m.message_id } }); }
  });

  // ---------- clients ----------
  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const u = await userOf(ctx); if (!u) return;
    await ctx.reply(t(lang(u), "welcome"), { reply_markup: appKeyboard(lang(u)) });
    await ctx.reply(t(lang(u), "chooseLang"), { reply_markup: new InlineKeyboard().text("🇺🇿 O‘zbekcha", "lang:uz").text("🇷🇺 Русский", "lang:ru") });
  });

  bot.callbackQuery(/^lang:(uz|ru)$/, async (ctx) => {
    const u = await userOf(ctx); if (!u) return;
    const L = ctx.match[1] as Lang;
    await db.user.update({ where: { id: u.id }, data: { language: L } });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(L, "langSaved")).catch(() => {});
    await ctx.reply(t(L, "help"), { reply_markup: appKeyboard(L) });
  });

  bot.command("help", async (ctx) => {
    const u = await userOf(ctx); if (!u) return;
    const support = config.SUPPORT_USERNAME.replace(/^@/, "");
    await ctx.reply(t(lang(u), "help") + (support ? `\n\n${t(lang(u), "support")}: @${support}` : ""), { reply_markup: appKeyboard(lang(u)) });
  });

  bot.command("orders", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const u = await userOf(ctx); if (!u) return;
    const L = lang(u);
    const list = await db.order.findMany({ where: { userId: u.id, status: { not: "awaiting_payment" } }, orderBy: { createdAt: "desc" }, take: 10, include: { template: true } });
    if (!list.length) return ctx.reply(t(L, "noOrders"), { reply_markup: appKeyboard(L) });
    const lines = list.map((o) => `${STATUS_ICON[o.status as OrderStatus] ?? "•"} ${orderCode(o.id)} — ${o.template.title}: ${STATUS_LABEL[L][o.status as OrderStatus] ?? o.status}`);
    await ctx.reply(`${t(L, "orders")}\n\n${lines.join("\n")}\n\n${t(L, "balance")}: ${u.credits}`, { reply_markup: appKeyboard(L) });
  });

  bot.callbackQuery(/^acc:(\d+)$/, async (ctx) => {
    const u = await userOf(ctx); if (!u) return;
    try {
      await orders.acceptOrder(u.id, orderFromCb(ctx));
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup().catch(() => {});
      await ctx.reply(t(lang(u), "thanks"), { reply_markup: appKeyboard(lang(u)) });
    } catch (e) { await ctx.answerCallbackQuery({ text: errText(e), show_alert: true }); }
  });

  bot.callbackQuery(/^rev:(\d+)$/, async (ctx) => {
    const u = await userOf(ctx); if (!u) return;
    const o = await db.order.findFirst({ where: { id: orderFromCb(ctx), userId: u.id, status: "delivered", revisionsLeft: { gt: 0 } } });
    await ctx.answerCallbackQuery();
    if (!o) return ctx.reply(t(lang(u), "noRevision"));
    await db.user.update({ where: { id: u.id }, data: { botState: `rev:${o.id}` } });
    await ctx.reply(t(lang(u), "askRevision").replace("{code}", orderCode(o.id)), { reply_markup: { force_reply: true } });
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.chat.type !== "private" || ctx.message.text.startsWith("/")) return;
    const u = await userOf(ctx); if (!u) return;
    const m = u.botState?.match(/^rev:(\d+)$/);
    if (!m) return ctx.reply(t(lang(u), "useApp"), { reply_markup: appKeyboard(lang(u)) });
    try {
      await orders.requestRevision(u.id, Number(m[1]), ctx.message.text);
      await db.user.update({ where: { id: u.id }, data: { botState: null } });
      await ctx.reply(t(lang(u), "revisionSent"));
    } catch (e) {
      await db.user.update({ where: { id: u.id }, data: { botState: null } });
      await ctx.reply(errText(e));
    }
  });

  bot.catch((e) => console.error("[bot]", e.message));
  await bot.api.setMyCommands([
    { command: "start", description: "Boshlash / Старт" },
    { command: "orders", description: "Buyurtmalarim / Мои заказы" },
    { command: "help", description: "Yordam / Помощь" },
  ], { scope: { type: "all_private_chats" } }).catch((e) => console.warn("[bot] setMyCommands:", e.message));
  if (config.WEBAPP_URL.startsWith("https://"))
    await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "MOTION AI", web_app: { url: config.WEBAPP_URL } } }).catch(() => {});
  void bot.start({ allowed_updates: ["message", "callback_query"], onStart: (i) => console.log(`[bot] @${i.username} polling`) });
  return bot;
}
