// End-to-end check of the ordering service (no Telegram needed).
// Usage: npm run test:e2e   (uses a throwaway SQLite DB and media dir)
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const tmp = fs.mkdtempSync("/tmp/motion-e2e-");
Object.assign(process.env, {
  NODE_ENV: "development", DEV_AUTH: "true", PORT: "18080", PUBLIC_URL: "http://127.0.0.1:18080",
  DATABASE_URL: `file:${tmp}/e2e.db`, MEDIA_DIR: `${tmp}/media`, APP_SECRET: "e2e-secret-0123456789abcdef",
  ADMIN_IDS: "900001", BOT_TOKEN: "", ADMIN_CHAT_ID: "",
  PAYME_MERCHANT_ID: "test-merchant", PAYME_KEY: "payme-test-key", CLICK_SERVICE_ID: "111", CLICK_MERCHANT_ID: "222", CLICK_SECRET_KEY: "click-secret",
  MANUAL_PAY_INFO: "Karta: 8600 0000 0000 0000",
});
execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: process.env });

const { seedCatalog } = await import("../src/lib/seed.js");
const { startApi } = await import("../src/api/server.js");
const { db } = await import("../src/db.js");
await seedCatalog();
const app = await startApi();
const base = "http://127.0.0.1:18080";

let passed = 0;
function ok(cond: unknown, msg: string) { if (!cond) throw new Error("FAIL: " + msg); passed++; console.log("✔", msg); }
const as = (id: number) => ({ Authorization: `dev ${id}` });
async function call(user: number | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...(user ? as(user) : {}), ...headers };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (typeof body === "string") payload = body;
  else if (body !== undefined) { payload = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const r = await fetch(base + path, { method, headers: h, body: payload });
  const text = await r.text();
  let json: any; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
const upload = (user: number, path: string, bytes: Buffer, name: string) => { const fd = new FormData(); fd.append("file", new Blob([new Uint8Array(bytes)]), name); return call(user, "POST", path, fd); };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(200)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(500)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), crypto.randomBytes(2000)]);
const CLIENT = 900002, OTHER = 900003, ADMIN = 900001;
const payme = (method: string, params: unknown, key = "payme-test-key") =>
  call(null, "POST", "/pay/payme", { jsonrpc: "2.0", id: 1, method, params }, { Authorization: "Basic " + Buffer.from(`Paycom:${key}`).toString("base64") });

