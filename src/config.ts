import "./lib/env.js";
import path from "node:path";
import { z } from "zod";

const bool = z.string().optional().transform((v) => v === "true" || v === "1");
const int = (d: number) => z.coerce.number().int().positive().default(d);
const str = z.string().optional().default("");

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: int(8080),
  PUBLIC_URL: z.string().default("http://localhost:8080"),
  MEDIA_DIR: z.string().default("./media"),
  APP_SECRET: z.string().min(16, "APP_SECRET must be at least 16 chars"),
  BOT_TOKEN: str,
  WEBAPP_URL: str,
  DEV_AUTH: bool,
  // Telegram IDs of admins (comma separated) and the team group that receives orders.
  ADMIN_IDS: str,
  ADMIN_CHAT_ID: str,
  SUPPORT_USERNAME: str,
  REVISIONS_PER_ORDER: z.coerce.number().int().min(0).default(2),
  // Payme (Merchant API)
  PAYME_MERCHANT_ID: str,
  PAYME_KEY: str,
  PAYME_TEST: bool,
  // Click (SHOP API)
  CLICK_SERVICE_ID: str,
  CLICK_MERCHANT_ID: str,
  CLICK_SECRET_KEY: str,
  // Manual card transfer instructions (shown to the client; admin confirms the payment)
  MANUAL_PAY_INFO: str.transform((v) => v.replace(/\\n/g, "\n")), // "\n" in .env = new line
});

const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === "production";
if (isProd && env.DEV_AUTH) throw new Error("DEV_AUTH must be disabled in production");

export const config = {
  ...env,
  publicUrl: env.PUBLIC_URL.replace(/\/$/, ""),
  mediaDir: path.resolve(env.MEDIA_DIR),
  rootDir: path.resolve(import.meta.dirname, ".."),
  adminIds: new Set(env.ADMIN_IDS.split(/[\s,]+/).filter((s) => /^\d+$/.test(s))),
  payments: {
    payme: Boolean(env.PAYME_MERCHANT_ID && env.PAYME_KEY),
    click: Boolean(env.CLICK_SERVICE_ID && env.CLICK_MERCHANT_ID && env.CLICK_SECRET_KEY),
    manual: Boolean(env.MANUAL_PAY_INFO.trim()),
    dev: !isProd && env.DEV_AUTH,
  },
};

export const isAdmin = (telegramId: bigint | number | string) => config.adminIds.has(String(telegramId));
