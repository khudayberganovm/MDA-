import { useCallback, useEffect, useRef, useState } from "react";
import { api, tg, type Me, type Project } from "./api";

type Tab = "home" | "create" | "projects" | "profile";
const STATUS: Record<string, [string, string]> = {
  draft: ["Qoralama", "bg-zinc-600"], queued: ["Navbatda", "bg-zinc-500"], planning: ["Ssenariy yozilmoqda", "bg-violet-500"],
  sourcing: ["Kadrlar tanlanmoqda", "bg-violet-500"], voicing: ["Ovoz yozilmoqda", "bg-fuchsia-500"], rendering: ["Render qilinmoqda", "bg-pink-500"],
  completed: ["Tayyor", "bg-emerald-500"], failed: ["Xatolik", "bg-red-500"],
};
const busy = (s: string) => !["completed", "failed", "draft"].includes(s);

export function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [me, setMe] = useState<Me | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setProjects(await api<Project[]>("/api/projects")); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { api<Me>("/api/me").then(setMe).catch((e) => setErr(e.message)); load(); }, [load]);
  useEffect(() => {
    if (!projects.some((p) => busy(p.status))) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [projects, load]);

  if (err === "unauthorized") return <Center>Iltimos, ilovani Telegram orqali oching.</Center>;
  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <div className="text-xl font-black tracking-tight">MOTION <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">AI</span></div>
        {me?.demoMode && !me.providers.anthropic && <span className="rounded-full border border-amber-400/40 px-2.5 py-1 text-[11px] text-amber-300">DEMO rejim</span>}
      </header>
      <div key={tab} className="fade-in">
        {tab === "home" && <Home me={me} projects={projects} onCreated={load} go={setTab} />}
        {tab === "create" && <CreateForm me={me} onCreated={() => { load(); setTab("projects"); }} />}
        {tab === "projects" && <ProjectList projects={projects} />}
        {tab === "profile" && <Profile me={me} count={projects.length} />}
      </div>
      <Nav tab={tab} setTab={setTab} />
    </div>
  );
}

const Center = ({ children }: { children: React.ReactNode }) => <div className="flex min-h-screen items-center justify-center p-8 text-center text-zinc-300">{children}</div>;