try {
  // --- client profile ---
  let r = await call(CLIENT, "GET", "/api/me");
  ok(r.status === 200 && r.json.user.credits === 0 && r.json.isAdmin === false && r.json.agency === null, "client /api/me: 0 credits, no agency, not admin");
  ok(r.json.payments.payme && r.json.payments.click && r.json.payments.manual, "payment methods reported");
  ok((await call(null, "GET", "/api/me")).status === 401, "no auth -> 401");

  r = await upload(CLIENT, "/api/uploads/logo", PNG, "logo.png");
  ok(r.status === 200 && r.json.id, "logo upload (PNG)");
  const logoId = r.json.id;
  ok((await upload(CLIENT, "/api/uploads/logo", Buffer.from("hello world, not an image"), "x.png")).status === 400, "fake image rejected");
  ok((await upload(CLIENT, "/api/uploads/logo", MP4, "v.mp4")).status === 400, "video as logo rejected");

  r = await call(CLIENT, "PUT", "/api/agency", { name: "Sayohat Tour", instagram: "https://www.instagram.com/sayohat.tour/?hl=ru", phone: "+998 90 123 45 67", telegram: "@sayohat_admin", city: "Toshkent", logoFileId: logoId });
  ok(r.status === 200 && r.json.agency.instagram === "sayohat.tour" && r.json.agency.telegram === "sayohat_admin", "agency saved, instagram URL normalized");
  ok((await call(CLIENT, "PUT", "/api/agency", { name: "X", instagram: "bad handle!!", phone: "abc" })).status === 400, "invalid agency rejected");

  const cat = (await call(CLIENT, "GET", "/api/catalog")).json;
  ok(cat.templates.length === 6 && cat.packages.length === 3, "catalog: 6 templates, 3 packages");
  const tpl = cat.templates[1], pkg5 = cat.packages.find((p: any) => p.videos === 5), pkg1 = cat.packages.find((p: any) => p.videos === 1);

  r = await upload(CLIENT, "/api/uploads/material", JPG, "hotel.jpg");
  ok(r.status === 200, "material photo upload");
  const matId = r.json.id;
  const mat2 = (await upload(CLIENT, "/api/uploads/material", MP4, "beach.mp4")).json.id;

  // --- order without credits -> awaiting payment ---
  const brief = { destination: "Turkiya, Antalya", dates: "10–17 iyun", price: "650$ dan", includes: ["avia", "hotel", "transfer", "food"], hotel: "Rixos 5*", offer: "Erta bron -10%", phone: "+998 90 123 45 67", language: "uz", voice: "female", extra: "Oilaviy dam olishni ta’kidlang" };
  ok((await call(CLIENT, "POST", "/api/orders", { templateId: tpl.id, brief: { ...brief, destination: "" }, fileIds: [] })).status === 400, "order without destination rejected");
  r = await call(CLIENT, "POST", "/api/orders", { templateId: tpl.id, brief, fileIds: [matId, mat2] });
  ok(r.status === 201 && r.json.status === "awaiting_payment" && r.json.materials.length === 2, "order created, awaiting payment, 2 materials attached");
  const order1 = r.json.id;
  ok((await call(OTHER, "GET", `/api/orders/${order1}`)).status === 404, "other user cannot see the order");
  ok((await call(OTHER, "POST", "/api/orders", { templateId: tpl.id, brief, fileIds: [] })).status === 400, "order without agency profile rejected");

  // --- Payme ---
  r = await call(CLIENT, "POST", "/api/purchases", { packageId: pkg5.id, provider: "payme", orderId: order1 });
  ok(r.status === 200 && r.json.payUrl.startsWith("https://checkout.paycom.uz/"), "payme purchase + checkout URL");
  const pur1 = r.json.id;
  ok(Buffer.from(r.json.payUrl.split("/").pop(), "base64").toString().includes(`ac.order_id=${pur1};a=${pkg5.price * 100}`), "checkout URL encodes order id and amount in tiyin");
  ok((await payme("CheckPerformTransaction", { amount: 1, account: { order_id: pur1 } }, "wrong")).json.error.code === -32504, "payme bad auth -> -32504");
  ok((await payme("CheckPerformTransaction", { amount: 100, account: { order_id: pur1 } })).json.error.code === -31001, "payme wrong amount -> -31001");
  ok((await payme("CheckPerformTransaction", { amount: pkg5.price * 100, account: { order_id: 999999 } })).json.error.code === -31050, "payme unknown order -> -31050");
  ok((await payme("CheckPerformTransaction", { amount: pkg5.price * 100, account: { order_id: pur1 } })).json.result.allow === true, "payme CheckPerform ok");
  r = await payme("CreateTransaction", { id: "pm-tx-1", time: Date.now(), amount: pkg5.price * 100, account: { order_id: pur1 } });
  ok(r.json.result.state === 1, "payme CreateTransaction state 1");
  ok((await payme("CreateTransaction", { id: "pm-tx-1", time: Date.now(), amount: pkg5.price * 100, account: { order_id: pur1 } })).json.result.transaction === r.json.result.transaction, "payme CreateTransaction idempotent");
  ok((await payme("CreateTransaction", { id: "pm-tx-2", time: Date.now(), amount: pkg5.price * 100, account: { order_id: pur1 } })).json.error.code === -31051, "payme second tx for same order -> busy");
  r = await payme("PerformTransaction", { id: "pm-tx-1" });
  ok(r.json.result.state === 2 && r.json.result.perform_time > 0, "payme PerformTransaction state 2");
  ok((await payme("PerformTransaction", { id: "pm-tx-1" })).json.result.state === 2, "payme PerformTransaction idempotent");
  ok((await payme("CheckTransaction", { id: "pm-tx-1" })).json.result.state === 2, "payme CheckTransaction");
  ok((await payme("GetStatement", { from: 0, to: Date.now() + 1000 })).json.result.transactions.length === 1, "payme GetStatement");
  r = await call(CLIENT, "GET", `/api/purchases/${pur1}`);
  ok(r.json.status === "paid" && r.json.credits === 4 && r.json.order.status === "new", "paid: +5 credits, waiting order auto-submitted (credits 4)");
  ok((await payme("CancelTransaction", { id: "pm-tx-1", reason: 5 })).json.error.code === -31007, "payme cancel after videos used -> -31007");
  ok((await payme("CheckPerformTransaction", { amount: pkg5.price * 100, account: { order_id: pur1 } })).json.error.code === -31052, "payme paid order -> already paid");

  // Payme cancel of a created (unpaid) tx
  const pur2 = (await call(CLIENT, "POST", "/api/purchases", { packageId: pkg1.id, provider: "payme" })).json.id;
  await payme("CreateTransaction", { id: "pm-tx-3", time: Date.now(), amount: pkg1.price * 100, account: { order_id: pur2 } });
  ok((await payme("CancelTransaction", { id: "pm-tx-3", reason: 3 })).json.result.state === -1, "payme cancel unpaid tx -> state -1");
  ok((await payme("PerformTransaction", { id: "pm-tx-3" })).json.error.code === -31008, "payme perform cancelled tx -> -31008");

  // --- Click ---
  const pur3 = (await call(CLIENT, "POST", "/api/purchases", { packageId: pkg1.id, provider: "click" })).json;
  ok(pur3.payUrl.startsWith("https://my.click.uz/services/pay?") && pur3.payUrl.includes(`transaction_param=${pur3.id}`), "click checkout URL");
  const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
  const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
  const ct = { "Content-Type": "application/x-www-form-urlencoded" };
  const prep = { click_trans_id: "777", service_id: "111", click_paydoc_id: "1", merchant_trans_id: String(pur3.id), amount: String(pkg1.price), action: "0", error: "0", error_note: "ok", sign_time: "2026-11-19 10:00:00" };
  ok((await call(null, "POST", "/pay/click/prepare", form({ ...prep, sign_string: "bad" }), ct)).json.error === -1, "click bad sign -> -1");
  const sPrep = md5(prep.click_trans_id + prep.service_id + "click-secret" + prep.merchant_trans_id + prep.amount + prep.action + prep.sign_time);
  ok((await call(null, "POST", "/pay/click/prepare", form({ ...prep, amount: "1", sign_string: md5(prep.click_trans_id + prep.service_id + "click-secret" + prep.merchant_trans_id + "1" + prep.action + prep.sign_time) }), ct)).json.error === -2, "click wrong amount -> -2");
  r = await call(null, "POST", "/pay/click/prepare", form({ ...prep, sign_string: sPrep }), ct);
  ok(r.json.error === 0 && r.json.merchant_prepare_id, "click prepare ok");
  const comp = { ...prep, action: "1", merchant_prepare_id: String(r.json.merchant_prepare_id) };
  const sComp = md5(comp.click_trans_id + comp.service_id + "click-secret" + comp.merchant_trans_id + comp.merchant_prepare_id + comp.amount + comp.action + comp.sign_time);
  ok((await call(null, "POST", "/pay/click/complete", form({ ...comp, sign_string: sComp }), ct)).json.error === 0, "click complete ok");
  ok((await call(null, "POST", "/pay/click/complete", form({ ...comp, sign_string: sComp }), ct)).json.error === -4, "click repeat complete -> already paid");
  ok((await call(CLIENT, "GET", "/api/me")).json.user.credits === 5, "click paid: credits 5");

  // --- manual payment + admin confirm ---
  const pur4 = (await call(CLIENT, "POST", "/api/purchases", { packageId: pkg1.id, provider: "manual" })).json;
  ok(pur4.manualPayInfo?.includes("8600") && pur4.payUrl === null, "manual purchase shows card info");
  ok((await call(CLIENT, "POST", `/api/admin/purchases/${pur4.id}/mark-paid`)).status === 403, "client cannot confirm payment");
  ok((await call(ADMIN, "GET", "/api/admin/purchases")).json.some((p: any) => p.id === pur4.id), "admin sees pending manual purchase");
  ok((await call(ADMIN, "POST", `/api/admin/purchases/${pur4.id}/mark-paid`)).json.ok, "admin confirms manual payment");
  ok((await call(CLIENT, "GET", "/api/me")).json.user.credits === 6, "manual paid: credits 6");
  ok((await call(CLIENT, "POST", "/api/purchases", { packageId: pkg1.id, provider: "bogus" })).status === 400, "unknown payment provider rejected");

  // --- admin workflow ---
  ok((await call(CLIENT, "GET", "/api/admin/orders")).status === 403, "client -> admin API 403");
  r = await call(ADMIN, "GET", "/api/admin/orders?status=new");
  ok(r.json.some((o: any) => o.id === order1), "admin sees new order");
  r = await call(ADMIN, "GET", `/api/admin/orders/${order1}`);
  ok(r.json.claudeBrief.includes("Turkiya, Antalya") && r.json.claudeBrief.includes("instagram.com/sayohat.tour") && r.json.claudeBrief.includes("/f/") && r.json.claudeBrief.includes("Rixos 5*"), "Claude brief has tour, agency, logo/material links");
  ok((await call(ADMIN, "POST", `/api/admin/orders/${order1}/action`, { action: "take" })).json.status === "in_progress", "admin takes order");
  r = await upload(ADMIN, `/api/admin/orders/${order1}/result`, MP4, "final.mp4");
  ok(r.status === 200 && r.json.status === "delivered" && r.json.results.length === 1, "admin uploads result -> delivered");

  // signed file link
  const fileUrl: string = r.json.results[0].url;
  ok((await fetch(fileUrl)).status === 200, "signed result link downloads");
  ok((await fetch(fileUrl.replace(/sig=[a-f0-9]+/, "sig=" + "0".repeat(64)))).status === 403, "tampered link -> 403");

  // client revision then accept
  r = await call(CLIENT, "POST", `/api/orders/${order1}/revision`, { note: "Narxni kattaroq ko‘rsating" });
  ok(r.json.status === "revision" && r.json.revisionsLeft === 1, "client requests revision (1 left)");
  ok((await call(CLIENT, "POST", `/api/orders/${order1}/accept`)).status === 409, "cannot accept while in revision");
  ok((await call(ADMIN, "GET", `/api/admin/orders/${order1}`)).json.claudeBrief.includes("Narxni kattaroq"), "revision note included in Claude brief");
  await upload(ADMIN, `/api/admin/orders/${order1}/result`, MP4, "final-v2.mp4");
  ok((await call(CLIENT, "POST", `/api/orders/${order1}/accept`)).json.status === "completed", "client accepts -> completed");

  // order with credits goes straight to the team; admin cancel refunds
  r = await call(CLIENT, "POST", "/api/orders", { templateId: cat.templates[0].id, brief: { ...brief, destination: "Umra, mart" }, fileIds: [] });
  ok(r.json.status === "new", "order with credits -> new immediately");
  ok((await call(CLIENT, "GET", "/api/me")).json.user.credits === 5, "credit used (5 left)");
  ok((await call(CLIENT, "POST", `/api/orders/${r.json.id}/cancel`)).status === 409, "client cannot cancel a paid order");
  await call(ADMIN, "POST", `/api/admin/orders/${r.json.id}/action`, { action: "cancel", note: "test" });
  ok((await call(CLIENT, "GET", "/api/me")).json.user.credits === 6, "admin cancel refunds the credit");

  // client cancels unpaid order; submit-with-credit
  await db.user.update({ where: { telegramId: BigInt(CLIENT) }, data: { credits: 0 } });
  const o3 = (await call(CLIENT, "POST", "/api/orders", { templateId: tpl.id, brief, fileIds: [] })).json.id;
  ok((await call(CLIENT, "POST", `/api/orders/${o3}/submit`)).status === 409, "submit without credits -> 409");
  ok((await call(CLIENT, "POST", `/api/orders/${o3}/cancel`)).json.status === "cancelled", "client cancels unpaid order");

  // --- admin catalog ---
  r = await call(ADMIN, "POST", "/api/admin/templates", { title: "Kruiz", category: "Xorijiy turlar", description: "Dengiz kruizi", durationSec: 45, agentNotes: "Kema", active: true, sortOrder: 7 });
  ok(r.status === 200 && r.json.agentNotes === "Kema", "admin creates template");
  r = await upload(ADMIN, `/api/admin/templates/${r.json.id}/preview`, MP4, "preview.mp4");
  ok(r.json.previewUrl?.startsWith("/m/templates/"), "template preview uploaded");
  ok((await fetch(base + r.json.previewUrl)).status === 200, "template preview publicly served");
  const kruizId = r.json.id, previewUrl = r.json.previewUrl;
  ok((await call(CLIENT, "DELETE", `/api/admin/templates/${kruizId}/preview`)).status === 403, "client cannot remove template media");
  r = await call(ADMIN, "DELETE", `/api/admin/templates/${kruizId}/preview`);
  ok(r.json.previewUrl === null && (await fetch(base + previewUrl)).status === 404, "admin removes template preview (file deleted)");
  ok(!("agentNotes" in (await call(CLIENT, "GET", "/api/catalog")).json.templates[0]), "agent notes hidden from clients");
  r = await call(ADMIN, "PUT", `/api/admin/packages/${pkg1.id}`, { title: "1 video", videos: 1, price: 175000, active: true, sortOrder: 1 });
  ok(r.json.price === 175000, "admin updates package price");
  r = await call(ADMIN, "POST", "/api/admin/credits", { telegramId: String(CLIENT), delta: 2 });
  ok(r.json.credits === 2, "admin adds bonus credits");
  r = await call(ADMIN, "GET", "/api/admin/stats");
  ok(r.json.revenue.month === pkg5.price + pkg1.price * 2 && r.json.orders.completed === 1, "stats: revenue and completed orders");

  console.log(`\nE2E PASSED (${passed} checks)`);
} finally {
  await app.close();
  await db.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
}
