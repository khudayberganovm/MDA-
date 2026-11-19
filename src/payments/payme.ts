// Payme Merchant API (JSON-RPC 2.0), https://developer.help.paycom.uz
// Account field: order_id = Purchase.id. Amounts are in tiyin (1 so'm = 100 tiyin).
import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../db.js";
import { markPurchasePaid, revertPurchase } from "../lib/orders.js";

const TIMEOUT_MS = 12 * 3600 * 1000;
const msg = (uz: string, ru: string, en: string) => ({ uz, ru, en });
const E = {
  auth: { code: -32504, message: msg("Avtorizatsiya xatosi", "Ошибка авторизации", "Unauthorized") },
  method: { code: -32601, message: msg("Metod topilmadi", "Метод не найден", "Method not found") },
  rpc: { code: -32600, message: msg("Noto‘g‘ri so‘rov", "Неверный запрос", "Invalid request") },
  amount: { code: -31001, message: msg("Noto‘g‘ri summa", "Неверная сумма", "Wrong amount") },
  noTx: { code: -31003, message: msg("Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found") },
  cantCancel: { code: -31007, message: msg("Bekor qilib bo‘lmaydi", "Невозможно отменить", "Unable to cancel") },
  cantPerform: { code: -31008, message: msg("Amalni bajarib bo‘lmaydi", "Невозможно выполнить", "Unable to perform") },
  noOrder: { code: -31050, message: msg("Buyurtma topilmadi", "Заказ не найден", "Order not found"), data: "order_id" },
  busy: { code: -31051, message: msg("Buyurtma uchun to‘lov jarayonda", "Заказ ожидает оплаты", "Order has a pending payment"), data: "order_id" },
  paid: { code: -31052, message: msg("Buyurtma allaqachon to‘langan", "Заказ уже оплачен", "Order already paid"), data: "order_id" },
};
type RpcError = (typeof E)[keyof typeof E];
class PaymeError extends Error { constructor(public e: RpcError) { super(e.message.en); } }

