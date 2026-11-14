import { config } from "../config.js";
// Full project pipeline: plan -> source -> voice -> render. Each stage updates DB status.
import fs from "node:fs";
import path from "node:path";
import { db, type ProjectStatus } from "../db.js";
import { ensureDir, mediaPath, safeId } from "../lib/paths.js";
import { planStoryboard } from "./planner.js";
import { renderVideo, assetUrl } from "./render.js";
import { sourceClips } from "./stock.js";
import { ProjectOptions, Storyboard, scriptText } from "./storyboard.js";
import { narrate, timeScenes } from "./voice.js";
import type { AdProps } from "../../remotion/types.js";

const FPS = 30;

export async function runProject(jobId: string, projectId: string) {
  const log = (m: string) => console.log(`[job ${jobId}] ${m}`);
  const stage = async (status: ProjectStatus, progress: number) => {
    await db.project.update({ where: { id: projectId }, data: { status } });
    await db.job.update({ where: { id: jobId }, data: { stage: status, progress } });
    log(`stage ${status}`);
  };
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const o = ProjectOptions.parse(JSON.parse(project.options));
  const work = ensureDir(mediaPath("projects", safeId(projectId)));

  // 1. Plan (reuse storyboard on retry to avoid repeat AI cost)
  await stage("planning", 0.05);
  let sb: Storyboard; let demo = project.demo;
  if (project.storyboard) sb = Storyboard.parse(JSON.parse(project.storyboard));
  else {
    const r = await planStoryboard(project.prompt, o);
    sb = r.storyboard; demo = r.demo;
    await db.project.update({ where: { id: projectId }, data: { storyboard: JSON.stringify(sb), script: scriptText(sb), demo } });
  }

  // 2. Stock media
  await stage("sourcing", 0.2);
  const clips = o.style === "minimal" ? sb.scenes.map(() => null) : await sourceClips(sb, log);
  const credits = clips.filter(Boolean).map((c) => c!.credit);
  await db.project.update({ where: { id: projectId }, data: { attributions: JSON.stringify(credits) } });
  const localClips = clips.map((c) => {
    if (!c) return null;
    const dest = path.join(work, `clip-${path.basename(c.file)}`);
    if (!fs.existsSync(dest)) fs.linkSync(c.file, dest);
    return dest;
  });

  // 3. Voice
  await stage("voicing", 0.35);
  const narr = await narrate(sb, o, work, demo);
  const secs = timeScenes(sb.scenes.map((s) => s.durationSec), narr, o.duration);

  // 4. Render
  await stage("rendering", 0.45);
  const props: AdProps = {
    template: o.style === "minimal" ? "minimal" : "business",
    style: o.style, title: sb.title, businessName: o.businessName, demo,
    logoUrl: o.logoPath ? await assetUrl(mediaPath(o.logoPath)) : undefined,
    cta: sb.cta,
    scenes: await Promise.all(sb.scenes.map(async (s, i) => ({
      durationInFrames: Math.round(secs[i] * FPS),
      narrationFrames: Math.round(narr[i].duration * FPS),
      clipUrl: localClips[i] ? await assetUrl(localClips[i]!) : undefined,
      audioUrl: await assetUrl(narr[i].file),
      headline: s.headline, subtitle: s.subtitle, motion: s.motion,
    }))),
  };
  const out = path.join(work, "video.mp4");
  let last = 0;
  const p = await renderVideo(props, out, (pr) => {
    if (pr - last < 0.05) return;
    last = pr;
    void db.job.update({ where: { id: jobId }, data: { progress: 0.45 + pr * 0.55 } }).catch(() => {});
  });
  log(`rendered ${p.duration.toFixed(2)}s ${p.streams.map((s) => s.codec_name).join("+")}`);
  await db.project.update({ where: { id: projectId }, data: { status: "completed", outputPath: path.relative(config.mediaDir, out), error: null } });
  // Remove intermediate files, keep video + voice for debugging retries.
  for (const f of fs.readdirSync(work)) if (f.startsWith("clip-")) fs.rmSync(path.join(work, f), { force: true });
  return p;
}
