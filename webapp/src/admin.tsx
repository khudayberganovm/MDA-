import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "./App";
import { api, confirmBox, dateTime, haptic, INCLUDES, money, openUrl, post, upload, type OrderFull, type Pkg, type Template } from "./api";
import { Button, Card, Chip, Cover, Empty, ErrorText, Field, H1, Input, Row, Segmented, Spinner, StatusBadge, TextArea } from "./ui";

type Sub = "orders" | "templates" | "packages" | "payments" | "stats";
const errMsg = (e: unknown) => (e as Error).message || "Xatolik";

export function AdminTab() {
  const [sub, setSub] = useState<Sub>("orders");
  const [orderId, setOrderId] = useState<number | null>(null);
  if (orderId) return <AdminOrder id={orderId} back={() => setOrderId(null)} />;
  return (
    <div>
      <H1>Admin panel</H1>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {([["orders", "Buyurtmalar"], ["templates", "Shablonlar"], ["packages", "Paketlar"], ["payments", "To‘lovlar"], ["stats", "Statistika"]] as [Sub, string][]).map(([k, l]) => <Chip key={k} active={sub === k} onClick={() => setSub(k)}>{l}</Chip>)}
      </div>
      {sub === "orders" && <AdminOrders open={setOrderId} />}
      {sub === "templates" && <AdminTemplates />}
      {sub === "packages" && <AdminPackages />}
      {sub === "payments" && <AdminPayments />}
      {sub === "stats" && <AdminStats />}
    </div>
  );
}

interface AdminOrderRow { id: number; code: string; status: string; statusLabel: string; template: string; agency: string; destination: string; assignee: string | null; createdAt: string; user: string }
const FILTERS: [string, string][] = [["active", "Faol"], ["new", "Yangi"], ["in_progress", "Ishda"], ["revision", "Tahrir"], ["delivered", "Tekshiruvda"], ["completed", "Yakunlangan"], ["cancelled", "Bekor"], ["awaiting_payment", "To‘lanmagan"]];

function AdminOrders({ open }: { open: (id: number) => void }) {
  const [filter, setFilter] = useState("active");
  const [list, setList] = useState<AdminOrderRow[] | null>(null);
  useEffect(() => { setList(null); api<AdminOrderRow[]>(`/api/admin/orders?status=${filter}`).then(setList).catch(() => setList([])); }, [filter]);
  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">{FILTERS.map(([k, l]) => <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}</div>
      {!list ? <Spinner /> : list.length === 0 ? <Empty icon="📭" title="Buyurtmalar yo‘q" /> : list.map((o) => (
        <Card key={o.id} onClick={() => open(o.id)}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-zinc-500">{o.code} · {dateTime(o.createdAt)}{o.assignee ? ` · ${o.assignee}` : ""}</div>
              <div className="truncate font-semibold">{o.agency}</div>
              <div className="truncate text-sm text-zinc-400">{o.destination} · {o.template}</div>
            </div>
            <StatusBadge status={o.status} label={o.statusLabel} />
          </div>
        </Card>
      ))}
    </div>
  );
}

