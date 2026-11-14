// Entrypoint: `tsx src/main.ts api|bot|worker|all`
import "./config.js";
import { startApi } from "./api/server.js";
import { startBot } from "./bot/bot.js";
import { startWorker } from "./worker/worker.js";

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () { return this.toString(); };

const role = process.argv[2] ?? "all";
if (role === "api" || role === "all") await startApi();
if (role === "bot" || role === "all") await startBot();
if (role === "worker" || role === "all") await startWorker();
