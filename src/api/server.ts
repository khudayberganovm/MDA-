import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import fstatic from "@fastify/static";
import { z, ZodError } from "zod";
import { config, isAdmin, isProd } from "../config.js";
import { db } from "../db.js";
import { validateInitData } from "../lib/telegramAuth.js";
import { cleanName, filesForOrder, HttpError, signFile, sniff, verifyFile } from "../lib/files.js";
import { claudeBrief, orderCode, STATUS_LABEL, type OrderStatus } from "../lib/format.js";
import { ensureDir, mediaPath } from "../lib/paths.js";
import * as orders from "../lib/orders.js";
import { briefFiles, getBotUsername, manualPaymentClaim } from "../lib/notify.js";
import { handlePayme, paymeCheckoutUrl } from "../payments/payme.js";
import { clickCheckoutUrl, handleClick } from "../payments/click.js";

type User = Awaited<ReturnType<typeof orders.upsertUser>>;
const MB = 1024 * 1024;

async function auth(req: FastifyRequest) {
  const h = req.headers.authorization ?? "";
  if (h.startsWith("tma ")) {
    const u = validateInitData(h.slice(4), config.BOT_TOKEN);
    return u ? orders.upsertUser(u) : null;
  }
  if (h.startsWith("dev ") && config.DEV_AUTH && !isProd) {
    const id = Number(h.slice(4));
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return orders.upsertUser({ id, first_name: "Dev", last_name: `#${id}` });
  }
  return null;
}

const intParam = (req: FastifyRequest, key = "id") => {
  const n = Number((req.params as Record<string, string>)[key]);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, "bad id");
  return n;
};