function AdminOrder({ id, back }: { id: number; back: () => void }) {
  const { toast } = useApp();
  const [o, setO] = useState<OrderFull | null>(null);
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const load = useCallback(() => api<OrderFull>(`/api/admin/orders/${id}`).then(setO).catch((e) => setErr(errMsg(e))), [id]);
  useEffect(() => { load(); }, [load]);
  const action = async (a: string, msg: string) => {
    if (a === "cancel" && !(await confirmBox("Bekor qilinsinmi? Mijozga 1 video qaytariladi."))) return;
    setBusy(a); setErr("");
    try { setO(await post<OrderFull>(`/api/admin/orders/${id}/action`, { action: a })); toast(msg); haptic("success"); } catch (e) { setErr(errMsg(e)); } finally { setBusy(""); }
  };
  const sendVideo = async (file: File) => {
    setBusy("upload"); setErr(""); setProgress(0);
    try {
      const r = await upload<OrderFull & { sentToClient: boolean }>(`/api/admin/orders/${id}/result`, file, setProgress);
      setO(r); toast(r.sentToClient ? "Video mijozga yuborildi ✅" : "Saqlandi (Telegramga yuborilmadi)"); haptic("success");
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(""); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(o!.claudeBrief!); toast("Brif nusxalandi 📋"); }
    catch { setErr("Nusxa olinmadi — matnni qo‘lda belgilang."); }
  };
  if (!o) return err ? <ErrorText>{err}</ErrorText> : <Spinner />;
  const b = o.brief, a = o.agency;
  const active = ["new", "in_progress", "revision", "delivered"].includes(o.status);
  return (
    <div className="space-y-4">
      <button onClick={back} className="text-sm text-zinc-400">← Buyurtmalar</button>
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-xs text-zinc-500">{o.code} · {dateTime(o.createdAt)}</div><h1 className="text-xl font-bold">{a.name}</h1><div className="text-sm text-zinc-400">{o.template.title} · {o.template.durationSec}s</div></div>
        <StatusBadge status={o.status} label={o.statusLabel} />
      </div>

      {active && (
        <div className="grid grid-cols-2 gap-2">
          {(o.status === "new" || o.status === "revision") && <Button className="py-2.5 text-sm" disabled={!!busy} onClick={() => action("take", "Ishga olindi")}>▶️ Ishga olish</Button>}
          <Button className="py-2.5 text-sm" variant={o.status === "new" || o.status === "revision" ? "ghost" : "primary"} disabled={!!busy} onClick={() => ref.current?.click()}>{busy === "upload" ? `Yuklanmoqda ${Math.round(progress * 100)}%` : "📤 Video yuborish"}</Button>
          {o.status !== "new" && <Button className="py-2.5 text-sm" variant="ghost" disabled={!!busy} onClick={() => action("complete", "Yakunlandi")}>✅ Yakunlash</Button>}
          <Button className="py-2.5 text-sm" variant="danger" disabled={!!busy} onClick={() => action("cancel", "Bekor qilindi")}>Bekor qilish</Button>
        </div>
      )}
      {o.status === "awaiting_payment" && <Card className="text-sm text-amber-300">Mijoz hali to‘lamagan.</Card>}
      <input ref={ref} type="file" accept="video/mp4,video/quicktime" hidden onChange={(e) => { if (e.target.files?.[0]) sendVideo(e.target.files[0]); e.target.value = ""; }} />
      <p className="text-xs text-zinc-500">50 MB dan katta videoni admin guruhidagi buyurtma xabariga javob (reply) qilib yuboring.</p>
      <ErrorText>{err}</ErrorText>

      {o.claudeBrief && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between"><div className="font-semibold">🤖 Claude agent uchun brif</div><button onClick={copy} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink">Nusxa olish</button></div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-ink p-3 text-xs leading-relaxed text-zinc-300">{o.claudeBrief}</pre>
        </Card>
      )}
      {o.revisionNote && o.status === "revision" && <Card className="border-orange-400/30 text-sm"><div className="mb-1 text-xs text-orange-300">Tahrir so‘rovi</div>{o.revisionNote}</Card>}

      <Card className="py-1">
        <Row k="Yo‘nalish" v={b.destination} /><Row k="Sanalar" v={b.dates} /><Row k="Narx" v={b.price} />
        <Row k="Kiradi" v={b.includes.map((k) => INCLUDES.find(([x]) => x === k)?.[1]).join(", ")} /><Row k="Mehmonxona" v={b.hotel} /><Row k="Aksiya" v={b.offer} />
        <Row k="Telefon (video)" v={b.phone} /><Row k="Til / ovoz" v={`${b.language} · ${b.voice}`} /><Row k="Izoh" v={b.extra} />
      </Card>
      <Card className="py-1">
        <Row k="Instagram" v={<button className="text-violet-300" onClick={() => openUrl(`https://instagram.com/${a.instagram}`)}>@{a.instagram}</button>} />
        <Row k="Telefon" v={a.phone} /><Row k="Telegram" v={a.telegram ? `@${a.telegram}` : ""} /><Row k="Shahar" v={a.city} />
        <Row k="Mijoz" v={o.user ? `${o.user.name}${o.user.username ? ` @${o.user.username}` : ""}` : ""} /><Row k="Tahrirlar qoldi" v={String(o.revisionsLeft)} />
      </Card>
      {(o.materials.length > 0 || o.results.length > 0) && (
        <Card className="space-y-2">
          <div className="font-semibold">Fayllar</div>
          {[...o.materials, ...o.results].map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{f.kind === "result" ? "🎬" : f.mime.startsWith("video") ? "🎥" : "🖼"} {f.name}</span>
              {f.url ? <button className="shrink-0 text-violet-300" onClick={() => openUrl(f.url!)}>Ochish</button> : <span className="text-xs text-zinc-500">Telegramda</span>}
            </div>
          ))}
        </Card>
      )}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-400">Tarix</h2>
        {o.events.map((e, i) => <div key={i} className="text-sm text-zinc-300">{dateTime(e.at)} — {e.type}{e.by ? ` (${e.by})` : ""}{e.note ? `: ${e.note}` : ""}</div>)}
      </section>
    </div>
  );
}

