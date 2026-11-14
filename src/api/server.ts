import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import fstatic from "@fastify/static";
import { ZodError } from "zod";
import { config, isProd, voiceId } from "../config.js";
import { db } from "../db.js";
import { validateInitData } from "../lib/telegramAuth.js";
import { createProject, LimitError, publicProject, signDownload, upsertUser, verifyDownload } from "../lib/projects.js";
import { ensureDir, mediaPath, safeId } from "../lib/paths.js";

async function auth(req: FastifyRequest) {
  const h = req.headers.authorization ?? "";
  if (h.startsWith("tma ")) {
    const u = validateInitData(h.slice(4), config.BOT_TOKEN);
    return u ? upsertUser(u) : null;
  }
  if (h.startsWith("dev ") && config.DEV_AUTH && !isProd) {
    const id = Number(h.slice(4));
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return upsertUser({ id, first_name: "Dev", last_name: `#${id}` });
  }
  return null;
}

export async function startApi() {
  const app = Fastify({ logger: { level: isProd ? "info" : "warn" }, bodyLimit: 64 * 1024 });
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 } });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: "validation", issues: err.issues.map((i) => i.path.join(".") + ": " + i.message) });
    if (err instanceof LimitError) return reply.code(429).send({ error: err.message });
    const code = (err as { statusCode?: number }).statusCode ?? 500;
    if (code >= 500) app.log.error(err);
    return reply.code(code).send({ error: code >= 500 ? "internal" : (err as Error).message });
  });

  app.decorateRequest("user", null);
  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/api/") || req.url === "/api/health") return;
    const user = await auth(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    (req as unknown as { user: typeof user }).user = user;
  });
  const me = (req: FastifyRequest) => (req as unknown as { user: Awaited<ReturnType<typeof upsertUser>> }).user;

  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/me", async (req) => {
    const u = me(req);
    return {
      user: { name: u.name, username: u.username, language: u.language, telegramId: String(u.telegramId), createdAt: u.createdAt },
      providers: config.providers, demoMode: config.DEMO_MODE,
      voices: { uz: { male: !!voiceId("uz", "male"), female: !!voiceId("uz", "female") }, ru: { male: !!voiceId("ru", "male"), female: !!voiceId("ru", "female") } },
    };
  });
  app.patch("/api/me", async (req) => {
    const lang = (req.body as { language?: string })?.language;
    if (lang !== "uz" && lang !== "ru") throw Object.assign(new Error("bad language"), { statusCode: 400 });
    await db.user.update({ where: { id: me(req).id }, data: { language: lang } });
    return { ok: true };
  });

  app.post("/api/uploads/logo", async (req) => {
    const file = await req.file();
    if (!file) throw Object.assign(new Error("no file"), { statusCode: 400 });
    const buf = await file.toBuffer();
    const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    if (!png && !jpg) throw Object.assign(new Error("Only PNG or JPEG"), { statusCode: 400 });
    const rel = path.join("uploads", String(me(req).id), `${crypto.randomUUID()}.${png ? "png" : "jpg"}`);
    ensureDir(path.dirname(mediaPath(rel)));
    fs.writeFileSync(mediaPath(rel), buf);
    return { logoPath: rel };
  });

  app.post("/api/projects", async (req, reply) => {
    const b = (req.body ?? {}) as { prompt?: string; options?: Record<string, unknown> };
    const u = me(req);
    const opts = { ...(b.options ?? {}) };
    // Only allow logos uploaded by this user.
    if (opts.logoPath !== undefined) {
      const lp = String(opts.logoPath);
      if (!new RegExp(`^uploads/${u.id}/[a-f0-9-]{36}\\.(png|jpg)$`).test(lp) || !fs.existsSync(mediaPath(lp))) delete opts.logoPath;
    }
    const p = await createProject(u.id, String(b.prompt ?? ""), opts);
    return reply.code(201).send(publicProject(p));
  });

  app.get("/api/projects", async (req) => {
    const list = await db.project.findMany({ where: { userId: me(req).id }, orderBy: { createdAt: "desc" }, take: 50, include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } } });
    return list.map((p) => publicProject(p, p.jobs[0]));
  });

  app.get("/api/projects/:id", async (req, reply) => {
    const id = safeId((req.params as { id: string }).id);
    const p = await db.project.findFirst({ where: { id, userId: me(req).id }, include: { jobs: { orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!p) return reply.code(404).send({ error: "not found" });
    return { ...publicProject(p, p.jobs[0]), storyboard: p.storyboard ? JSON.parse(p.storyboard) : null };
  });

  app.post("/api/projects/:id/download-link", async (req, reply) => {
    const id = safeId((req.params as { id: string }).id);
    const p = await db.project.findFirst({ where: { id, userId: me(req).id, status: "completed" } });
    if (!p?.outputPath) return reply.code(404).send({ error: "not found" });
    return { url: config.PUBLIC_URL.replace(/\/$/, "") + signDownload(id) };
  });

  app.get("/dl/:id", async (req, reply) => {
    const id = safeId((req.params as { id: string }).id);
    const q = req.query as { exp?: string; sig?: string };
    if (!verifyDownload(id, String(q.exp ?? ""), String(q.sig ?? ""))) return reply.code(403).send("Link expired");
    const p = await db.project.findUnique({ where: { id } });
    if (!p?.outputPath) return reply.code(404).send("Not found");
    const file = mediaPath(p.outputPath);
    reply.header("Content-Type", "video/mp4").header("Content-Disposition", `attachment; filename="motion-ai-${id}.mp4"`).header("Content-Length", fs.statSync(file).size);
    return reply.send(fs.createReadStream(file));
  });

  const web = path.join(config.rootDir, "webapp/dist");
  if (fs.existsSync(web)) {
    await app.register(fstatic, { root: web, prefix: "/" });
    app.setNotFoundHandler((req, reply) => (req.url.startsWith("/api/") ? reply.code(404).send({ error: "not found" }) : reply.sendFile("index.html")));
  }

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  console.log(`[api] listening on :${config.PORT}`);
  return app;
}
