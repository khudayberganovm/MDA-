// Uses the ffprobe binary shipped with Remotion's compositor (or FFPROBE_PATH / system ffprobe).
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

function compositorDir(): string | null {
  const arch = process.arch;
  const names =
    process.platform === "darwin" ? [`@remotion/compositor-darwin-${arch}`]
    : process.platform === "linux" ? [`@remotion/compositor-linux-${arch}-gnu`, `@remotion/compositor-linux-${arch}-musl`]
    : [`@remotion/compositor-win32-${arch}-msvc`];
  for (const n of names) {
    try { return path.dirname(require.resolve(`${n}/package.json`)); } catch {}
  }
  return null;
}

function bin(name: "ffprobe" | "ffmpeg"): { file: string; cwd?: string; env?: NodeJS.ProcessEnv } {
  const override = process.env[name === "ffprobe" ? "FFPROBE_PATH" : "FFMPEG_PATH"];
  if (override) return { file: override };
  const dir = compositorDir();
  if (dir && fs.existsSync(path.join(dir, name))) {
    return { file: path.join(dir, name), cwd: dir, env: { ...process.env, LD_LIBRARY_PATH: dir, DYLD_LIBRARY_PATH: dir } };
  }
  return { file: name };
}

function run(name: "ffprobe" | "ffmpeg", args: string[], timeout = 120000): Promise<string> {
  const b = bin(name);
  return new Promise((resolve, reject) => {
    execFile(b.file, args, { cwd: b.cwd, env: b.env, timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) =>
      err ? reject(new Error(`${name} failed: ${stderr?.slice(-500) || err.message}`)) : resolve(stdout));
  });
}

export interface ProbeResult { duration: number; streams: { codec_type: string; codec_name: string; width?: number; height?: number }[] }

export async function probe(file: string): Promise<ProbeResult> {
  const out = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path.resolve(file)]);
  const j = JSON.parse(out);
  return { duration: Number(j.format?.duration ?? 0), streams: j.streams ?? [] };
}

export const ffmpeg = (args: string[]) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], 300000);
