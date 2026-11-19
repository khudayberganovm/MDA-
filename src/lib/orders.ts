// Order and purchase business logic (shared by the Mini App API, bot and payment callbacks).
import { config } from "../config.js";
import { db } from "../db.js";
import { HttpError } from "./files.js";
import { AgencyInput, Brief, type AgencySnapshot, type OrderStatus } from "./format.js";
import * as notify from "./notify.js";

export async function upsertUser(u: { id: number; first_name: string; last_name?: string; username?: string; language_code?: string }) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").slice(0, 100) || "User";
  return db.user.upsert({
    where: { telegramId: BigInt(u.id) },
    update: { name, username: u.username ?? null },
    create: { telegramId: BigInt(u.id), name, username: u.username ?? null, language: u.language_code === "ru" ? "ru" : "uz" },
  });
}

export async function saveAgency(userId: number, raw: unknown) {
  const a = AgencyInput.parse(raw);
  if (a.logoFileId) {
    const f = await db.fileAsset.findFirst({ where: { id: a.logoFileId, userId, kind: "logo" } });
    if (!f) throw new HttpError(400, "Logo topilmadi");
  }
  const data = { name: a.name, instagram: a.instagram, phone: a.phone, telegram: a.telegram || null, city: a.city || null, logoFileId: a.logoFileId ?? null };
  return db.agency.upsert({ where: { userId }, update: data, create: { userId, ...data } });
}

const event = (orderId: number, type: string, note?: string | null, by?: string | null) =>
  db.orderEvent.create({ data: { orderId, type, note: note ?? null, by: by ?? null } });

/** Create an order. Uses 1 prepaid video if available, otherwise waits for payment. */
export async function placeOrder(userId: number, raw: { templateId?: unknown; brief?: unknown; fileIds?: unknown }) {
  const brief = Brief.parse(raw.brief ?? {});
  const templateId = Number(raw.templateId);
  const fileIds = Array.isArray(raw.fileIds) ? raw.fileIds.filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  const [template, agency, recent] = await Promise.all([
    Number.isSafeInteger(templateId) ? db.template.findFirst({ where: { id: templateId, active: true } }) : null,
    db.agency.findUnique({ where: { userId } }),
    db.order.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 86400_000) } } }),
  ]);
  if (!template) throw new HttpError(400, "Shablon topilmadi");
  if (!agency) throw new HttpError(400, "Avval agentlik ma’lumotlarini to‘ldiring");
  if (recent >= 30) throw new HttpError(429, "Bugungi buyurtmalar soni limitiga yetdingiz");
  const snapshot: AgencySnapshot = { name: agency.name, instagram: agency.instagram, phone: agency.phone, telegram: agency.telegram, city: agency.city, logoFileId: agency.logoFileId };

  const order = await db.$transaction(async (t) => {
    const o = await t.order.create({ data: { userId, templateId, brief: JSON.stringify(brief), agency: JSON.stringify(snapshot), revisionsLeft: config.REVISIONS_PER_ORDER } });
    if (fileIds.length) await t.fileAsset.updateMany({ where: { id: { in: fileIds }, userId, kind: "material", orderId: null }, data: { orderId: o.id } });
    await t.orderEvent.create({ data: { orderId: o.id, type: "created" } });
    const used = await t.user.updateMany({ where: { id: userId, credits: { gt: 0 } }, data: { credits: { decrement: 1 } } });
    if (used.count) {
      await t.orderEvent.create({ data: { orderId: o.id, type: "submitted", note: "Balansdan 1 video" } });
      return t.order.update({ where: { id: o.id }, data: { status: "new", creditUsed: true } });
    }
    return o;
  });
  if (order.status === "new") await notify.newOrder(order.id);
  return order;
}

/** Use a credit for an order that was waiting for payment (e.g. after buying a package). */
export async function submitWithCredit(userId: number, orderId: number) {
  const ok = await db.$transaction(async (t) => {
    const o = await t.order.findFirst({ where: { id: orderId, userId, status: "awaiting_payment" } });
    if (!o) return false;
    const used = await t.user.updateMany({ where: { id: userId, credits: { gt: 0 } }, data: { credits: { decrement: 1 } } });
    if (!used.count) return false;
    await t.order.update({ where: { id: o.id }, data: { status: "new", creditUsed: true } });
    await t.orderEvent.create({ data: { orderId: o.id, type: "submitted", note: "Balansdan 1 video" } });
    return true;
  });
  if (ok) await notify.newOrder(orderId);
  return ok;
}

export async function createPurchase(userId: number, packageId: number, provider: string, orderId?: number | null) {
  const pkg = await db.package.findFirst({ where: { id: packageId, active: true } });
  if (!pkg) throw new HttpError(400, "Paket topilmadi");
  if (orderId != null && !(await db.order.findFirst({ where: { id: orderId, userId, status: "awaiting_payment" } }))) orderId = null;
  const pending = await db.purchase.count({ where: { userId, status: "pending", createdAt: { gte: new Date(Date.now() - 86400_000) } } });
  if (pending >= 20) throw new HttpError(429, "To‘lanmagan xaridlar juda ko‘p");
  return db.purchase.create({ data: { userId, packageId: pkg.id, videos: pkg.videos, amount: pkg.price, provider, orderId: orderId ?? null } });
}