export function paymeAuthorized(header: string | undefined): boolean {
  if (!config.payments.payme || !header?.startsWith("Basic ")) return false;
  const want = Buffer.from(`Paycom:${config.PAYME_KEY}`);
  const got = Buffer.from(Buffer.from(header.slice(6), "base64").toString("utf8"));
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export function paymeCheckoutUrl(purchaseId: number, amountUzs: number, returnUrl: string, lang: string) {
  const params = `m=${config.PAYME_MERCHANT_ID};ac.order_id=${purchaseId};a=${amountUzs * 100};l=${lang === "ru" ? "ru" : "uz"};c=${returnUrl}`;
  return `https://checkout.${config.PAYME_TEST ? "test." : ""}paycom.uz/${Buffer.from(params).toString("base64")}`;
}

type P = Record<string, unknown>;
const txView = (t: { id: number; createTime: bigint; performTime: bigint; cancelTime: bigint; state: number; reason: number | null }) => ({
  create_time: Number(t.createTime), perform_time: Number(t.performTime), cancel_time: Number(t.cancelTime), transaction: String(t.id), state: t.state, reason: t.reason,
});

async function checkAccount(p: P) {
  const id = Number((p.account as P | undefined)?.order_id);
  const amount = Number(p.amount);
  const purchase = Number.isSafeInteger(id) && id > 0 ? await db.purchase.findUnique({ where: { id } }) : null;
  if (!purchase) throw new PaymeError(E.noOrder);
  if (purchase.status === "paid") throw new PaymeError(E.paid);
  if (purchase.status !== "pending") throw new PaymeError(E.noOrder);
  if (!Number.isSafeInteger(amount) || amount !== purchase.amount * 100) throw new PaymeError(E.amount);
  return purchase;
}

async function findTx(p: P) {
  const tx = await db.paymentTx.findUnique({ where: { provider_extId: { provider: "payme", extId: String(p.id ?? "") } } });
  if (!tx) throw new PaymeError(E.noTx);
  return tx;
}

async function expire(txId: number) {
  return db.paymentTx.update({ where: { id: txId }, data: { state: -1, reason: 4, cancelTime: BigInt(Date.now()) } });
}

const methods: Record<string, (p: P) => Promise<unknown>> = {
  async CheckPerformTransaction(p) {
    await checkAccount(p);
    return { allow: true };
  },

  async CreateTransaction(p) {
    const existing = await db.paymentTx.findUnique({ where: { provider_extId: { provider: "payme", extId: String(p.id ?? "") } } });
    if (existing) {
      if (existing.state !== 1) throw new PaymeError(E.cantPerform);
      if (Date.now() - Number(existing.createTime) > TIMEOUT_MS) { await expire(existing.id); throw new PaymeError(E.cantPerform); }
      return { create_time: Number(existing.createTime), transaction: String(existing.id), state: existing.state };
    }
    if (typeof p.id !== "string" || !p.id) throw new PaymeError(E.rpc);
    const purchase = await checkAccount(p);
    const active = await db.paymentTx.findFirst({ where: { purchaseId: purchase.id, provider: "payme", state: 1 } });
    if (active) {
      if (Date.now() - Number(active.createTime) <= TIMEOUT_MS) throw new PaymeError(E.busy);
      await expire(active.id);
    }
    const tx = await db.paymentTx.create({ data: { provider: "payme", extId: p.id, purchaseId: purchase.id, amount: Number(p.amount), state: 1, createTime: BigInt(Date.now()) } });
    return { create_time: Number(tx.createTime), transaction: String(tx.id), state: tx.state };
  },

  async PerformTransaction(p) {
    let tx = await findTx(p);
    if (tx.state === 1) {
      if (Date.now() - Number(tx.createTime) > TIMEOUT_MS) { await expire(tx.id); throw new PaymeError(E.cantPerform); }
      const purchase = await db.purchase.findUnique({ where: { id: tx.purchaseId } });
      if (purchase?.status !== "pending") throw new PaymeError(E.cantPerform);
      tx = await db.paymentTx.update({ where: { id: tx.id }, data: { state: 2, performTime: BigInt(Date.now()) } });
      await markPurchasePaid(tx.purchaseId, "payme");
    } else if (tx.state !== 2) throw new PaymeError(E.cantPerform);
    return { transaction: String(tx.id), perform_time: Number(tx.performTime), state: tx.state };
  },

  async CancelTransaction(p) {
    let tx = await findTx(p);
    const reason = Number.isInteger(p.reason) ? Number(p.reason) : null;
    if (tx.state === 1) {
      tx = await db.paymentTx.update({ where: { id: tx.id }, data: { state: -1, reason, cancelTime: BigInt(Date.now()) } });
    } else if (tx.state === 2) {
      if (!(await revertPurchase(tx.purchaseId))) throw new PaymeError(E.cantCancel);
      tx = await db.paymentTx.update({ where: { id: tx.id }, data: { state: -2, reason, cancelTime: BigInt(Date.now()) } });
    }
    return { transaction: String(tx.id), cancel_time: Number(tx.cancelTime), state: tx.state };
  },

  async CheckTransaction(p) {
    return txView(await findTx(p));
  },

  async GetStatement(p) {
    const from = BigInt(Number(p.from) || 0), to = BigInt(Number(p.to) || 0);
    const list = await db.paymentTx.findMany({ where: { provider: "payme", createTime: { gte: from, lte: to } }, orderBy: { createTime: "asc" } });
    return {
      transactions: list.map((t) => ({ id: t.extId, time: Number(t.createTime), amount: t.amount, account: { order_id: String(t.purchaseId) }, ...txView(t) })),
    };
  },
};

/** Handle one JSON-RPC request body. Always answered with HTTP 200 per Payme spec. */
export async function handlePayme(body: unknown, authHeader: string | undefined) {
  const req = (body ?? {}) as { id?: unknown; method?: unknown; params?: unknown };
  const id = req.id ?? null;
  if (!paymeAuthorized(authHeader)) return { jsonrpc: "2.0", id, error: E.auth };
  const fn = typeof req.method === "string" && Object.hasOwn(methods, req.method) ? methods[req.method] : null;
  if (!fn) return { jsonrpc: "2.0", id, error: E.method };
  try {
    return { jsonrpc: "2.0", id, result: await fn((req.params ?? {}) as P) };
  } catch (e) {
    if (e instanceof PaymeError) return { jsonrpc: "2.0", id, error: e.e };
    console.error("[payme]", e);
    return { jsonrpc: "2.0", id, error: { code: -32400, message: msg("Tizim xatosi", "Системная ошибка", "System error") } };
  }
}
