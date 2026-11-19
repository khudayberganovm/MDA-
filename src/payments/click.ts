// Click SHOP API (Prepare / Complete), https://docs.click.uz/click-api-request
// merchant_trans_id = Purchase.id. Amounts are in so'm.
import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../db.js";
import { markPurchasePaid } from "../lib/orders.js";

const ERR: Record<number, string> = {
  0: "Success", [-1]: "SIGN CHECK FAILED!", [-2]: "Incorrect parameter amount", [-3]: "Action not found", [-4]: "Already paid",
  [-5]: "User does not exist", [-6]: "Transaction does not exist", [-8]: "Error in request from click", [-9]: "Transaction cancelled",
};

export function clickCheckoutUrl(purchaseId: number, amountUzs: number, returnUrl: string) {
  const q = new URLSearchParams({ service_id: config.CLICK_SERVICE_ID, merchant_id: config.CLICK_MERCHANT_ID, amount: String(amountUzs), transaction_param: String(purchaseId), return_url: returnUrl });
  return `https://my.click.uz/services/pay?${q}`;
}

type Params = Record<string, string>;
const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");
function signOk(p: Params, withPrepareId: boolean) {
  const base = p.click_trans_id + p.service_id + config.CLICK_SECRET_KEY + p.merchant_trans_id + (withPrepareId ? p.merchant_prepare_id : "") + p.amount + p.action + p.sign_time;
  const want = Buffer.from(md5(base));
  const got = Buffer.from(String(p.sign_string ?? "").toLowerCase());
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export async function handleClick(stage: "prepare" | "complete", p: Params) {
  const base = { click_trans_id: p.click_trans_id, merchant_trans_id: p.merchant_trans_id };
  const reply = (error: number, extra: Record<string, unknown> = {}) => ({ ...base, ...extra, error, error_note: ERR[error] ?? "Error" });
  if (!config.payments.click) return reply(-8);
  if (!p.click_trans_id || !p.merchant_trans_id || !p.amount || !p.sign_time) return reply(-8);
  if (p.service_id !== config.CLICK_SERVICE_ID || !signOk(p, stage === "complete")) return reply(-1);
  if (p.action !== (stage === "prepare" ? "0" : "1")) return reply(-3);

  const purchaseId = Number(p.merchant_trans_id);
  const purchase = Number.isSafeInteger(purchaseId) ? await db.purchase.findUnique({ where: { id: purchaseId } }) : null;
  if (!purchase) return reply(-5);
  if (Math.abs(Number(p.amount) - purchase.amount) > 0.001) return reply(-2);

  if (stage === "prepare") {
    if (purchase.status === "paid") return reply(-4);
    if (purchase.status !== "pending") return reply(-9);
    const tx = await db.paymentTx.upsert({
      where: { provider_extId: { provider: "click", extId: p.click_trans_id } },
      update: {},
      create: { provider: "click", extId: p.click_trans_id, purchaseId, amount: purchase.amount * 100, state: 1, createTime: BigInt(Date.now()) },
    });
    if (tx.purchaseId !== purchaseId) return reply(-6);
    return reply(0, { merchant_prepare_id: tx.id });
  }

  const tx = await db.paymentTx.findFirst({ where: { id: Number(p.merchant_prepare_id) || -1, provider: "click", extId: p.click_trans_id, purchaseId } });
  if (!tx) return reply(-6);
  if (tx.state === 2) return reply(-4, { merchant_confirm_id: tx.id });
  if (tx.state < 0) return reply(-9);
  // Click reports its own failure with error < 0: cancel our side.
  if (Number(p.error) < 0) {
    await db.paymentTx.update({ where: { id: tx.id }, data: { state: -1, cancelTime: BigInt(Date.now()) } });
    return reply(-9);
  }
  if (purchase.status === "paid") return reply(-4);
  if (purchase.status !== "pending") return reply(-9);
  await db.paymentTx.update({ where: { id: tx.id }, data: { state: 2, performTime: BigInt(Date.now()) } });
  await markPurchasePaid(purchaseId, "click");
  return reply(0, { merchant_confirm_id: tx.id });
}
