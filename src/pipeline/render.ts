import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, ensureBrowser } from "@remotion/renderer";
import { config } from "../config.js";
import { probe } from "../lib/ffprobe.js";
import { PipelineError } from "./errors.js";
import type { AdProps } from "../../remotion/types.js";

// Optional: path to a pre-installed Chrome Headless Shell (skips Remotion auto-download).
const BROWSER = process.env.BROWSER_EXECUTABLE || null;
let serveUrl: Promise<string> | null = null;
let assetBase: Promise<string> | null = null;

/** Loopback-only static server so Chrome can load local media (Remotion can't read file://). */
function startAssetServer(): Promise<string> {
  const root = config.mediaDir;
  const types: Record<string, string> = { ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".wav": "audio/wav" };
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = path.resolve(root, "." + rel);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const size = fs.statSync(file).size;
    const headers = { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", "Access-Control-Allow-Origin": "*", "Accept-Ranges": "bytes" };
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    if (m) {
      const start = m[1] ? Number(m[1]) : 0, end = m[2] ? Number(m[2]) : size - 1;
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { ...headers, "Content-Length": size });
      fs.createReadStream(file).pipe(res);
    }
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`)));
}

export const assetUrl = async (absFile: string) => {
  assetBase ??= startAssetServer();
  const rel = path.relative(config.mediaDir, absFile);
  if (rel.startsWith("..")) throw new Error("asset outside media dir");
  return `${await assetBase}/${rel.split(path.sep).map(encodeURIComponent).join("/")}`;
};

export async function prepareRenderer() {
  serveUrl ??= (async () => {
    await ensureBrowser({ browserExecutable: BROWSER });
    return bundle({ entryPoint: path.join(config.rootDir, "remotion/index.ts"), webpackOverride: (c) => c });
  })();
  return serveUrl;
}

export async function renderVideo(props: AdProps, out: string, onProgress: (p: number) => void) {
  const url = await prepareRenderer();
  const composition = await selectComposition({ serveUrl: url, id: "Ad", inputProps: props, browserExecutable: BROWSER });
  const maxFrames = 75 * 30;
  if (composition.durationInFrames > maxFrames) throw new PipelineError("Video juda uzun", false);
  await renderMedia({
    serveUrl: url, composition, inputProps: props, browserExecutable: BROWSER, codec: "h264", audioCodec: "aac", outputLocation: out,
    concurrency: config.RENDER_CONCURRENCY, timeoutInMilliseconds: 120000, pixelFormat: "yuv420p",
    chromiumOptions: { gl: "swangle" },
    onProgress: ({ progress }) => onProgress(progress),
  });
  const p = await probe(out);
  const v = p.streams.find((s) => s.codec_type === "video");
  const a = p.streams.find((s) => s.codec_type === "audio");
  if (!v || v.codec_name !== "h264" || !a || a.codec_name !== "aac" || v.width !== 1080 || v.height !== 1920)
    throw new PipelineError("Render natijasi tekshiruvdan o'tmadi (ffprobe)", true);
  return p;
}