/** Mark a purchase paid (idempotent): add credits, then submit the order that was waiting for it. */
export async function markPurchasePaid(purchaseId: number, provider: string) {
  const changed = await db.$transaction(async (t) => {
    const r = await t.purchase.updateMany({ where: { id: purchaseId, status: "pending" }, data: { status: "paid", paidAt: new Date(), provider } });
    if (!r.count) return null;
    const p = await t.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
    await t.user.update({ where: { id: p.userId }, data: { credits: { increment: p.videos } } });
    return p;
  });
  if (!changed) return false;
  await notify.purchasePaid(purchaseId);
  if (changed.orderId) await submitWithCredit(changed.userId, changed.orderId);
  return true;
}

/** Reverse a paid purchase (Payme cancel after perform). Fails if the videos were already used. */
export async function revertPurchase(purchaseId: number) {
  return db.$transaction(async (t) => {
    const p = await t.purchase.findUnique({ where: { id: purchaseId } });
    if (!p || p.status !== "paid") return p?.status === "cancelled";
    const r = await t.user.updateMany({ where: { id: p.userId, credits: { gte: p.videos } }, data: { credits: { decrement: p.videos } } });
    if (!r.count) return false;
    await t.purchase.update({ where: { id: p.id }, data: { status: "cancelled" } });
    return true;
  });
}

const ACTIVE: OrderStatus[] = ["new", "in_progress", "delivered", "revision"];

async function transition(orderId: number, from: OrderStatus[], to: OrderStatus, data: Record<string, unknown> = {}, extraWhere: Record<string, unknown> = {}) {
  const r = await db.order.updateMany({ where: { id: orderId, status: { in: from }, ...extraWhere }, data: { status: to, ...data } });
  return r.count > 0;
}

export async function takeOrder(orderId: number, by: string) {
  if (!(await transition(orderId, ["new", "revision"], "in_progress", { assignee: by }))) throw new HttpError(409, "Buyurtmani hozir ishga olib bo‘lmaydi");
  await event(orderId, "in_progress", null, by);
  await Promise.all([notify.refreshCard(orderId), notify.clientStatus(orderId, "in_progress")]);
}

export async function deliverOrder(orderId: number, file: { path?: string | null; tgFileId?: string | null; name: string; mime: string; size: number }, by: string) {
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o || !ACTIVE.includes(o.status as OrderStatus)) throw new HttpError(409, "Bu buyurtmaga video yuborib bo‘lmaydi");
  const f = await db.fileAsset.create({ data: { orderId, kind: "result", path: file.path ?? null, tgFileId: file.tgFileId ?? null, name: file.name, mime: file.mime, size: file.size } });
  await db.order.update({ where: { id: orderId }, data: { status: "delivered", deliveredAt: new Date(), assignee: o.assignee ?? by } });
  await event(orderId, "delivered", f.name, by);
  const sent = await notify.deliverToClient(orderId, f.id);
  await notify.refreshCard(orderId);
  return { file: f, sentToClient: sent };
}

export async function acceptOrder(userId: number, orderId: number) {
  if (!(await transition(orderId, ["delivered"], "completed", {}, { userId }))) throw new HttpError(409, "Buyurtma qabul qilishga tayyor emas");
  await event(orderId, "completed", null, "client");
  await notify.orderAccepted(orderId);
}

export async function requestRevision(userId: number, orderId: number, note: string) {
  const text = note.trim().slice(0, 1500);
  if (text.length < 3) throw new HttpError(400, "Nimani o‘zgartirish kerakligini yozing");
  if (!(await transition(orderId, ["delivered"], "revision", { revisionNote: text, revisionsLeft: { decrement: 1 } }, { userId, revisionsLeft: { gt: 0 } })))
    throw new HttpError(409, "Tahrir so‘rab bo‘lmaydi");
  await event(orderId, "revision", text, "client");
  await notify.revisionRequested(orderId);
}

/** Client may cancel only unpaid orders; admins may cancel any active order (refunds the video credit). */
export async function cancelOrder(orderId: number, by: string, opts: { userId?: number; reason?: string } = {}) {
  const from: OrderStatus[] = opts.userId ? ["awaiting_payment"] : ["awaiting_payment", ...ACTIVE];
  const result = await db.$transaction(async (t) => {
    const o = await t.order.findFirst({ where: { id: orderId, status: { in: from }, ...(opts.userId ? { userId: opts.userId } : {}) } });
    if (!o) return null;
    await t.order.update({ where: { id: o.id }, data: { status: "cancelled" } });
    if (o.creditUsed) await t.user.update({ where: { id: o.userId }, data: { credits: { increment: 1 } } });
    await t.orderEvent.create({ data: { orderId: o.id, type: "cancelled", note: opts.reason ?? null, by } });
    return o;
  });
  if (!result) throw new HttpError(409, "Buyurtmani bekor qilib bo‘lmaydi");
  await notify.refreshCard(orderId);
  if (!opts.userId) await notify.clientStatus(orderId, "cancelled", { refund: result.creditUsed });
}

export async function completeByAdmin(orderId: number, by: string) {
  if (!(await transition(orderId, ["delivered", "in_progress", "revision"], "completed"))) throw new HttpError(409, "Yakunlab bo‘lmaydi");
  await event(orderId, "completed", null, by);
  await notify.refreshCard(orderId);
}