// ---------- templates ----------
const emptyTpl = { title: "", category: "", description: "", durationSec: 30, format: "9:16", agentNotes: "", active: true, sortOrder: 0 };
function AdminTemplates() {
  const [list, setList] = useState<Template[] | null>(null);
  const [edit, setEdit] = useState<Template | "new" | null>(null);
  const load = () => api<Template[]>("/api/admin/templates").then(setList);
  useEffect(() => { load(); }, []);
  if (edit) return <TemplateForm t={edit === "new" ? null : edit} done={() => { setEdit(null); load(); }} />;
  if (!list) return <Spinner />;
  return (
    <div className="space-y-3">
      <Button onClick={() => setEdit("new")}>＋ Yangi shablon</Button>
      <div className="grid grid-cols-3 gap-3">
        {list.map((t) => (
          <button key={t.id} onClick={() => setEdit(t)} className={`text-left ${t.active ? "" : "opacity-40"}`}>
            <Cover t={t} />
            <div className="mt-1 line-clamp-1 text-xs font-semibold">{t.title}</div>
            <div className="text-[10px] text-zinc-500">{t.previewUrl ? "video bor" : "video yo‘q"}{t.active ? "" : " · yashirin"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TemplateForm({ t, done }: { t: Template | null; done: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState(t ? { title: t.title, category: t.category, description: t.description, durationSec: t.durationSec, format: t.format, agentNotes: t.agentNotes ?? "", active: t.active, sortOrder: t.sortOrder } : emptyTpl);
  const [cur, setCur] = useState<Template | null>(t);
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [pr, setPr] = useState(0);
  const vRef = useRef<HTMLInputElement>(null), pRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy("save"); setErr("");
    try {
      const r = cur ? await api<Template>(`/api/admin/templates/${cur.id}`, { method: "PUT", body: JSON.stringify(f) }) : await post<Template>("/api/admin/templates", f);
      setCur(r); toast("Saqlandi ✅"); if (cur) done();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(""); }
  };
  const media = async (kind: "preview" | "poster", file: File) => {
    if (!cur) return;
    setBusy(kind); setErr(""); setPr(0);
    try { setCur(await upload<Template>(`/api/admin/templates/${cur.id}/${kind}`, file, setPr)); toast("Yuklandi ✅"); } catch (e) { setErr(errMsg(e)); } finally { setBusy(""); }
  };
  const removeMedia = async (kind: "preview" | "poster") => {
    if (!cur || !(await confirmBox(kind === "preview" ? "Namuna video o‘chirilsinmi?" : "Muqova rasm o‘chirilsinmi?"))) return;
    setBusy(kind); setErr("");
    try { setCur(await api<Template>(`/api/admin/templates/${cur.id}/${kind}`, { method: "DELETE" })); toast("O‘chirildi"); } catch (e) { setErr(errMsg(e)); } finally { setBusy(""); }
  };
  const mediaRow = (kind: "preview" | "poster", has: boolean, label: string, ref: React.RefObject<HTMLInputElement | null>) => (
    <div className="flex gap-2">
      <Button variant="ghost" className="py-2.5 text-sm" disabled={!!busy} onClick={() => ref.current?.click()}>{busy === kind ? `${Math.round(pr * 100)}%` : `${label}${has ? " ↻" : ""}`}</Button>
      {has && <button type="button" aria-label="O‘chirish" disabled={!!busy} onClick={() => removeMedia(kind)} className="shrink-0 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 text-red-300 disabled:opacity-40">🗑</button>}
    </div>
  );
  return (
    <div className="space-y-4">
      <button onClick={done} className="text-sm text-zinc-400">← Shablonlar</button>
      <h2 className="text-lg font-bold">{cur ? "Shablonni tahrirlash" : "Yangi shablon"}</h2>
      {cur && (
        <div className="flex gap-4">
          <Cover t={cur} controls className="w-32 shrink-0" />
          <div className="flex-1 space-y-2">
            <input ref={vRef} type="file" accept="video/mp4,video/quicktime" hidden onChange={(e) => e.target.files?.[0] && media("preview", e.target.files[0])} />
            <input ref={pRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && media("poster", e.target.files[0])} />
            {mediaRow("preview", Boolean(cur.previewUrl), "🎬 Namuna video", vRef)}
            {mediaRow("poster", Boolean(cur.posterUrl), "🖼 Muqova rasm", pRef)}
            <p className="text-[11px] text-zinc-500">MP4, 9:16, 60 MB gacha. Mijozlar katalogda ko‘radi.</p>
          </div>
        </div>
      )}
      <Field label="Nomi" required><Input value={f.title} onChange={set("title")} maxLength={80} /></Field>
      <Field label="Kategoriya" required hint="Masalan: Umra va Haj, Xorijiy turlar, Aksiyalar"><Input value={f.category} onChange={set("category")} maxLength={40} /></Field>
      <Field label="Tavsif (mijozga ko‘rinadi)"><TextArea value={f.description} onChange={set("description")} rows={3} maxLength={400} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Davomiylik (soniya)"><Input value={String(f.durationSec)} onChange={(v) => set("durationSec")(Number(v.replace(/\D/g, "")) || 0)} inputMode="numeric" /></Field>
        <Field label="Tartib raqami"><Input value={String(f.sortOrder)} onChange={(v) => set("sortOrder")(Number(v.replace(/\D/g, "")) || 0)} inputMode="numeric" /></Field>
      </div>
      <Field group label="Format"><Segmented value={f.format} onChange={set("format")} options={[["9:16", "9:16"], ["1:1", "1:1"], ["4:5", "4:5"], ["16:9", "16:9"]]} /></Field>
      <Field label="Claude agent uchun ko‘rsatma (faqat adminlar)" hint="Brifga avtomatik qo‘shiladi: uslub, musiqa, kadrlar, tuzilma"><TextArea value={f.agentNotes} onChange={set("agentNotes")} rows={5} maxLength={3000} /></Field>
      <Field group label="Holati"><Segmented value={f.active ? "on" : "off"} onChange={(v) => set("active")(v === "on")} options={[["on", "Katalogda"], ["off", "Yashirin"]]} /></Field>
      <ErrorText>{err}</ErrorText>
      <Button disabled={!!busy || f.title.trim().length < 2 || f.category.trim().length < 2} onClick={save}>{busy === "save" ? "Saqlanmoqda…" : cur ? "Saqlash" : "Yaratish"}</Button>
      {!t && cur && <p className="text-center text-xs text-zinc-500">Endi namuna video va muqova yuklang.</p>}
    </div>
  );
}

// ---------- packages ----------
function AdminPackages() {
  const { toast } = useApp();
  const [list, setList] = useState<(Pkg & { _new?: boolean })[] | null>(null);
  const [err, setErr] = useState("");
  const load = () => api<Pkg[]>("/api/admin/packages").then(setList);
  useEffect(() => { load(); }, []);
  if (!list) return <Spinner />;
  const upd = (i: number, k: keyof Pkg, v: unknown) => setList((s) => s!.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const save = async (p: Pkg & { _new?: boolean }) => {
    setErr("");
    const body = { title: p.title, videos: p.videos, price: p.price, oldPrice: p.oldPrice, badge: p.badge, active: p.active ?? true, sortOrder: p.sortOrder ?? 0 };
    try { if (p._new) await post("/api/admin/packages", body); else await api(`/api/admin/packages/${p.id}`, { method: "PUT", body: JSON.stringify(body) }); toast("Saqlandi ✅"); load(); }
    catch (e) { setErr(errMsg(e)); }
  };
  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;
  return (
    <div className="space-y-3">
      <ErrorText>{err}</ErrorText>
      {list.map((p, i) => (
        <Card key={p.id || `n${i}`} className={`space-y-3 ${p.active === false ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nomi"><Input value={p.title} onChange={(v) => upd(i, "title", v)} maxLength={40} /></Field>
            <Field label="Videolar soni"><Input value={String(p.videos)} onChange={(v) => upd(i, "videos", num(v))} inputMode="numeric" /></Field>
            <Field label="Narx (so‘m)"><Input value={String(p.price)} onChange={(v) => upd(i, "price", num(v))} inputMode="numeric" /></Field>
            <Field label="Eski narx (ixtiyoriy)"><Input value={p.oldPrice ? String(p.oldPrice) : ""} onChange={(v) => upd(i, "oldPrice", num(v) || null)} inputMode="numeric" /></Field>
            <Field label="Belgi"><Input value={p.badge ?? ""} onChange={(v) => upd(i, "badge", v || null)} maxLength={24} placeholder="Ommabop" /></Field>
            <Field group label="Holati"><Segmented value={p.active === false ? "off" : "on"} onChange={(v) => upd(i, "active", v === "on")} options={[["on", "Faol"], ["off", "O‘chiq"]]} /></Field>
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-400"><span>{money(Math.round(p.price / Math.max(1, p.videos)))} / video</span><button onClick={() => save(p)} className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-ink">Saqlash</button></div>
        </Card>
      ))}
      <Button variant="ghost" onClick={() => setList((s) => [...s!, { id: 0, title: "", videos: 1, price: 100000, oldPrice: null, badge: null, active: true, sortOrder: s!.length + 1, _new: true }])}>＋ Paket qo‘shish</Button>
    </div>
  );
}

// ---------- payments & credits ----------
interface PurchaseRow { id: number; status: string; provider: string; amount: number; videos: number; package: string; user: string; username: string | null; createdAt: string; paidAt: string | null }
function AdminPayments() {
  const { toast } = useApp();
  const [status, setStatus] = useState("pending");
  const [list, setList] = useState<PurchaseRow[] | null>(null);
  const [tid, setTid] = useState(""); const [delta, setDelta] = useState("1"); const [err, setErr] = useState("");
  const load = useCallback(() => { setList(null); api<PurchaseRow[]>(`/api/admin/purchases?status=${status}`).then(setList).catch(() => setList([])); }, [status]);
  useEffect(() => { load(); }, [load]);
  const confirm = async (p: PurchaseRow) => {
    if (!(await confirmBox(`${money(p.amount)} tushganini tasdiqlaysizmi?`))) return;
    try { await post(`/api/admin/purchases/${p.id}/mark-paid`); toast("Tasdiqlandi ✅"); load(); } catch (e) { setErr(errMsg(e)); }
  };
  const credit = async () => {
    setErr("");
    try { const r = await post<{ name: string; credits: number }>("/api/admin/credits", { telegramId: tid.trim(), delta: Number(delta) }); toast(`${r.name}: balans ${r.credits} video`); setTid(""); }
    catch (e) { setErr(errMsg(e)); }
  };
  return (
    <div className="space-y-4">
      <Segmented value={status} onChange={setStatus} options={[["pending", "Tasdiq kutmoqda"], ["paid", "To‘langan"]]} />
      {!list ? <Spinner /> : list.length === 0 ? <Empty icon="💳" title={status === "pending" ? "Tasdiq kutayotgan to‘lov yo‘q" : "To‘lovlar yo‘q"} /> : list.map((p) => (
        <Card key={p.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <div className="font-semibold">{money(p.amount)} · {p.package}</div>
            <div className="truncate text-xs text-zinc-400">#{p.id} · {p.user}{p.username ? ` @${p.username}` : ""} · {p.provider} · {dateTime(p.paidAt ?? p.createdAt)}</div>
          </div>
          {p.status === "pending" && <button onClick={() => confirm(p)} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink">Tasdiqlash</button>}
        </Card>
      ))}
      <Card className="space-y-3">
        <div className="font-semibold">Balansga video qo‘shish / ayirish</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2"><Input value={tid} onChange={setTid} placeholder="Telegram ID" inputMode="numeric" /></div>
          <Input value={delta} onChange={setDelta} placeholder="+1" inputMode="numeric" />
        </div>
        <Button variant="ghost" className="py-2.5 text-sm" disabled={!/^\d{3,}$/.test(tid.trim()) || !Number(delta)} onClick={credit}>Qo‘llash</Button>
        <p className="text-xs text-zinc-500">Mijoz ID’si uning Profil sahifasi pastida yoki botdagi /myid buyrug‘ida.</p>
      </Card>
      <ErrorText>{err}</ErrorText>
    </div>
  );
}

// ---------- stats ----------
interface Stats { orders: Record<string, number>; users: number; creditsOutstanding: number; revenue: { day: number; dayCount: number; month: number; monthCount: number }; pendingManual: number; payments: Record<string, boolean>; adminChat: boolean }
function AdminStats() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { api<Stats>("/api/admin/stats").then(setS); }, []);
  if (!s) return <Spinner />;
  const n = (k: string) => s.orders[k] ?? 0;
  const tile = (label: string, value: React.ReactNode, sub?: string) => (
    <Card><div className="text-xs text-zinc-400">{label}</div><div className="mt-1 text-xl font-bold">{value}</div>{sub && <div className="text-xs text-zinc-500">{sub}</div>}</Card>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {tile("Bugungi tushum", money(s.revenue.day), `${s.revenue.dayCount} ta to‘lov`)}
        {tile("30 kunlik tushum", money(s.revenue.month), `${s.revenue.monthCount} ta to‘lov`)}
        {tile("Faol buyurtmalar", n("new") + n("in_progress") + n("revision") + n("delivered"), `${n("new")} yangi · ${n("revision")} tahrir`)}
        {tile("Yakunlangan", n("completed"))}
        {tile("Foydalanuvchilar", s.users)}
        {tile("Balanslarda video", s.creditsOutstanding, "oldindan to‘langan")}
      </div>
      <Card className="py-1">
        <Row k="Admin guruh" v={s.adminChat ? "✅ ulangan" : "❌ ADMIN_CHAT_ID yo‘q"} />
        <Row k="Payme" v={s.payments.payme ? "✅" : "—"} /><Row k="Click" v={s.payments.click ? "✅" : "—"} />
        <Row k="Karta (qo‘lda)" v={s.payments.manual ? "✅" : "—"} /><Row k="Tasdiq kutayotgan to‘lovlar" v={String(s.pendingManual)} />
      </Card>
    </div>
  );
}
