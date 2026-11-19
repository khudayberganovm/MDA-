import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./App";
import {
  api, confirmBox, dateTime, haptic, INCLUDES, money, openUrl, post, tg, upload,
  type Agency, type Brief, type FileRef, type OrderFull, type OrderListItem, type Pkg, type PayProvider, type PurchaseStart, type Template,
} from "./api";
import { Button, Card, Chip, Cover, Empty, ErrorText, Field, H1, Input, Row, Segmented, Spinner, StatusBadge, Steps, TextArea } from "./ui";

const errMsg = (e: unknown) => (e as Error).message || "Xatolik yuz berdi";

// ================= Catalog =================
export function CatalogTab() {
  const { me, catalog, push, setTab } = useApp();
  const cats = useMemo(() => [...new Set(catalog.templates.map((t) => t.category))], [catalog]);
  const [cat, setCat] = useState("");
  const list = catalog.templates.filter((t) => !cat || t.category === cat);
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div className="text-xl font-black tracking-tight">MOTION <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">AI</span></div>
        <button onClick={() => setTab("packages")} className="rounded-full border border-line bg-card px-3 py-1.5 text-xs">
          Balans: <b className="text-white">{me.user.credits} video</b>
        </button>
      </header>
      <div className="glow rounded-3xl border border-line p-5">
        <div className="text-[13px] text-zinc-300">Turagentliklar uchun</div>
        <h1 className="mt-1 text-[22px] font-bold leading-tight">Turlaringizni sotadigan reklama videolari</h1>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-zinc-300">
          {[["🎞", "Shablon tanlang"], ["✍️", "Tur haqida yozing"], ["📲", "Videoni Telegramda oling"]].map(([i, l]) => (
            <div key={l} className="rounded-2xl bg-black/25 px-2 py-3"><div className="text-lg">{i}</div>{l}</div>
          ))}
        </div>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Chip active={!cat} onClick={() => setCat("")}>Barchasi</Chip>
        {cats.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
      </div>
      {list.length === 0 ? <Empty icon="🎞" title="Shablonlar tez orada" /> : (
        <div className="grid grid-cols-2 gap-3">
          {list.map((t) => (
            <button key={t.id} onClick={() => push({ name: "template", t })} className="text-left transition active:scale-[.98]">
              <Cover t={t} />
              <div className="mt-2 line-clamp-1 text-sm font-semibold">{t.title}</div>
              <div className="text-xs text-zinc-500">{t.category} · {t.durationSec}s</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TemplateScreen({ t }: { t: Template }) {
  const { me, push } = useApp();
  const perks = ["Professional montaj va musiqa", "Subtitr va animatsiyalar", "Logo, telefon va Instagram oxirida", `${me.revisionsPerOrder} ta bepul tahrir`, "Tayyor video Telegramga keladi"];
  return (
    <div className="space-y-5 pt-8">
      <Cover t={t} controls className="mx-auto max-w-[280px] shadow-2xl shadow-violet-950/50" />
      <div>
        <div className="text-xs text-zinc-400">{t.category}</div>
        <h1 className="mt-1 text-[22px] font-bold">{t.title}</h1>
        <div className="mt-2 flex gap-2 text-xs text-zinc-300"><span className="rounded-full bg-card px-2.5 py-1 ring-1 ring-line">{t.durationSec} soniya</span><span className="rounded-full bg-card px-2.5 py-1 ring-1 ring-line">{t.format}</span></div>
        {t.description && <p className="mt-3 text-[15px] leading-relaxed text-zinc-300">{t.description}</p>}
      </div>
      <Card><ul className="space-y-2 text-sm">{perks.map((p) => <li key={p} className="flex gap-2"><span className="text-emerald-400">✓</span>{p}</li>)}</ul></Card>
      <Button onClick={() => push({ name: "wizard", t })}>Shu shablon bilan buyurtma berish</Button>
    </div>
  );
}

// ================= Agency profile =================
export function AgencyForm({ initial, onSaved, submitLabel = "Saqlash" }: { initial: Agency | null; onSaved: () => void; submitLabel?: string }) {
  const { reloadMe, toast } = useApp();
  const [f, setF] = useState({ name: initial?.name ?? "", instagram: initial?.instagram ?? "", phone: initial?.phone ?? "+998 ", telegram: initial?.telegram ?? "", city: initial?.city ?? "" });
  const [logo, setLogo] = useState<{ id: string | null; url: string | null }>({ id: initial?.logoFileId ?? null, url: initial?.logoUrl ?? null });
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const pick = async (file: File) => {
    setErr(""); setBusy("logo");
    try { const r = await upload<{ id: string }>("/api/uploads/logo", file); setLogo({ id: r.id, url: URL.createObjectURL(file) }); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(""); }
  };
  const save = async () => {
    setErr(""); setBusy("save");
    try {
      await api("/api/agency", { method: "PUT", body: JSON.stringify({ ...f, logoFileId: logo.id }) });
      await reloadMe(); haptic("success"); toast("Saqlandi ✅"); onSaved();
    } catch (e) { setErr(errMsg(e)); haptic("error"); } finally { setBusy(""); }
  };
  const valid = f.name.trim().length >= 2 && f.instagram.trim().length >= 1 && f.phone.replace(/\D/g, "").length >= 7;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => ref.current?.click()} className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-dashed border-line bg-card text-xs text-zinc-400">
          {busy === "logo" ? "…" : logo.url ? <img src={logo.url} alt="" className="h-full w-full object-contain" /> : "Logo"}
        </button>
        <div className="text-sm text-zinc-400">Agentlik logosi<br /><span className="text-xs text-zinc-500">PNG yoki JPG, 5 MB gacha. Videoning oxirida ko‘rsatiladi.</span></div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      </div>
      <Field label="Agentlik nomi" required><Input value={f.name} onChange={set("name")} maxLength={80} placeholder="Masalan: Sayohat Tour" /></Field>
      <Field label="Instagram sahifa" required hint="@nom yoki havola"><Input value={f.instagram} onChange={set("instagram")} maxLength={120} placeholder="@sayohat.tour" autoCapitalize="off" /></Field>
      <Field label="Telefon" required><Input value={f.phone} onChange={set("phone")} maxLength={30} inputMode="tel" placeholder="+998 90 123 45 67" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Telegram"><Input value={f.telegram} onChange={set("telegram")} maxLength={40} placeholder="@admin" autoCapitalize="off" /></Field>
        <Field label="Shahar"><Input value={f.city} onChange={set("city")} maxLength={60} placeholder="Toshkent" /></Field>
      </div>
      <ErrorText>{err}</ErrorText>
      <Button disabled={!valid || !!busy} onClick={save}>{busy === "save" ? "Saqlanmoqda…" : submitLabel}</Button>
    </div>
  );
}

// ================= Order wizard =================
type Upl = { key: string; name: string; progress: number; file?: FileRef; error?: string };

export function WizardScreen({ t }: { t: Template }) {
  const { me, catalog, reset, reloadMe, push, toast } = useApp();
  const [needAgency] = useState(() => !me.agency); // fixed at start: saving the profile must not shift the steps
  const labels = [...(needAgency ? ["Agentlik"] : []), "Tur", "Materiallar", "Tasdiqlash"];
  const [step, setStep] = useState(0);
  const offset = needAgency ? 1 : 0;
  const [b, setB] = useState<Brief>({ destination: "", dates: "", price: "", includes: [], hotel: "", offer: "", phone: me.agency?.phone ?? "", language: me.user.language, voice: "male", extra: "" });
  const [files, setFiles] = useState<Upl[]>([]);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [pkgId, setPkgId] = useState<number | null>(catalog.packages[0]?.id ?? null);
  const [provider, setProvider] = useState<PayProvider | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Brief>(k: K) => (v: Brief[K]) => setB((s) => ({ ...s, [k]: v }));
  const next = () => { setErr(""); setStep((s) => s + 1); window.scrollTo(0, 0); };
  const cur = step - offset; // 0 tour, 1 materials, 2 confirm
  const agencyPhone = me.agency?.phone;
  useEffect(() => { if (agencyPhone) setB((s) => (s.phone ? s : { ...s, phone: agencyPhone })); }, [agencyPhone]);

  const addFiles = async (list: FileList) => {
    const room = 10 - files.length;
    for (const file of Array.from(list).slice(0, room)) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setFiles((s) => [...s, { key, name: file.name, progress: 0 }]);
      try {
        const r = await upload<FileRef>("/api/uploads/material", file, (p) => setFiles((s) => s.map((x) => (x.key === key ? { ...x, progress: p } : x))));
        setFiles((s) => s.map((x) => (x.key === key ? { ...x, progress: 1, file: r } : x)));
      } catch (e) { setFiles((s) => s.map((x) => (x.key === key ? { ...x, error: errMsg(e) } : x))); }
    }
  };

  const ensureOrder = async () => {
    if (orderId) return orderId;
    const o = await post<OrderFull>("/api/orders", { templateId: t.id, brief: b, fileIds: files.filter((f) => f.file).map((f) => f.file!.id) });
    setOrderId(o.id);
    return o;
  };
  const submitWithCredit = async () => {
    setBusy(true); setErr("");
    try {
      const o = await ensureOrder();
      const id = typeof o === "number" ? o : o.id;
      if (typeof o === "number") await post(`/api/orders/${id}/submit`);
      await reloadMe(); haptic("success"); toast("Buyurtma yuborildi ✅");
      reset({ name: "order", id });
    } catch (e) { setErr(errMsg(e)); haptic("error"); } finally { setBusy(false); }
  };
  const pay = async () => {
    if (!pkgId || !provider) return;
    setBusy(true); setErr("");
    try {
      const o = await ensureOrder();
      const id = typeof o === "number" ? o : o.id;
      const p = await post<PurchaseStart>("/api/purchases", { packageId: pkgId, provider, orderId: id });
      push({ name: "pay", purchase: p, orderId: id });
    } catch (e) { setErr(errMsg(e)); haptic("error"); } finally { setBusy(false); }
  };

  const uploading = files.some((f) => !f.file && !f.error);
  return (
    <div className="pt-8">
      <Steps step={step} labels={labels} />
      {needAgency && step === 0 && (
        <>
          <H1 sub="Bir marta to‘ldirasiz — keyingi buyurtmalarda avtomatik ishlatiladi.">Agentlik ma’lumotlari</H1>
          <AgencyForm initial={null} onSaved={next} submitLabel="Davom etish" />
        </>
      )}
      {cur === 0 && (
        <div className="space-y-4">
          <H1 sub={`Shablon: ${t.title}`}>Tur haqida</H1>
          <Field label="Yo‘nalish" required><Input value={b.destination} onChange={set("destination")} maxLength={120} placeholder="Masalan: Turkiya, Antalya" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sanalar"><Input value={b.dates} onChange={set("dates")} maxLength={120} placeholder="10–17 iyun" /></Field>
            <Field label="Narx"><Input value={b.price} onChange={set("price")} maxLength={80} placeholder="650$ dan" /></Field>
          </div>
          <Field group label="Narxga kiradi">
            <div className="flex flex-wrap gap-2">
              {INCLUDES.map(([k, l]) => <Chip key={k} active={b.includes.includes(k)} onClick={() => set("includes")(b.includes.includes(k) ? b.includes.filter((x) => x !== k) : [...b.includes, k])}>{l}</Chip>)}
            </div>
          </Field>
          <Field label="Mehmonxona"><Input value={b.hotel} onChange={set("hotel")} maxLength={120} placeholder="Rixos Premium 5*" /></Field>
          <Field label="Aksiya yoki maxsus taklif"><Input value={b.offer} onChange={set("offer")} maxLength={200} placeholder="Erta bron — 10% chegirma" /></Field>
          <Field label="Videoda ko‘rsatiladigan telefon" required><Input value={b.phone} onChange={set("phone")} maxLength={40} inputMode="tel" /></Field>
          <Field group label="Video tili"><Segmented value={b.language} onChange={set("language")} options={[["uz", "O‘zbekcha"], ["ru", "Русский"]]} /></Field>
          <Field group label="Ovoz"><Segmented value={b.voice} onChange={set("voice")} options={[["male", "Erkak"], ["female", "Ayol"], ["music", "Faqat musiqa"]]} /></Field>
          <Button disabled={b.destination.trim().length < 2 || b.phone.trim().length < 5} onClick={next}>Davom etish</Button>
        </div>
      )}
      {cur === 1 && (
        <div className="space-y-4">
          <H1 sub="Ixtiyoriy: mehmonxona, joylar yoki avvalgi turlaringiz rasm va videolari. 10 tagacha, har biri 50 MB gacha.">Materiallar</H1>
          <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          <button type="button" disabled={files.length >= 10} onClick={() => fileRef.current?.click()} className="w-full rounded-3xl border border-dashed border-line bg-card py-6 text-sm text-zinc-300 disabled:opacity-40">
            <div className="text-2xl">＋</div>Rasm yoki video qo‘shish
          </button>
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.key} className="flex items-center gap-3 rounded-2xl border border-line bg-card px-3 py-2.5 text-sm">
                  <span className="text-lg">{f.error ? "⚠️" : f.file ? (f.file.mime.startsWith("video") ? "🎥" : "🖼") : "⏳"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{f.name}</div>
                    {f.error ? <div className="text-xs text-red-400">{f.error}</div> : !f.file && <div className="mt-1 h-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-violet-400" style={{ width: `${Math.round(f.progress * 100)}%` }} /></div>}
                  </div>
                  <button type="button" onClick={() => setFiles((s) => s.filter((x) => x.key !== f.key))} className="px-1 text-zinc-500">✕</button>
                </div>
              ))}
            </div>
          )}
          <Field label="Qo‘shimcha izoh"><TextArea value={b.extra} onChange={set("extra")} rows={4} maxLength={1500} placeholder="Videoda nimani ta’kidlash kerak? Masalan: oilaviy dam olish, bolalar uchun bepul…" /></Field>
          <Button disabled={uploading} onClick={next}>{uploading ? "Fayllar yuklanmoqda…" : "Davom etish"}</Button>
        </div>
      )}
      {cur === 2 && (
        <div className="space-y-4">
          <H1>Tasdiqlash</H1>
          <Card className="flex gap-3">
            <Cover t={t} className="w-16 shrink-0 rounded-xl" />
            <div className="min-w-0 text-sm">
              <div className="font-semibold">{t.title}</div>
              <div className="text-zinc-400">{t.durationSec}s · {t.format}</div>
              <div className="mt-1 line-clamp-2 text-zinc-300">{b.destination}{b.price && ` · ${b.price}`}</div>
              <div className="mt-1 text-xs text-zinc-500">{files.filter((f) => f.file).length} ta material · {b.language === "uz" ? "O‘zbekcha" : "Русский"}</div>
            </div>
          </Card>
          {me.user.credits > 0 ? (
            <>
              <Card className="text-sm">Balansingizda <b>{me.user.credits} video</b>. Bu buyurtma uchun <b>1 video</b> ishlatiladi.</Card>
              <ErrorText>{err}</ErrorText>
              <Button disabled={busy} onClick={submitWithCredit}>{busy ? "Yuborilmoqda…" : "Buyurtma berish"}</Button>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold">Paketni tanlang</div>
              <PackagePicker value={pkgId} onChange={setPkgId} />
              <ProviderPicker value={provider} onChange={setProvider} />
              <ErrorText>{err}</ErrorText>
              <Button disabled={busy || !pkgId || !provider} onClick={pay}>{busy ? "Kuting…" : `To‘lash — ${money(catalog.packages.find((p) => p.id === pkgId)?.price ?? 0)}`}</Button>
              <p className="text-center text-xs text-zinc-500">Paketdagi qolgan videolar balansingizda saqlanadi.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ================= Packages & payment =================
export function PackagePicker({ value, onChange }: { value: number | null; onChange: (id: number) => void }) {
  const { catalog } = useApp();
  const base = Math.max(...catalog.packages.filter((p) => p.videos === 1).map((p) => p.price), 0);
  return (
    <div className="space-y-2.5">
      {catalog.packages.map((p: Pkg) => {
        const per = Math.round(p.price / p.videos);
        const save = base && p.videos > 1 ? Math.round((1 - per / base) * 100) : 0;
        return (
          <button key={p.id} type="button" onClick={() => onChange(p.id)} className={`relative flex w-full items-center gap-3 rounded-3xl border p-4 text-left transition ${value === p.id ? "border-violet-400 bg-violet-500/10" : "border-line bg-card"}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${value === p.id ? "border-pink-400" : "border-zinc-600"}`}>{value === p.id && <span className="h-2.5 w-2.5 rounded-full bg-pink-400" />}</span>
            <div className="flex-1">
              <div className="font-semibold">{p.title}</div>
              <div className="text-xs text-zinc-400">{money(per)} / video{save > 0 && <span className="text-emerald-400"> · {save}% tejash</span>}</div>
            </div>
            <div className="text-right">
              {p.oldPrice && <div className="text-xs text-zinc-500 line-through">{money(p.oldPrice)}</div>}
              <div className="font-bold">{money(p.price)}</div>
            </div>
            {p.badge && <span className="absolute -top-2 right-4 rounded-full bg-gradient-to-r from-violet-500 to-pink-500 px-2 py-0.5 text-[10px] font-bold">{p.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

const PROVIDERS: [PayProvider, string, string][] = [["payme", "Payme", "Uzcard, Humo"], ["click", "Click", "Uzcard, Humo"], ["manual", "Karta orqali", "O‘tkazma, admin tasdiqlaydi"], ["dev", "Test to‘lov", "faqat lokal sinov"]];
export function ProviderPicker({ value, onChange }: { value: PayProvider | null; onChange: (p: PayProvider) => void }) {
  const { me } = useApp();
  const list = PROVIDERS.filter(([k]) => me.payments[k]);
  useEffect(() => { if (!value && list.length) onChange(list[0][0]); }, [value, list, onChange]);
  if (!list.length) return <ErrorText>To‘lov tizimi hali ulanmagan. Iltimos, qo‘llab-quvvatlashga yozing{me.support ? `: @${me.support}` : ""}.</ErrorText>;
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">To‘lov usuli</div>
      <div className="grid grid-cols-2 gap-2">
        {list.map(([k, l, sub]) => (
          <button key={k} type="button" onClick={() => onChange(k)} className={`rounded-2xl border px-3 py-3 text-left transition ${value === k ? "border-violet-400 bg-violet-500/10" : "border-line bg-card"}`}>
            <div className="font-semibold">{l}</div><div className="text-[11px] text-zinc-400">{sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Buy a package (optionally for an order waiting for payment). */
export function CheckoutScreen({ orderId }: { orderId?: number }) {
  return <div className="pt-8"><H1 sub={orderId ? "Paket sotib olingach buyurtmangiz avtomatik jamoaga yuboriladi." : undefined}>To‘lov</H1><Checkout orderId={orderId} /></div>;
}
function Checkout({ orderId }: { orderId?: number }) {
  const { catalog, push } = useApp();
  const [pkgId, setPkgId] = useState<number | null>(catalog.packages[1]?.id ?? catalog.packages[0]?.id ?? null);
  const [provider, setProvider] = useState<PayProvider | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const buy = async () => {
    setBusy(true); setErr("");
    try { push({ name: "pay", purchase: await post<PurchaseStart>("/api/purchases", { packageId: pkgId, provider, orderId }), orderId }); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <PackagePicker value={pkgId} onChange={setPkgId} />
      <ProviderPicker value={provider} onChange={setProvider} />
      <ErrorText>{err}</ErrorText>
      <Button disabled={busy || !pkgId || !provider} onClick={buy}>{busy ? "Kuting…" : `To‘lash — ${money(catalog.packages.find((p) => p.id === pkgId)?.price ?? 0)}`}</Button>
    </div>
  );
}

export function PayScreen({ purchase, orderId }: { purchase: PurchaseStart; orderId?: number }) {
  const { reloadMe, reset, setTab, me } = useApp();
  const [status, setStatus] = useState(purchase.status);
  const [claimed, setClaimed] = useState(false);
  const [err, setErr] = useState("");
  const opened = useRef(false);
  useEffect(() => { if (purchase.payUrl && !opened.current) { opened.current = true; openUrl(purchase.payUrl); } }, [purchase.payUrl]);
  useEffect(() => {
    if (status !== "pending") return;
    const iv = setInterval(async () => {
      const p = await api<{ status: string }>(`/api/purchases/${purchase.id}`).catch(() => null);
      if (p && p.status !== "pending") { setStatus(p.status); clearInterval(iv); if (p.status === "paid") { haptic("success"); reloadMe(); } }
    }, 3000);
    return () => clearInterval(iv);
  }, [status, purchase.id, reloadMe]);

  if (status === "paid") return (
    <div className="space-y-4 pt-16 text-center">
      <div className="text-5xl">🎉</div>
      <H1 sub={orderId ? "Buyurtmangiz jamoaga yuborildi. Video tayyor bo‘lgach Telegramga keladi." : `Balansingizga ${purchase.videos} ta video qo‘shildi.`}>To‘lov qabul qilindi</H1>
      {orderId ? <Button onClick={() => reset({ name: "order", id: orderId })}>Buyurtmani ko‘rish</Button> : <Button onClick={() => setTab("home")}>Shablon tanlash</Button>}
    </div>
  );
  if (status === "cancelled") return (
    <div className="space-y-4 pt-16 text-center">
      <div className="text-5xl">⚠️</div>
      <H1 sub={`To‘lov tasdiqlanmadi. Savollar bo‘lsa${me.support ? ` @${me.support} ga` : " qo‘llab-quvvatlashga"} yozing.`}>To‘lov bekor qilindi</H1>
      <Button variant="ghost" onClick={() => setTab("orders")}>Buyurtmalarim</Button>
    </div>
  );
  return (
    <div className="space-y-4 pt-8">
      <H1 sub={`${purchase.videos} video · ${money(purchase.amount)}`}>To‘lov</H1>
      {purchase.payUrl && (
        <>
          <Card className="text-sm text-zinc-300">To‘lov sahifasi ochildi. To‘lovni yakunlagach shu oynaga qayting — holat avtomatik yangilanadi.</Card>
          <Button onClick={() => openUrl(purchase.payUrl!)}>{purchase.provider === "payme" ? "Payme" : "Click"} sahifasini ochish</Button>
        </>
      )}
      {purchase.provider === "manual" && (
        <>
          <Card><div className="mb-2 text-xs text-zinc-400">Quyidagi rekvizitlarga {money(purchase.amount)} o‘tkazing:</div><div className="whitespace-pre-wrap text-[15px] font-medium">{purchase.manualPayInfo}</div>
            <div className="mt-2 text-xs text-zinc-500">Izohda xarid raqamini yozing: <b className="text-zinc-300">#{purchase.id}</b></div></Card>
          {claimed ? <Card className="text-sm text-zinc-300">⏳ Admin to‘lovni tekshirmoqda. Tasdiqlangach shu yerda va botda xabar olasiz.</Card> : (
            <Button onClick={async () => { setErr(""); try { await post(`/api/purchases/${purchase.id}/claim`); setClaimed(true); haptic("success"); } catch (e) { setErr(errMsg(e)); } }}>To‘ladim</Button>
          )}
        </>
      )}
      {purchase.provider === "dev" && <Button variant="ghost" onClick={() => post(`/api/purchases/${purchase.id}/dev-pay`).catch((e) => setErr(errMsg(e)))}>Test: to‘lovni tasdiqlash</Button>}
      <ErrorText>{err}</ErrorText>
      <div className="flex items-center justify-center gap-2 py-2 text-xs text-zinc-500"><span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />To‘lov holati kutilmoqda…</div>
    </div>
  );
}

export function PackagesTab() {
  const { me } = useApp();
  const [history, setHistory] = useState<{ id: number; title: string; amount: number; paidAt: string; provider: string }[] | null>(null);
  useEffect(() => { api<typeof history>("/api/purchases").then(setHistory).catch(() => setHistory([])); }, [me.user.credits]);
  return (
    <div className="space-y-5">
      <div className="glow rounded-3xl border border-line p-5">
        <div className="text-sm text-zinc-300">Balansingiz</div>
        <div className="mt-1 text-4xl font-black">{me.user.credits} <span className="text-lg font-semibold text-zinc-300">video</span></div>
        <p className="mt-2 text-xs text-zinc-400">Paket oling va istalgan shablonga buyurtma bering — har bir buyurtma 1 video.</p>
      </div>
      <Checkout />
      {history && history.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">To‘lovlar tarixi</h2>
          <Card className="py-1">{history.map((h) => <Row key={h.id} k={`${h.title} · ${dateTime(h.paidAt)}`} v={money(h.amount)} />)}</Card>
        </section>
      )}
    </div>
  );
}

// ================= Orders =================
export function OrdersTab() {
  const { push, setTab } = useApp();
  const [list, setList] = useState<OrderListItem[] | null>(null);
  useEffect(() => { api<OrderListItem[]>("/api/orders").then(setList).catch(() => setList([])); }, []);
  if (!list) return <Spinner />;
  return (
    <div>
      <H1>Buyurtmalarim</H1>
      {list.length === 0 ? <Empty icon="🎬" title="Hali buyurtmalar yo‘q" text="Shablon tanlab, birinchi reklama videongizga buyurtma bering." action={<Button onClick={() => setTab("home")}>Shablonlarni ko‘rish</Button>} /> : (
        <div className="space-y-3">
          {list.map((o) => (
            <Card key={o.id} onClick={() => push({ name: "order", id: o.id })}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-zinc-500">{o.code} · {dateTime(o.createdAt)}</div>
                  <div className="mt-0.5 truncate font-semibold">{o.destination}</div>
                  <div className="truncate text-sm text-zinc-400">{o.template.title}</div>
                </div>
                <StatusBadge status={o.status} label={o.statusLabel} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const STAGES: [string[], string][] = [[["new"], "Qabul qilindi"], [["in_progress", "revision"], "Tayyorlanmoqda"], [["delivered"], "Tekshiruvda"], [["completed"], "Yakunlandi"]];
const EVENT_LABEL: Record<string, string> = { created: "Buyurtma yaratildi", submitted: "Jamoaga yuborildi", in_progress: "Ishga olindi", delivered: "Video yuborildi", revision: "Tahrir so‘raldi", completed: "Yakunlandi", cancelled: "Bekor qilindi" };

export function OrderScreen({ id }: { id: number }) {
  const { me, push, reloadMe, toast } = useApp();
  const [o, setO] = useState<OrderFull | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [rev, setRev] = useState<string | null>(null);
  const load = useCallback(() => api<OrderFull>(`/api/orders/${id}`).then(setO).catch((e) => setErr(errMsg(e))), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!o || !["new", "in_progress", "revision"].includes(o.status)) return;
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [o, load]);
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setErr("");
    try { await fn(); await load(); await reloadMe(); if (done) { toast(done); haptic("success"); } }
    catch (e) { setErr(errMsg(e)); haptic("error"); } finally { setBusy(false); }
  };
  if (!o) return err ? <div className="pt-10"><ErrorText>{err}</ErrorText></div> : <Spinner />;
  const stageIdx = STAGES.findIndex(([s]) => s.includes(o.status));
  const latest = o.results[o.results.length - 1];
  return (
    <div className="space-y-4 pt-8">
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-xs text-zinc-500">{o.code} · {dateTime(o.createdAt)}</div><h1 className="text-[22px] font-bold leading-tight">{o.brief.destination}</h1><div className="text-sm text-zinc-400">{o.template.title}</div></div>
        <StatusBadge status={o.status} label={o.statusLabel} />
      </div>

      {stageIdx >= 0 && (
        <div className="flex gap-1.5">
          {STAGES.map(([, l], i) => (
            <div key={l} className="flex-1"><div className={`h-1.5 rounded-full ${i <= stageIdx ? "bg-gradient-to-r from-violet-500 to-pink-500" : "bg-line"}`} /><div className={`mt-1 text-[10px] ${i === stageIdx ? "text-white" : "text-zinc-500"}`}>{l}</div></div>
          ))}
        </div>
      )}

      {o.status === "awaiting_payment" && (
        <Card className="space-y-3">
          <div className="text-sm">Buyurtma to‘lovni kutmoqda. To‘lovdan so‘ng jamoaga avtomatik yuboriladi.</div>
          {me.user.credits > 0
            ? <Button disabled={busy} onClick={() => act(() => post(`/api/orders/${o.id}/submit`), "Buyurtma yuborildi ✅")}>Balansdan 1 video bilan yuborish</Button>
            : <Button onClick={() => push({ name: "checkout", orderId: o.id })}>To‘lash</Button>}
          <Button variant="ghost" disabled={busy} onClick={async () => { if (await confirmBox("Buyurtmani bekor qilasizmi?")) act(() => post(`/api/orders/${o.id}/cancel`), "Bekor qilindi"); }}>Bekor qilish</Button>
        </Card>
      )}

      {latest && (
        <Card className="space-y-3">
          <div className="text-sm font-semibold">{o.status === "completed" ? "Tayyor video" : o.status === "revision" ? "Oldingi versiya" : "Tayyor video — tekshiring"}</div>
          {latest.url && <video src={latest.url} controls playsInline preload="metadata" className="mx-auto max-h-[60vh] w-full rounded-2xl bg-black" />}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" className="py-2.5 text-sm" disabled={busy} onClick={() => act(() => post(`/api/orders/${o.id}/send-to-chat`), "Telegramga yuborildi")}>📲 Telegramga</Button>
            {latest.url ? <Button variant="ghost" className="py-2.5 text-sm" onClick={() => openUrl(latest.url!)}>⬇️ Yuklab olish</Button> : <div />}
          </div>
          {o.status === "delivered" && rev === null && (
            <>
              <Button disabled={busy} onClick={() => act(() => post(`/api/orders/${o.id}/accept`), "Rahmat! Buyurtma yakunlandi ✅")}>✅ Qabul qilaman</Button>
              {o.revisionsLeft > 0 && <Button variant="ghost" onClick={() => setRev("")}>✏️ Tahrir so‘rash ({o.revisionsLeft} ta qoldi)</Button>}
            </>
          )}
          {rev !== null && (
            <div className="space-y-2">
              <TextArea value={rev} onChange={setRev} rows={4} maxLength={1500} placeholder="Nimani o‘zgartirish kerak? Masalan: narxni kattaroq qiling, musiqani almashtiring…" autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setRev(null)}>Bekor</Button>
                <Button disabled={busy || rev.trim().length < 3} onClick={() => act(() => post(`/api/orders/${o.id}/revision`, { note: rev }), "Tahrir so‘rovi yuborildi").then(() => setRev(null))}>Yuborish</Button>
              </div>
            </div>
          )}
        </Card>
      )}
      <ErrorText>{err}</ErrorText>

      <Card className="py-1">
        <Row k="Sanalar" v={o.brief.dates} /><Row k="Narx" v={o.brief.price} />
        <Row k="Narxga kiradi" v={o.brief.includes.map((k) => INCLUDES.find(([x]) => x === k)?.[1]).join(", ")} />
        <Row k="Mehmonxona" v={o.brief.hotel} /><Row k="Aksiya" v={o.brief.offer} /><Row k="Telefon" v={o.brief.phone} />
        <Row k="Til" v={o.brief.language === "uz" ? "O‘zbekcha" : "Русский"} /><Row k="Materiallar" v={o.materials.length ? `${o.materials.length} ta fayl` : ""} />
      </Card>
      {o.revisionNote && <Card className="text-sm"><div className="mb-1 text-xs text-zinc-400">Tahrir so‘rovingiz</div>{o.revisionNote}</Card>}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-400">Tarix</h2>
        <div className="space-y-2 border-l border-line pl-4">
          {o.events.map((e, i) => (
            <div key={i} className="relative text-sm"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-violet-400" />
              {EVENT_LABEL[e.type] ?? e.type} <span className="text-xs text-zinc-500">· {dateTime(e.at)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ================= Profile =================
export function ProfileTab() {
  const { me, reloadMe, toast } = useApp();
  const [lang, setLang] = useState(me.user.language);
  const saveLang = async (l: "uz" | "ru") => { setLang(l); await api("/api/me", { method: "PATCH", body: JSON.stringify({ language: l }) }); reloadMe(); toast("Bot tili saqlandi"); };
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-xl font-bold">{(me.agency?.name ?? me.user.name)[0]}</div>
        <div><div className="font-bold">{me.user.name}</div><div className="text-sm text-zinc-400">{me.user.username ? `@${me.user.username}` : `ID ${me.user.telegramId}`} · balans {me.user.credits} video</div></div>
      </div>
      <section>
        <h2 className="mb-3 font-semibold">Agentlik ma’lumotlari</h2>
        <AgencyForm initial={me.agency} onSaved={() => {}} />
      </section>
      <Field group label="Bot xabarlari tili"><Segmented value={lang} onChange={saveLang} options={[["uz", "O‘zbekcha"], ["ru", "Русский"]]} /></Field>
      {me.support && <Button variant="ghost" onClick={() => (tg?.openTelegramLink ? tg.openTelegramLink(`https://t.me/${me.support}`) : openUrl(`https://t.me/${me.support}`))}>💬 Qo‘llab-quvvatlash</Button>}
      <p className="text-center text-xs text-zinc-600">Telegram ID: {me.user.telegramId}</p>
    </div>
  );
}
