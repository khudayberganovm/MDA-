// ElevenLabs TTS (REST). Demo storyboards use bundled narration fixtures instead.
import fs from "node:fs";
import path from "node:path";
import { config, voiceId } from "../config.js";
import { probe } from "../lib/ffprobe.js";
import { demoNarrationFile } from "./demo.js";
import { PipelineError } from "./errors.js";
import type { ProjectOptions, Storyboard } from "./storyboard.js";

export interface Narration { file: string; duration: number }

async function tts(text: string, voice: string, model: string, dest: string) {
  let r: Response;
  try {
    r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": config.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) { throw new PipelineError(`ElevenLabs: tarmoq xatosi (${(e as Error).message})`, true); }
  if (!r.ok) {
    const body = (await r.text()).slice(0, 300);
    throw new PipelineError(`ElevenLabs HTTP ${r.status}: ${body}`, r.status === 429 || r.status >= 500);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) throw new PipelineError("ElevenLabs bo'sh audio qaytardi", true);
  fs.writeFileSync(dest, buf);
}

export async function narrate(sb: Storyboard & { scenes: { demoId?: string }[] }, o: ProjectOptions, workDir: string, demo: boolean): Promise<Narration[]> {
  const out: Narration[] = [];
  for (const [i, s] of sb.scenes.entries()) {
    const dest = path.join(workDir, `voice-${i}.mp3`);
    if (demo) {
      const id = (s as { demoId?: string }).demoId;
      if (!id) throw new PipelineError("Demo narration missing", false);
      fs.copyFileSync(path.join(config.rootDir, demoNarrationFile(o.language, id)), dest);
    } else {
      if (!config.providers.elevenlabs) throw new PipelineError("ElevenLabs API kaliti sozlanmagan (ELEVENLABS_API_KEY / ENABLE_PAID_APIS).", false);
      const v = voiceId(o.language, o.voice);
      if (!v) throw new PipelineError(`Ovoz sozlanmagan: ELEVENLABS_VOICE_${o.language.toUpperCase()}_${o.voice.toUpperCase()}`, false);
      await tts(s.narration, v, o.language === "uz" ? config.ELEVENLABS_MODEL_UZ : config.ELEVENLABS_MODEL_RU, dest);
    }
    const p = await probe(dest);
    if (!p.streams.some((st) => st.codec_type === "audio") || p.duration <= 0) throw new PipelineError("Ovoz fayli yaroqsiz", true);
    out.push({ file: dest, duration: p.duration });
  }
  return out;
}

/** Scene length = max(target, narration + pad); stretch to reach requested total. */
export function timeScenes(targets: number[], narr: Narration[], total: number): number[] {
  const d = targets.map((t, i) => Math.max(t, narr[i].duration + 0.6));
  const sum = d.reduce((a, b) => a + b, 0);
  return sum < total ? d.map((x) => (x * total) / sum) : d;
}
