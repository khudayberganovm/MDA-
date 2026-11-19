// Entrypoint: `tsx src/main.ts api|bot|all`
import "./config.js";
import { startApi } from "./api/server.js";
import { startBot } from "./bot/bot.js";
import { seedCatalog } from "./lib/seed.js";

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () { return this.toString(); };

const role = process.argv[2] ?? "all";
await seedCatalog();
if (role === "api" || role === "all") await startApi();
if (role === "bot" || role === "all") await startBot();