/** Stream one multipart file to disk, then check its real type and size. */
async function saveUpload(req: FastifyRequest, dir: string, maxBytes: number, allow: ("image" | "video")[]) {
  const file = await req.file({ limits: { fileSize: maxBytes, files: 1 } });
  if (!file) throw new HttpError(400, "Fayl yuborilmadi");
  const tmp = mediaPath("tmp", crypto.randomUUID());
  ensureDir(path.dirname(tmp));
  try {
    await pipeline(file.file, fs.createWriteStream(tmp));
    if (file.file.truncated) throw new HttpError(413, `Fayl hajmi ${Math.round(maxBytes / MB)} MB dan oshmasin`);
    const head = Buffer.alloc(16);
    const fd = fs.openSync(tmp, "r"); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
    const type = sniff(head);
    if (!type || !allow.includes(type.kind)) throw new HttpError(400, allow.includes("video") && !allow.includes("image") ? "Faqat MP4/MOV video" : allow.includes("video") ? "Faqat rasm (JPG, PNG, WEBP, HEIC) yoki video (MP4, MOV)" : "Faqat rasm (JPG, PNG, WEBP)");
    const rel = path.join(dir, `${crypto.randomUUID()}.${type.ext}`);
    ensureDir(path.dirname(mediaPath(rel)));
    fs.renameSync(tmp, mediaPath(rel));
    return { path: rel, mime: type.mime, size: fs.statSync(mediaPath(rel)).size, name: cleanName(file.filename) };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const mediaUrl = (rel: string | null) => (rel ? `/m/${rel.split(path.sep).join("/")}` : null);

function templateView(t: { id: number; title: string; category: string; description: string; durationSec: number; format: string; previewPath: string | null; posterPath: string | null; active: boolean; sortOrder: number; agentNotes?: string | null }, admin = false) {
  return {
    id: t.id, title: t.title, category: t.category, description: t.description, durationSec: t.durationSec, format: t.format,
    previewUrl: mediaUrl(t.previewPath), posterUrl: mediaUrl(t.posterPath), active: t.active, sortOrder: t.sortOrder,
    ...(admin ? { agentNotes: t.agentNotes ?? "" } : {}),
  };
}

async function orderView(id: number, lang: string, admin = false) {
  const o = await db.order.findUnique({ where: { id }, include: { template: true, user: true, events: { orderBy: { createdAt: "asc" } } } });
  if (!o) return null;
  const files = await filesForOrder(o.id);
  const L = lang === "ru" ? "ru" : "uz";
  return {
    id: o.id, code: orderCode(o.id), status: o.status, statusLabel: STATUS_LABEL[L][o.status as OrderStatus] ?? o.status,
    template: templateView(o.template), brief: JSON.parse(o.brief), agency: JSON.parse(o.agency),
    revisionsLeft: o.revisionsLeft, revisionNote: o.revisionNote, assignee: o.assignee, createdAt: o.createdAt, updatedAt: o.updatedAt, deliveredAt: o.deliveredAt,
    events: o.events.map((e) => ({ type: e.type, note: e.note, by: admin ? e.by : e.by === "client" ? "client" : null, at: e.createdAt })),
    results: files.filter((f) => f.kind === "result"), materials: files.filter((f) => f.kind === "material"),
    ...(admin ? {
      user: { name: o.user.name, username: o.user.username, telegramId: String(o.user.telegramId), credits: o.user.credits },
      claudeBrief: claudeBrief(o, await briefFiles(o.id, o.agency)),
    } : {}),
  };
}

const TemplateInput = z.object({
  title: z.string().trim().min(2).max(80), category: z.string().trim().min(2).max(40), description: z.string().trim().max(400).default(""),
  durationSec: z.coerce.number().int().min(5).max(180).default(30), format: z.enum(["9:16", "1:1", "4:5", "16:9"]).default("9:16"),
  agentNotes: z.string().trim().max(3000).default(""), active: z.boolean().default(true), sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
const PackageInput = z.object({
  title: z.string().trim().min(1).max(40), videos: z.coerce.number().int().min(1).max(500), price: z.coerce.number().int().min(1000).max(1_000_000_000),
  oldPrice: z.coerce.number().int().min(0).max(1_000_000_000).nullish().transform((v) => v || null), badge: z.string().trim().max(24).nullish().transform((v) => v || null),
  active: z.boolean().default(true), sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function startApi() {
  const app = Fastify({ logger: { level: isProd ? "warn" : "warn" }, bodyLimit: 256 * 1024, trustProxy: true });
  await app.register(multipart, { limits: { fileSize: 60 * MB, files: 1, fields: 5 } });
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: err.issues.map((i) => i.message).join("; "), issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    const code = (err as { statusCode?: number }).statusCode ?? 500;
    if (code >= 500) app.log.error(err);
    return reply.code(code).send({ error: code >= 500 ? "internal" : (err as Error).message });
  });

  app.decorateRequest("user", null);
  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/api/") || req.url === "/api/health") return;
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    if (req.url.startsWith("/api/admin/") && !isAdmin(user.telegramId)) return reply.code(403).send({ error: "forbidden" });
    (req as unknown as { user: User }).user = user;
  });
  const me = (req: FastifyRequest) => (req as unknown as { user: User }).user;
  const adminName = (req: FastifyRequest) => { const u = me(req); return u.username ? `@${u.username}` : u.name; };

  // ---------- public ----------
  app.get("/api/health", async () => ({ ok: true }));

  app.get("/f/:id", async (req, reply) => {
    const id = String((req.params as { id: string }).id);
    const q = req.query as { exp?: string; sig?: string };
    if (!/^[a-z0-9]{20,40}$/.test(id) || !verifyFile(id, String(q.exp ?? ""), String(q.sig ?? ""))) return reply.code(403).send("Link expired");
    const f = await db.fileAsset.findUnique({ where: { id } });
    if (!f?.path || !fs.existsSync(mediaPath(f.path))) return reply.code(404).send("Not found");
    reply.header("Content-Type", f.mime).header("Content-Length", fs.statSync(mediaPath(f.path)).size)
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    return reply.send(fs.createReadStream(mediaPath(f.path)));
  });

  // Payment provider callbacks (authenticated by the providers' own signatures).
  app.post("/pay/payme", async (req) => handlePayme(req.body, req.headers.authorization));
  app.post("/pay/click/prepare", async (req) => handleClick("prepare", (req.body ?? {}) as Record<string, string>));
  app.post("/pay/click/complete", async (req) => handleClick("complete", (req.body ?? {}) as Record<string, string>));

  // ---------- client ----------
  app.get("/api/me", async (req) => {
    const u = me(req);
    const agency = await db.agency.findUnique({ where: { userId: u.id } });
    const logo = agency?.logoFileId ? await db.fileAsset.findUnique({ where: { id: agency.logoFileId } }) : null;
    return {
      user: { name: u.name, username: u.username, language: u.language, telegramId: String(u.telegramId), credits: u.credits, createdAt: u.createdAt },
      agency: agency ? { name: agency.name, instagram: agency.instagram, phone: agency.phone, telegram: agency.telegram ?? "", city: agency.city ?? "", logoFileId: agency.logoFileId, logoUrl: logo?.path ? signFile(logo.id, 3600) : null } : null,
      isAdmin: isAdmin(u.telegramId),
      payments: { payme: config.payments.payme, click: config.payments.click, manual: config.payments.manual, dev: config.payments.dev },
      manualPayInfo: config.payments.manual ? config.MANUAL_PAY_INFO : null,
      support: config.SUPPORT_USERNAME.replace(/^@/, "") || null,
      revisionsPerOrder: config.REVISIONS_PER_ORDER,
    };
  });

  app.patch("/api/me", async (req) => {
    const lang = (req.body as { language?: string })?.language;
    if (lang !== "uz" && lang !== "ru") throw new HttpError(400, "bad language");
    await db.user.update({ where: { id: me(req).id }, data: { language: lang } });
    return { ok: true };
  });

  app.put("/api/agency", async (req) => {
    const a = await orders.saveAgency(me(req).id, req.body);
    return { ok: true, agency: a };
  });

  app.post("/api/uploads/:kind", async (req) => {
    const kind = (req.params as { kind: string }).kind;
    if (kind !== "logo" && kind !== "material") throw new HttpError(400, "bad kind");
    const u = me(req);
    const recent = await db.fileAsset.count({ where: { userId: u.id, createdAt: { gte: new Date(Date.now() - 86400_000) } } });
    if (recent >= 100) throw new HttpError(429, "Bugun juda ko‘p fayl yuklandi");
    const saved = kind === "logo"
      ? await saveUpload(req, `uploads/${u.id}`, 5 * MB, ["image"])
      : await saveUpload(req, `uploads/${u.id}`, 50 * MB, ["image", "video"]);
    const f = await db.fileAsset.create({ data: { userId: u.id, kind, ...saved } });
    return { id: f.id, name: f.name, mime: f.mime, size: f.size, url: signFile(f.id, 3600) };
  });

  app.get("/api/catalog", async () => {
    const [templates, packages] = await Promise.all([
      db.template.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      db.package.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { videos: "asc" }] }),
    ]);
    return { templates: templates.map((t) => templateView(t)), packages: packages.map(({ id, title, videos, price, oldPrice, badge }) => ({ id, title, videos, price, oldPrice, badge })) };
  });

  app.post("/api/orders", async (req, reply) => {
    const o = await orders.placeOrder(me(req).id, (req.body ?? {}) as Record<string, unknown>);
    return reply.code(201).send(await orderView(o.id, me(req).language));
  });

  app.get("/api/orders", async (req) => {
    const list = await db.order.findMany({ where: { userId: me(req).id }, orderBy: { createdAt: "desc" }, take: 100, include: { template: true } });
    const L = me(req).language === "ru" ? "ru" : "uz";
    return list.map((o) => ({
      id: o.id, code: orderCode(o.id), status: o.status, statusLabel: STATUS_LABEL[L][o.status as OrderStatus] ?? o.status,
      template: { title: o.template.title, posterUrl: mediaUrl(o.template.posterPath) }, destination: (JSON.parse(o.brief) as { destination: string }).destination, createdAt: o.createdAt,
    }));
  });

  const ownOrder = async (req: FastifyRequest, reply: FastifyReply) => {
    const id = intParam(req);
    if (!(await db.order.findFirst({ where: { id, userId: me(req).id }, select: { id: true } }))) { reply.code(404).send({ error: "not found" }); return null; }
    return id;
  };

  app.get("/api/orders/:id", async (req, reply) => {
    const id = await ownOrder(req, reply); if (!id) return;
    return orderView(id, me(req).language);
  });
  app.post("/api/orders/:id/accept", async (req, reply) => {
    const id = await ownOrder(req, reply); if (!id) return;
    await orders.acceptOrder(me(req).id, id);
    return orderView(id, me(req).language);
  });
  app.post("/api/orders/:id/revision", async (req, reply) => {
    const id = await ownOrder(req, reply); if (!id) return;
    await orders.requestRevision(me(req).id, id, String((req.body as { note?: string })?.note ?? ""));
    return orderView(id, me(req).language);
  });
  app.post("/api/orders/:id/cancel", async (req, reply) => {
    const id = await ownOrder(req, reply); if (!id) return;
    await orders.cancelOrder(id, "client", { userId: me(req).id });
    return orderView(id, me(req).language);
  });
  app.post("/api/orders/:id/submit", async (req, reply) => {
    const id = await ownOrder(req, reply); if (!id) return;
    if (!(await orders.submitWithCredit(me(req).id, id))) throw new HttpError(409, "Balansda video yo‘q");
    return orderView(id, me(req).language);
  });
  app.post("/api/orders/:id/send-to-chat", async (req, reply) => {
    const id = await ownOrder(req, reply); if (!id) return;
    const { deliverToClient } = await import("../lib/notify.js");
    const r = await db.fileAsset.findFirst({ where: { orderId: id, kind: "result" }, orderBy: { createdAt: "desc" } });
    if (!r || !(await deliverToClient(id, r.id))) throw new HttpError(409, "Yuborib bo‘lmadi");
    return { ok: true };
  });

  app.post("/api/purchases", async (req) => {
    const b = (req.body ?? {}) as { packageId?: number; provider?: string; orderId?: number | null };
    const provider = String(b.provider ?? "");
    if (!["payme", "click", "manual", "dev"].includes(provider) || !config.payments[provider as keyof typeof config.payments]) throw new HttpError(400, "Bu to‘lov usuli mavjud emas");
    const u = me(req);
    const p = await orders.createPurchase(u.id, Number(b.packageId), provider, b.orderId ? Number(b.orderId) : null);
    const bot = await getBotUsername();
    const back = bot ? `https://t.me/${bot}` : config.publicUrl;
    const payUrl = provider === "payme" ? paymeCheckoutUrl(p.id, p.amount, back, u.language) : provider === "click" ? clickCheckoutUrl(p.id, p.amount, back) : null;
    return { id: p.id, amount: p.amount, videos: p.videos, provider, status: p.status, payUrl, manualPayInfo: provider === "manual" ? config.MANUAL_PAY_INFO : null };
  });

  app.get("/api/purchases", async (req) => {
    const list = await db.purchase.findMany({ where: { userId: me(req).id, status: { not: "cancelled" } }, orderBy: { createdAt: "desc" }, take: 50, include: { package: true } });
    return list.filter((p) => p.status === "paid").map((p) => ({ id: p.id, title: p.package.title, videos: p.videos, amount: p.amount, provider: p.provider, paidAt: p.paidAt }));
  });

  app.get("/api/purchases/:id", async (req, reply) => {
    const p = await db.purchase.findFirst({ where: { id: intParam(req), userId: me(req).id } });
    if (!p) return reply.code(404).send({ error: "not found" });
    const u = await db.user.findUniqueOrThrow({ where: { id: me(req).id } });
    const order = p.orderId ? await db.order.findUnique({ where: { id: p.orderId }, select: { id: true, status: true } }) : null;
    return { id: p.id, status: p.status, amount: p.amount, videos: p.videos, provider: p.provider, credits: u.credits, order };
  });

  app.post("/api/purchases/:id/claim", async (req, reply) => {
    const p = await db.purchase.findFirst({ where: { id: intParam(req), userId: me(req).id, provider: "manual", status: "pending" } });
    if (!p) return reply.code(404).send({ error: "not found" });
    if (!(await manualPaymentClaim(p.id))) throw new HttpError(503, "Admin guruhi sozlanmagan");
    return { ok: true };
  });

  // Local testing only: simulate a successful payment.
  if (config.payments.dev) {
    app.post("/api/purchases/:id/dev-pay", async (req, reply) => {
      const p = await db.purchase.findFirst({ where: { id: intParam(req), userId: me(req).id } });
      if (!p) return reply.code(404).send({ error: "not found" });
      await orders.markPurchasePaid(p.id, "dev");
      return { ok: true };
    });
  }

  // ---------- admin ----------
  app.get("/api/admin/stats", async () => {
    const day = new Date(Date.now() - 86400_000), month = new Date(Date.now() - 30 * 86400_000);
    const [byStatus, users, credits, rev1, rev30, pendingManual] = await Promise.all([
      db.order.groupBy({ by: ["status"], _count: true }),
      db.user.count(), db.user.aggregate({ _sum: { credits: true } }),
      db.purchase.aggregate({ where: { status: "paid", paidAt: { gte: day } }, _sum: { amount: true }, _count: true }),
      db.purchase.aggregate({ where: { status: "paid", paidAt: { gte: month } }, _sum: { amount: true }, _count: true }),
      db.purchase.count({ where: { status: "pending", provider: "manual" } }),
    ]);
    return {
      orders: Object.fromEntries(byStatus.map((s) => [s.status, s._count])), users, creditsOutstanding: credits._sum.credits ?? 0,
      revenue: { day: rev1._sum.amount ?? 0, dayCount: rev1._count, month: rev30._sum.amount ?? 0, monthCount: rev30._count }, pendingManual,
      payments: config.payments, adminChat: Boolean(config.ADMIN_CHAT_ID),
    };
  });

  app.get("/api/admin/orders", async (req) => {
    const status = String((req.query as { status?: string }).status ?? "");
    const where = status === "active" ? { status: { in: ["new", "in_progress", "revision", "delivered"] } } : status ? { status } : { status: { not: "awaiting_payment" } };
    const list = await db.order.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { template: true, user: true } });
    return list.map((o) => ({
      id: o.id, code: orderCode(o.id), status: o.status, statusLabel: STATUS_LABEL.uz[o.status as OrderStatus] ?? o.status, template: o.template.title,
      agency: (JSON.parse(o.agency) as { name: string }).name, destination: (JSON.parse(o.brief) as { destination: string }).destination,
      assignee: o.assignee, createdAt: o.createdAt, user: o.user.name,
    }));
  });

  app.get("/api/admin/orders/:id", async (req, reply) => (await orderView(intParam(req), "uz", true)) ?? reply.code(404).send({ error: "not found" }));

  app.post("/api/admin/orders/:id/action", async (req) => {
    const id = intParam(req);
    const { action, note } = (req.body ?? {}) as { action?: string; note?: string };
    if (action === "take") await orders.takeOrder(id, adminName(req));
    else if (action === "cancel") await orders.cancelOrder(id, adminName(req), { reason: note });
    else if (action === "complete") await orders.completeByAdmin(id, adminName(req));
    else throw new HttpError(400, "bad action");
    return orderView(id, "uz", true);
  });

  app.post("/api/admin/orders/:id/result", async (req) => {
    const id = intParam(req);
    if (!(await db.order.findUnique({ where: { id } }))) throw new HttpError(404, "not found");
    const saved = await saveUpload(req, `results/${id}`, 50 * MB, ["video"]);
    const r = await orders.deliverOrder(id, saved, adminName(req));
    return { ...(await orderView(id, "uz", true)), sentToClient: r.sentToClient };
  });

  app.get("/api/admin/templates", async () => (await db.template.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] })).map((t) => templateView(t, true)));
  app.post("/api/admin/templates", async (req) => templateView(await db.template.create({ data: TemplateInput.parse(req.body) }), true));
  app.put("/api/admin/templates/:id", async (req) => templateView(await db.template.update({ where: { id: intParam(req) }, data: TemplateInput.parse(req.body) }), true));
  app.post("/api/admin/templates/:id/:media", async (req) => {
    const id = intParam(req);
    const media = (req.params as { media: string }).media;
    if (media !== "preview" && media !== "poster") throw new HttpError(400, "bad media");
    const t = await db.template.findUnique({ where: { id } });
    if (!t) throw new HttpError(404, "not found");
    const saved = media === "preview" ? await saveUpload(req, "templates", 60 * MB, ["video"]) : await saveUpload(req, "templates", 5 * MB, ["image"]);
    const old = media === "preview" ? t.previewPath : t.posterPath;
    const updated = await db.template.update({ where: { id }, data: media === "preview" ? { previewPath: saved.path } : { posterPath: saved.path } });
    if (old) fs.rmSync(mediaPath(old), { force: true });
    return templateView(updated, true);
  });

  app.get("/api/admin/packages", async () => db.package.findMany({ orderBy: [{ sortOrder: "asc" }, { videos: "asc" }] }));
  app.post("/api/admin/packages", async (req) => db.package.create({ data: PackageInput.parse(req.body) }));
  app.put("/api/admin/packages/:id", async (req) => db.package.update({ where: { id: intParam(req) }, data: PackageInput.parse(req.body) }));

  app.get("/api/admin/purchases", async (req) => {
    const status = String((req.query as { status?: string }).status ?? "pending");
    const list = await db.purchase.findMany({ where: { status, ...(status === "pending" ? { provider: "manual" } : {}) }, orderBy: { createdAt: "desc" }, take: 100, include: { user: true, package: true } });
    return list.map((p) => ({ id: p.id, status: p.status, provider: p.provider, amount: p.amount, videos: p.videos, package: p.package.title, user: p.user.name, username: p.user.username, createdAt: p.createdAt, paidAt: p.paidAt }));
  });
  app.post("/api/admin/purchases/:id/mark-paid", async (req) => {
    const id = intParam(req);
    const p = await db.purchase.findUnique({ where: { id } });
    if (!p || p.status !== "pending") throw new HttpError(409, "Xarid kutilayotgan holatda emas");
    await orders.markPurchasePaid(id, p.provider === "manual" ? "manual" : p.provider);
    return { ok: true };
  });

  app.post("/api/admin/credits", async (req) => {
    const b = z.object({ telegramId: z.string().regex(/^\d{3,20}$/), delta: z.coerce.number().int().min(-1000).max(1000).refine((v) => v !== 0) }).parse(req.body);
    const u = await db.user.findUnique({ where: { telegramId: BigInt(b.telegramId) } });
    if (!u) throw new HttpError(404, "Foydalanuvchi topilmadi (avval botga /start bosishi kerak)");
    if (u.credits + b.delta < 0) throw new HttpError(400, "Balans manfiy bo‘lib qoladi");
    const r = await db.user.update({ where: { id: u.id }, data: { credits: { increment: b.delta } } });
    return { name: r.name, credits: r.credits };
  });

  // ---------- static ----------
  ensureDir(mediaPath("templates"));
  await app.register(fstatic, { root: mediaPath("templates"), prefix: "/m/templates/", decorateReply: false, maxAge: "1d" });
  const web = path.join(config.rootDir, "webapp/dist");
  if (fs.existsSync(web)) {
    await app.register(fstatic, { root: web, prefix: "/" });
    app.setNotFoundHandler((req, reply) => (req.url.startsWith("/api/") || req.url.startsWith("/m/") || req.url.startsWith("/pay/") || /\.[a-z0-9]+$/i.test(req.url.split("?")[0]) ? reply.code(404).send({ error: "not found" }) : reply.sendFile("index.html")));
  }

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  console.log(`[api] listening on :${config.PORT}`);
  return app;
}
