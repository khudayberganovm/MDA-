// End-to-end check: API (dev auth) -> job -> worker -> MP4 -> signed download -> ffprobe.
// Usage: npm run test:e2e [-- --style minimal --duration 15]
import fs from "node:fs";
import path from "node:path";
import { startApi } from "../src/api/server.js";
import { config } from "../src/config.js";
import { db } from "../src/db.js";
import { probe } from "../src/lib/ffprobe.js";
import { prepareRenderer } from "../src/pipeline/render.js";
import { processOne } from "../src/worker/worker.js";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
if (!config.DEV_AUTH) throw new Error("e2e needs DEV_AUTH=true");
const app = await startApi();
const base = `http://127.0.0.1:${config.PORT}`;
const H = { Authorization: "dev 900001", "Content-Type": "application/json" };
const ok = (m: string) => console.log("✔", m);

const me = await (await fetch(`${base}/api/me`, { headers: H })).json();
ok(`auth as ${me.user.name}; providers=${JSON.stringify(me.providers)} demoMode=${me.demoMode}`);

const t0 = Date.now();
const res = await fetch(`${base}/api/projects`, { method: "POST", headers: H, body: JSON.stringify({
  prompt: "30 soniyalik zamonaviy biznes reklamasi. O'zbekcha ovoz, mos kadrlar, chiroyli animatsiyalar, subtitr va yakuniy CTA.",
  options: { duration: Number(arg("duration", "30")), language: "uz", voice: "male", style: arg("style", "professional"), businessName: "MOTION AI", cta: "Hoziroq buyurtma bering" },
}) });
const proj = await res.json();
if (res.status !== 201) throw new Error(JSON.stringify(proj));
ok(`project ${proj.id} created (status ${proj.status})`);
const job = await db.job.findFirstOrThrow({ where: { projectId: proj.id } });
ok(`job ${job.id} queued`);

await prepareRenderer();
while (true) {
  await processOne();
  const p = await db.project.findUniqueOrThrow({ where: { id: proj.id } });
  if (p.status === "completed" || p.status === "failed") break;
  await new Promise((r) => setTimeout(r, 500));
}
const done = await (await fetch(`${base}/api/projects/${proj.id}`, { headers: H })).json();
if (done.status !== "completed") throw new Error(`project failed: ${done.error}`);
ok(`completed in ${((Date.now() - t0) / 1000).toFixed(0)}s; demo=${done.demo}; scenes=${done.storyboard.scenes.length}`);

const other = await fetch(`${base}/api/projects/${proj.id}`, { headers: { Authorization: "dev 900002" } });
if (other.status !== 404) throw new Error("access control broken");
ok("other user gets 404");

const { url } = await (await fetch(`${base}/api/projects/${proj.id}/download-link`, { method: "POST", headers: { Authorization: H.Authorization } })).json();
const dl = await fetch(url.replace(config.PUBLIC_URL, base));
const out = path.resolve(`media/e2e-${proj.id}.mp4`);
fs.writeFileSync(out, Buffer.from(await dl.arrayBuffer()));
ok(`downloaded ${(fs.statSync(out).size / 1e6).toFixed(1)} MB via signed link`);
const bad = await fetch(url.replace(config.PUBLIC_URL, base).replace(/sig=./, "sig=0"));
if (bad.status !== 403) throw new Error("bad signature accepted");
ok("tampered link rejected");

const pr = await probe(out);
console.log("ffprobe:", pr.duration.toFixed(2) + "s", pr.streams.map((s) => `${s.codec_type}:${s.codec_name}${s.width ? ` ${s.width}x${s.height}` : ""}`).join(", "));
if (!pr.streams.some((s) => s.codec_type === "audio") || !pr.streams.some((s) => s.codec_type === "video")) throw new Error("missing stream");
ok(`E2E PASSED -> ${out}`);
await app.close(); await db.$disconnect(); process.exit(0);
