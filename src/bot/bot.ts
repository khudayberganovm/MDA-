import { Bot, InlineKeyboard, InputFile, type Context } from "grammy";
import { config } from "../config.js";
import { db } from "../db.js";
import { t, STATUS_LABEL, type Lang } from "../lib/i18n.js";
import { createProject, LimitError, upsertUser } from "../lib/projects.js";
import { mediaPath } from "../lib/paths.js";

const awaitingPrompt = new Set<number>(); // telegram ids in /new flow (in-memory; MVP)

async function userOf(ctx: Context) {
  if (!ctx.from || ctx.from.is_bot) return null;
  return upsertUser(ctx.from); // identity comes from Telegram's update, which is authenticated by the bot token
}

function appKeyboard(L: Lang) {
  return config.WEBAPP_URL.startsWith("https://") ? new InlineKeyboard().webApp(t(L, "open"), config.WEBAPP_URL) : undefined;
}

export async function startBot() {
  if (!config.BOT_TOKEN) { console.warn("[bot] BOT_TOKEN missing - bot disabled"); return null; }
  const bot = new Bot(config.BOT_TOKEN);

  bot.command("start", async (ctx) => {
    const u = await userOf(ctx); if (!u) return;
    await ctx.reply(t(u.language as Lang, "welcome") + "\n\n" + t(u.language as Lang, "chooseLang"), {
      reply_markup: new InlineKeyboard().text("🇺🇿 O‘zbekcha", "lang:uz").text("🇷🇺 Русский", "lang:ru"),
    });
  });

  bot.callbackQuery(/^lang:(uz|ru)$/, async (ctx) => {
    const u = await userOf(ctx); if (!u) return;
    const L = ctx.match[1] as Lang;
    await db.user.update({ where: { id: u.id }, data: { language: L } });
    await ctx.answerCallbackQuery();
    await ctx.reply(`${t(L, "langSaved")}\n\n${t(L, "help")}`, { reply_markup: appKeyboard(L) });
  });

  bot.command("help", async (ctx) => {
    const u = await userOf(ctx); if (!u) return;
    await ctx.reply(t(u.language as Lang, "help"), { reply_markup: appKeyboard(u.language as Lang) });
  });

  bot.command("new", async (ctx) => {
    const u = await userOf(ctx); if (!u) return;
    awaitingPrompt.add(ctx.from!.id);
    await ctx.reply(t(u.language as Lang, "newPrompt"), { reply_markup: appKeyboard(u.language as Lang) });
  });

  bot.command("projects", async (ctx) => {
    const u = await userOf(ctx); if (!u) return;
    const L = u.language as Lang;
    const list = await db.project.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 5 });
    if (!list.length) return ctx.reply(t(L, "noProjects"));
    const kb = new InlineKeyboard();
    const lines = list.map((p, i) => {
      if (p.status === "completed") kb.text(`${t(L, "download")} #${i + 1}`, `dl:${p.id}`).row();
      return `${i + 1}. ${STATUS_LABEL[L][p.status] ?? p.status} — ${p.prompt.slice(0, 50)}${p.prompt.length > 50 ? "…" : ""}`;
    });
    await ctx.reply(`${t(L, "projects")}\n\n${lines.join("\n")}`, { reply_markup: kb });
  });

  bot.callbackQuery(/^dl:([a-z0-9]{10,40})$/, async (ctx) => {
    const u = await userOf(ctx); if (!u) return;
    await ctx.answerCallbackQuery();
    const p = await db.project.findFirst({ where: { id: ctx.match[1], userId: u.id, status: "completed" } });
    if (!p?.outputPath) return;
    await ctx.replyWithVideo(new InputFile(mediaPath(p.outputPath), "motion-ai.mp4"), { width: 1080, height: 1920, supports_streaming: true });
  });

  bot.on("message:text", async (ctx) => {
    if (!awaitingPrompt.has(ctx.from.id) || ctx.message.text.startsWith("/")) return;
    const u = await userOf(ctx); if (!u) return;
    const L = u.language as Lang;
    if (ctx.message.text.trim().length < 10) return ctx.reply(t(L, "tooShort"));
    awaitingPrompt.delete(ctx.from.id);
    try {
      await createProject(u.id, ctx.message.text, { duration: 30, language: L, voice: "male", style: "professional" });
      await ctx.reply(t(L, "queued"));
    } catch (e) {
      await ctx.reply(e instanceof LimitError ? t(L, "limit") : t(L, "videoFailed"));
    }
  });

  bot.catch((e) => console.error("[bot]", e.message));
  await bot.api.setMyCommands([
    { command: "new", description: "Yangi video / Новое видео" },
    { command: "projects", description: "Videolarim / Мои видео" },
    { command: "help", description: "Yordam / Помощь" },
    { command: "start", description: "Boshlash / Старт" },
  ]).catch((e) => console.warn("[bot] setMyCommands:", e.message));
  if (config.WEBAPP_URL.startsWith("https://"))
    await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "MOTION AI", web_app: { url: config.WEBAPP_URL } } }).catch(() => {});
  void bot.start({ onStart: (i) => console.log(`[bot] @${i.username} polling`) });
  return bot;
}