function Nav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: [Tab, string, string][] = [["home", "Bosh sahifa", "⌂"], ["create", "Video yaratish", "＋"], ["projects", "Videolarim", "▶"], ["profile", "Profil", "◉"]];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {items.map(([k, label, icon]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex flex-col items-center gap-1 py-3 text-[11px] transition ${tab === k ? "text-white" : "text-zinc-500"}`}>
            <span className={`text-lg leading-none ${tab === k ? "bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent" : ""}`}>{icon}</span>{label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Home({ me, projects, onCreated, go }: { me: Me | null; projects: Project[]; onCreated: () => void; go: (t: Tab) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-400">Assalomu alaykum{me ? `, ${me.user.name.split(" ")[0]}` : ""} 👋</p>
        <h1 className="mt-1 text-2xl font-bold">Bugun qanday video yaratamiz?</h1>
      </div>
      <div className="glow rounded-3xl border border-line p-5">
        <div className="mb-1 text-lg font-bold">AI Video yaratish</div>
        <p className="mb-4 text-sm text-zinc-400">Matn yozing — ssenariy, kadrlar, ovoz va subtitrlarni AI tayyorlaydi.</p>
        <QuickCreate me={me} onCreated={onCreated} />
        <button onClick={() => go("create")} className="mt-3 w-full text-center text-xs text-zinc-400 underline-offset-4 hover:underline">Batafsil sozlamalar →</button>
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">So‘nggi loyihalar</h2>
          {projects.length > 3 && <button onClick={() => go("projects")} className="text-xs text-violet-300">Barchasi</button>}</div>
        <ProjectList projects={projects.slice(0, 3)} />
      </section>
    </div>
  );
}

function QuickCreate({ me, onCreated }: { me: Me | null; onCreated: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<"" | "sending" | "ok" | string>("");
  const submit = async () => {
    setState("sending");
    try {
      await api("/api/projects", { method: "POST", body: JSON.stringify({ prompt, options: { duration: 30, language: me?.user.language ?? "uz", voice: "male", style: "professional" } }) });
      setPrompt(""); setState("ok"); tg?.HapticFeedback?.impactOccurred("medium"); onCreated();
    } catch (e) { setState(errText(e)); }
  };
  return (
    <>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} maxLength={1500}
        placeholder="Masalan: 30 soniyalik konditsioner reklamasi. O‘zbekcha erkak ovozi, yozgi issiq havo kadrlari va oxirida buyurtma berishga chaqiruv."
        className="w-full resize-none rounded-2xl border border-line bg-ink/70 p-3.5 text-sm outline-none placeholder:text-zinc-500 focus:border-violet-500" />
      <PrimaryButton disabled={prompt.trim().length < 10 || state === "sending"} onClick={submit}>{state === "sending" ? "Yuborilmoqda…" : "Video yaratish"}</PrimaryButton>
      {state === "ok" && <p className="mt-2 text-xs text-emerald-400">Qabul qilindi! Tayyor bo‘lgach Telegramga yuboramiz.</p>}
      {state && !["ok", "sending"].includes(state) && <p className="mt-2 text-xs text-red-400">{state}</p>}
    </>
  );
}

const errText = (e: unknown) => {
  const x = e as { status?: number; message: string; body?: { issues?: string[] } };
  if (x.status === 429) return "Kunlik limit yoki faol videolar soniga yetdingiz. Keyinroq urinib ko‘ring.";
  if (x.status === 400) return "Ma’lumotlar noto‘g‘ri: " + (x.body?.issues?.join("; ") ?? x.message);
  return "Xatolik yuz berdi. Qayta urinib ko‘ring.";
};

const PrimaryButton = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className="mt-3 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-pink-500 py-3.5 font-semibold shadow-lg shadow-violet-900/40 transition active:scale-[.98] disabled:opacity-40" />
);

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-2xl border border-line bg-ink/60 p-1">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)} className={`flex-1 rounded-xl py-2 text-sm transition ${v === value ? "bg-gradient-to-r from-violet-500/80 to-pink-500/80 font-semibold" : "text-zinc-400"}`}>{l}</button>
      ))}
    </div>
  );
}

function CreateForm({ me, onCreated }: { me: Me | null; onCreated: () => void }) {
  const [f, setF] = useState({ prompt: "", duration: 30 as 15 | 30, language: (me?.user.language ?? "uz") as "uz" | "ru", voice: "male" as "male" | "female", style: "professional" as "professional" | "dynamic" | "minimal", cta: "", businessName: "" });
  const [logo, setLogo] = useState<{ path: string; name: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const voiceAvail = me?.voices[f.language];

  const upload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) return setMsg("Logo 2 MB dan oshmasin.");
    const fd = new FormData(); fd.append("file", file);
    try { const r = await api<{ logoPath: string }>("/api/uploads/logo", { method: "POST", body: fd }); setLogo({ path: r.logoPath, name: file.name }); setMsg(""); }
    catch { setMsg("Faqat PNG yoki JPEG yuklash mumkin."); }
  };
  const submit = async () => {
    setSending(true); setMsg("");
    try {
      const { prompt, ...options } = f;
      await api("/api/projects", { method: "POST", body: JSON.stringify({ prompt, options: { ...options, logoPath: logo?.path } }) });
      tg?.HapticFeedback?.impactOccurred("medium"); onCreated();
    } catch (e) { setMsg(errText(e)); } finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Video yaratish</h1>
      <Field label="So‘rov (prompt)">
        <textarea value={f.prompt} onChange={(e) => set("prompt", e.target.value)} rows={5} maxLength={1500} placeholder="Qanday reklama kerakligini yozing…"
          className="w-full resize-none rounded-2xl border border-line bg-card p-3.5 text-sm outline-none focus:border-violet-500" />
      </Field>
      <Field label="Davomiylik"><Segmented value={f.duration} onChange={(v) => set("duration", v)} options={[[15, "15 soniya"], [30, "30 soniya"]]} /></Field>
      <Field label="Til"><Segmented value={f.language} onChange={(v) => set("language", v)} options={[["uz", "O‘zbekcha"], ["ru", "Русский"]]} /></Field>
      <Field label="Ovoz" hint={me && me.providers.elevenlabs && voiceAvail && !voiceAvail[f.voice] ? "Bu ovoz serverda sozlanmagan" : undefined}>
        <Segmented value={f.voice} onChange={(v) => set("voice", v)} options={[["male", "Erkak"], ["female", "Ayol"]]} />
      </Field>
      <Field label="Uslub"><Segmented value={f.style} onChange={(v) => set("style", v)} options={[["professional", "Professional"], ["dynamic", "Dinamik"], ["minimal", "Minimal"]]} /></Field>
      <Field label="Biznes nomi (ixtiyoriy)"><Input value={f.businessName} maxLength={60} onChange={(v) => set("businessName", v)} placeholder="Masalan: Salqin Havo" /></Field>
      <Field label="CTA matni (ixtiyoriy)"><Input value={f.cta} maxLength={80} onChange={(v) => set("cta", v)} placeholder="Hoziroq buyurtma bering" /></Field>
      <Field label="Logo (ixtiyoriy, PNG/JPEG, 2 MB gacha)">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-2xl border border-dashed border-line bg-card py-3 text-sm text-zinc-400">{logo ? `✓ ${logo.name}` : "Logo yuklash"}</button>
      </Field>
      {me?.demoMode && !me.providers.anthropic && <p className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">DEMO rejim: AI kalitlari sozlanmagan. Namuna ssenariy va namunaviy ovoz ishlatiladi (bu AI natijasi emas).</p>}
      <PrimaryButton disabled={f.prompt.trim().length < 10 || sending} onClick={submit}>{sending ? "Yuborilmoqda…" : "Video yaratish"}</PrimaryButton>
      {msg && <p className="text-sm text-red-400">{msg}</p>}
    </div>
  );
}

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block"><div className="mb-1.5 text-xs font-medium text-zinc-400">{label}</div>{children}{hint && <div className="mt-1 text-xs text-amber-300">{hint}</div>}</label>
);
const Input = ({ value, onChange, ...p }: { value: string; onChange: (v: string) => void; maxLength: number; placeholder: string }) => (
  <input {...p} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-line bg-card px-3.5 py-3 text-sm outline-none focus:border-violet-500" />
);

function ProjectList({ projects }: { projects: Project[] }) {
  if (!projects.length) return <div className="rounded-3xl border border-line bg-card p-6 text-center text-sm text-zinc-400">Hali videolar yo‘q. Birinchi videongizni yarating!</div>;
  return <div className="space-y-3">{projects.map((p) => <ProjectCard key={p.id} p={p} />)}</div>;
}

function ProjectCard({ p }: { p: Project }) {
  const [label, color] = STATUS[p.status] ?? [p.status, "bg-zinc-600"];
  const download = async () => {
    const { url } = await api<{ url: string }>(`/api/projects/${p.id}/download-link`, { method: "POST" });
    if (tg?.downloadFile) tg.downloadFile({ url, file_name: `motion-ai-${p.id}.mp4` });
    else if (tg?.initData) tg.openLink(url);
    else window.location.href = url;
  };
  return (
    <div className="rounded-3xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="line-clamp-2 text-sm">{p.prompt}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${color}`}>{label}</span>
      </div>
      <div className="mt-2 text-xs text-zinc-500">{new Date(p.createdAt).toLocaleString("uz-UZ")} · {p.duration}s{p.demo ? " · DEMO" : ""}</div>
      {busy(p.status) && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all" style={{ width: `${Math.max(5, p.progress * 100)}%` }} /></div>}
      {p.status === "failed" && p.error && <p className="mt-2 text-xs text-red-400">{p.error}</p>}
      {p.hasVideo && <button onClick={download} className="mt-3 w-full rounded-2xl bg-white py-2.5 text-sm font-semibold text-ink active:scale-[.98]">⬇ Yuklab olish</button>}
      {p.attributions?.length > 0 && <p className="mt-2 text-[10px] text-zinc-500">Videolar: {p.attributions.map((a) => a.author).join(", ")} / Pexels</p>}
    </div>
  );
}

function Profile({ me, count }: { me: Me | null; count: number }) {
  const [lang, setLang] = useState(me?.user.language ?? "uz");
  useEffect(() => { if (me) setLang(me.user.language); }, [me]);
  if (!me) return null;
  const save = async (l: "uz" | "ru") => { setLang(l); await api("/api/me", { method: "PATCH", body: JSON.stringify({ language: l }) }); };
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between border-b border-line py-3 text-sm last:border-0"><span className="text-zinc-400">{k}</span><span>{v}</span></div>;
  const on = (b: boolean) => (b ? <span className="text-emerald-400">ulangan</span> : <span className="text-zinc-500">o‘chiq</span>);
  return (
    <div className="space-y-4">
      <div className="glow flex items-center gap-4 rounded-3xl border border-line p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-xl font-bold">{me.user.name[0]}</div>
        <div><div className="font-bold">{me.user.name}</div><div className="text-sm text-zinc-400">{me.user.username ? `@${me.user.username}` : `ID ${me.user.telegramId}`}</div></div>
      </div>
      <div className="rounded-3xl border border-line bg-card px-4">
        {row("Videolar", count)}
        {row("Ro‘yxatdan o‘tgan", new Date(me.user.createdAt).toLocaleDateString("uz-UZ"))}
        {row("Claude AI", on(me.providers.anthropic))}
        {row("Pexels", on(me.providers.pexels))}
        {row("ElevenLabs", on(me.providers.elevenlabs))}
      </div>
      <Field label="Interfeys / bot tili"><Segmented value={lang} onChange={save} options={[["uz", "O‘zbekcha"], ["ru", "Русский"]]} /></Field>
    </div>
  );
}
