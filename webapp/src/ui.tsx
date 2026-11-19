import { useEffect, useRef, useState, type ReactNode } from "react";
import { STATUS_COLOR, type Template } from "./api";

export function Button({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "light" | "danger" }) {
  const v = {
    primary: "bg-gradient-to-r from-violet-500 to-pink-500 text-white shadow-lg shadow-violet-950/50",
    ghost: "border border-line bg-card text-zinc-200",
    light: "bg-white text-ink",
    danger: "border border-red-500/30 bg-red-500/10 text-red-300",
  }[variant];
  return <button type="button" {...p} className={`w-full rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition active:scale-[.98] disabled:opacity-40 disabled:active:scale-100 ${v} ${className}`} />;
}

/** `<label>` only around a single text control; groups of buttons get a plain container (a label would forward taps to its first button). */
export const Field = ({ label, hint, error, children, required, group }: { label: string; hint?: string; error?: string; children: ReactNode; required?: boolean; group?: boolean }) => {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block" {...(group ? { role: "group", "aria-label": label } : {})}>
      <div className="mb-1.5 text-[13px] font-medium text-zinc-400">{label}{required && <span className="text-pink-400"> *</span>}</div>
      {children}
      {hint && !error && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
      {error && <div className="mt-1 text-xs text-red-400">{error}</div>}
    </Tag>
  );
};

const inputCls = "w-full rounded-2xl border border-line bg-card px-3.5 py-3 text-[15px] outline-none transition placeholder:text-zinc-600 focus:border-violet-500";
export const Input = ({ value, onChange, ...p }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void }) => (
  <input {...p} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
);
export const TextArea = ({ value, onChange, ...p }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void }) => (
  <textarea {...p} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} resize-none`} />
);

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-2xl border border-line bg-card p-1">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)} className={`flex-1 rounded-xl py-2 text-sm transition ${v === value ? "bg-gradient-to-r from-violet-500/90 to-pink-500/90 font-semibold text-white" : "text-zinc-400"}`}>{l}</button>
      ))}
    </div>
  );
}

export const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] transition ${active ? "bg-white font-semibold text-ink" : "border border-line bg-card text-zinc-300"}`}>{children}</button>
);

export const StatusBadge = ({ status, label }: { status: string; label: string }) => (
  <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${STATUS_COLOR[status] ?? "bg-zinc-700 text-zinc-300 ring-zinc-600"}`}>{label}</span>
);

export const Card = ({ className = "", children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) =>
  onClick
    ? <button type="button" onClick={onClick} className={`block w-full rounded-3xl border border-line bg-card p-4 text-left transition active:scale-[.99] ${className}`}>{children}</button>
    : <div className={`rounded-3xl border border-line bg-card p-4 ${className}`}>{children}</div>;

export const Empty = ({ icon, title, text, action }: { icon: string; title: string; text?: string; action?: ReactNode }) => (
  <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
    <div className="mb-2 text-3xl">{icon}</div>
    <div className="font-semibold">{title}</div>
    {text && <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-400">{text}</p>}
    {action && <div className="mx-auto mt-4 max-w-xs">{action}</div>}
  </div>
);

export const Spinner = () => <div className="flex justify-center py-10"><div className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-violet-400" /></div>;
export const ErrorText = ({ children }: { children?: ReactNode }) => (children ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">{children}</p> : null);
export const H1 = ({ children, sub }: { children: ReactNode; sub?: ReactNode }) => (
  <div className="mb-4"><h1 className="text-[22px] font-bold leading-tight">{children}</h1>{sub && <p className="mt-1 text-sm text-zinc-400">{sub}</p>}</div>
);

const CAT_EMOJI: [RegExp, string][] = [[/umra|haj/i, "🕋"], [/ichki|o‘zbek|uzbek/i, "🏔"], [/aksiya|last/i, "🔥"], [/brend|imidj/i, "🏢"], [/xorij/i, "🌴"]];
const catEmoji = (c: string) => CAT_EMOJI.find(([r]) => r.test(c))?.[1] ?? "🎬";
const GRADS = ["from-violet-600 to-fuchsia-500", "from-sky-600 to-cyan-400", "from-amber-500 to-pink-500", "from-emerald-600 to-teal-400", "from-rose-600 to-orange-400", "from-indigo-600 to-violet-400"];

/** 9:16 template cover: preview video (muted loop while visible), poster or gradient placeholder. */
export function Cover({ t, className = "", controls = false }: { t: Pick<Template, "id" | "title" | "category" | "previewUrl" | "posterUrl">; className?: string; controls?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || controls) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [controls]);
  useEffect(() => {
    const el = ref.current;
    if (!el || controls) return;
    if (visible) el.play().catch(() => {}); else el.pause();
  }, [visible, controls]);
  return (
    <div className={`relative aspect-[9/16] overflow-hidden rounded-2xl bg-gradient-to-br ${GRADS[t.id % GRADS.length]} ${className}`}>
      {t.previewUrl ? (
        <video ref={ref} src={t.previewUrl} poster={t.posterUrl ?? undefined} muted={!controls} loop playsInline controls={controls} preload={controls ? "auto" : "metadata"} className="absolute inset-0 h-full w-full object-cover" />
      ) : t.posterUrl ? (
        <img src={t.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
          <div className="text-4xl drop-shadow">{catEmoji(t.category)}</div>
          <div className="mt-2 text-sm font-bold leading-tight drop-shadow">{t.title}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-white/70">namuna tez orada</div>
        </div>
      )}
    </div>
  );
}

export const Steps = ({ step, labels }: { step: number; labels: string[] }) => (
  <div className="mb-5 flex gap-1.5">
    {labels.map((l, i) => (
      <div key={l} className="flex-1">
        <div className={`h-1 rounded-full ${i <= step ? "bg-gradient-to-r from-violet-500 to-pink-500" : "bg-line"}`} />
        <div className={`mt-1.5 text-[11px] ${i === step ? "text-white" : "text-zinc-500"}`}>{l}</div>
      </div>
    ))}
  </div>
);

export const Row = ({ k, v }: { k: string; v: ReactNode }) =>
  v ? <div className="flex justify-between gap-4 border-b border-line py-2.5 text-sm last:border-0"><span className="shrink-0 text-zinc-400">{k}</span><span className="text-right">{v}</span></div> : null;
