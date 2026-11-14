import React from "react";
import { AbsoluteFill, Html5Audio, Img, interpolate, OffthreadVideo, Sequence, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import type { AdProps, Motion, SceneProps } from "./types";

const FONT = "Inter, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif";
const ACCENTS = { professional: ["#8b5cf6", "#ec4899"], dynamic: ["#f472b6", "#f59e0b"], minimal: ["#a78bfa", "#60a5fa"] } as const;
const FADE = 10; // frames for scene in/out fades

function enter(motion: Motion, f: number, fps: number, speed = 1) {
  const s = spring({ frame: f * speed, fps, config: { damping: 18, mass: 0.8 } });
  switch (motion) {
    case "slide": return { opacity: s, transform: `translateX(${(1 - s) * 120}px)` };
    case "scale": return { opacity: s, transform: `scale(${0.7 + 0.3 * s})` };
    case "zoom": return { opacity: s, transform: `scale(${1.4 - 0.4 * s})` };
    default: return { opacity: interpolate(f, [0, 15], [0, 1], { extrapolateRight: "clamp" }), transform: "none" };
  }
}

/** Word-by-word highlighted caption, timed evenly across the narration. */
const Captions: React.FC<{ text: string; frames: number; accent: string }> = ({ text, frames, accent }) => {
  const f = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  const active = Math.min(words.length - 1, Math.floor((f / Math.max(1, frames)) * words.length));
  const o = interpolate(f, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 70, right: 70, bottom: 260, textAlign: "center", opacity: o }}>
      <div style={{ display: "inline", fontFamily: FONT, fontWeight: 800, fontSize: 58, lineHeight: 1.35, color: "white", textShadow: "0 4px 24px rgba(0,0,0,.6)" }}>
        {words.map((w, i) => (
          <span key={i} style={{ padding: "2px 8px", borderRadius: 12, background: i === active ? accent : "transparent", color: i <= active ? "white" : "rgba(255,255,255,.75)" }}>{w} </span>
        ))}
      </div>
    </div>
  );
};

const Typography: React.FC<{ a: string; b: string; seed: number }> = ({ a, b, seed }) => {
  const f = useCurrentFrame();
  const r = (n: number) => Math.sin(seed * 999 + n) * 0.5 + 0.5;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${160 + f * 0.3}deg, #0d0b14 0%, #1d1430 45%, #0d0b14 100%)` }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{
          position: "absolute", width: 380 + r(i) * 420, height: 380 + r(i) * 420, borderRadius: "50%",
          left: `${r(i + 10) * 70}%`, top: `${r(i + 20) * 80}%`, filter: "blur(70px)", opacity: 0.45,
          background: i % 2 ? a : b, transform: `translate(-50%,-50%) translate(${Math.sin((f + i * 40) / 40) * 60}px, ${Math.cos((f + i * 30) / 50) * 80}px)`,
        }} />
      ))}
    </AbsoluteFill>
  );
};

const Scene: React.FC<{ s: SceneProps; i: number; p: AdProps; isLast: boolean }> = ({ s, i, p, isLast }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [a, b] = ACCENTS[p.style];
  const minimal = p.template === "minimal";
  const speed = p.style === "dynamic" ? 1.6 : 1;
  const fade = interpolate(f, [0, FADE, s.durationInFrames - FADE, s.durationInFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const kenBurns = interpolate(f, [0, s.durationInFrames], [1.0, p.style === "dynamic" ? 1.18 : 1.1], { easing: Easing.inOut(Easing.ease) });
  const h = enter(s.motion, f - 4, fps, speed);
  const ctaStart = Math.max(10, s.durationInFrames - Math.min(75, s.durationInFrames * 0.55));
  const cta = spring({ frame: f - ctaStart, fps, config: { damping: 12 } });
  const pulse = 1 + Math.sin(f / 6) * 0.03;

  return (
    <AbsoluteFill style={{ opacity: i === 0 && f < FADE ? 1 : fade, backgroundColor: "#0d0b14" }}>
      {s.clipUrl && !minimal ? (
        <AbsoluteFill style={{ transform: `scale(${kenBurns})` }}>
          <OffthreadVideo src={s.clipUrl} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      ) : <Typography a={a} b={b} seed={i + 1} />}
      {!minimal && <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 55%, rgba(0,0,0,.8) 100%)" }} />}

      <div style={{ position: "absolute", top: minimal ? 620 : 230, left: 80, right: 80, textAlign: minimal ? "center" : "left", ...h }}>
        {!minimal && <div style={{ width: 120, height: 10, borderRadius: 5, marginBottom: 28, background: `linear-gradient(90deg, ${a}, ${b})` }} />}
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: minimal ? 112 : 96, lineHeight: 1.05, color: "white", letterSpacing: -2, textShadow: "0 6px 30px rgba(0,0,0,.5)" }}>{s.headline}</div>
      </div>

      {!isLast && <Captions text={s.subtitle} frames={s.narrationFrames} accent={a} />}

      {isLast && (
        <div style={{ position: "absolute", left: 80, right: 80, bottom: 260, textAlign: "center", opacity: cta, transform: `translateY(${(1 - cta) * 80}px)` }}>
          {p.logoUrl && <Img src={p.logoUrl} style={{ maxWidth: 260, maxHeight: 200, objectFit: "contain", marginBottom: 36 }} />}
          {p.businessName && <div style={{ fontFamily: FONT, color: "white", fontSize: 54, fontWeight: 700, marginBottom: 30 }}>{p.businessName}</div>}
          <div style={{ display: "inline-block", padding: "34px 64px", borderRadius: 999, fontFamily: FONT, fontWeight: 900, fontSize: 60, color: "white",
            background: `linear-gradient(90deg, ${a}, ${b})`, boxShadow: `0 20px 60px ${a}88`, transform: `scale(${pulse})` }}>{p.cta.text}</div>
          {p.cta.subtext && p.cta.subtext !== p.businessName && <div style={{ fontFamily: FONT, color: "rgba(255,255,255,.85)", fontSize: 40, marginTop: 28 }}>{p.cta.subtext}</div>}
        </div>
      )}
      {s.audioUrl && <Html5Audio src={s.audioUrl} />}
    </AbsoluteFill>
  );
};

export const Ad: React.FC<AdProps> = (p) => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0b14" }}>
      {p.scenes.map((s, i) => {
        const el = (
          <Sequence key={i} from={from} durationInFrames={s.durationInFrames}>
            <Scene s={s} i={i} p={p} isLast={i === p.scenes.length - 1} />
          </Sequence>
        );
        from += s.durationInFrames;
        return el;
      })}
      {p.demo && (
        <div style={{ position: "absolute", top: 60, right: 60, padding: "10px 22px", borderRadius: 999, background: "rgba(0,0,0,.55)", color: "white", fontFamily: FONT, fontSize: 30, fontWeight: 700 }}>DEMO</div>
      )}
    </AbsoluteFill>
  );
};
