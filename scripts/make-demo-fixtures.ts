// Regenerates demo narration fixtures using macOS `say` (Milena voice). Run on macOS only.
// These are clearly NOT ElevenLabs output; they exist so DEMO_MODE produces real audio.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DEMO_SCENES, demoNarrationFile } from "../src/pipeline/demo.js";
import { ffmpeg } from "../src/lib/ffprobe.js";

fs.mkdirSync("assets/demo", { recursive: true });
for (const s of DEMO_SCENES) for (const lang of ["uz", "ru"] as const) {
  const aiff = path.resolve(`assets/demo/tmp-${lang}-${s.id}.wav`);
  execFileSync("say", ["-v", "Milena", "-r", "165", "--file-format=WAVE", "--data-format=LEI16@22050", "-o", aiff, s.narration[lang]]);
  await ffmpeg(["-i", aiff, "-ac", "1", "-ar", "44100", "-b:a", "96k", path.resolve(demoNarrationFile(lang, s.id))]);
  fs.rmSync(aiff);
  console.log("wrote", demoNarrationFile(lang, s.id));
}
