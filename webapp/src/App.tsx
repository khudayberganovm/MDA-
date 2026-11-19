import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, tg, type Catalog, type Me, type PurchaseStart, type Template } from "./api";
import { Spinner } from "./ui";
import { CatalogTab, CheckoutScreen, OrderScreen, OrdersTab, PackagesTab, PayScreen, ProfileTab, TemplateScreen, WizardScreen } from "./client";
import { AdminTab } from "./admin";

export type Tab = "home" | "orders" | "packages" | "profile" | "admin";
export type Screen =
  | { name: "template"; t: Template }
  | { name: "wizard"; t: Template }
  | { name: "order"; id: number }
  | { name: "checkout"; orderId?: number }
  | { name: "pay"; purchase: PurchaseStart; orderId?: number };

interface Ctx {
  me: Me; catalog: Catalog; reloadMe: () => Promise<void>;
  push: (s: Screen) => void; pop: () => void; reset: (s?: Screen) => void; setTab: (t: Tab) => void;
  toast: (m: string) => void;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTabState] = useState<Tab>("home");
  const [stack, setStack] = useState<Screen[]>([]);
  const [toastMsg, setToast] = useState("");

  const reloadMe = useCallback(async () => { setMe(await api<Me>("/api/me")); }, []);
  useEffect(() => {
    Promise.all([api<Me>("/api/me"), api<Catalog>("/api/catalog")])
      .then(([m, c]) => { setMe(m); setCatalog(c); })
      .catch((e) => setErr(e instanceof ApiError && e.status === 401 ? "unauthorized" : (e as Error).message));
  }, []);

  const push = useCallback((s: Screen) => { setStack((st) => [...st, s]); window.scrollTo(0, 0); }, []);
  const pop = useCallback(() => setStack((st) => st.slice(0, -1)), []);
  const reset = useCallback((s?: Screen) => { setStack(s ? [s] : []); window.scrollTo(0, 0); }, []);
  const setTab = useCallback((t: Tab) => { setStack([]); setTabState(t); window.scrollTo(0, 0); }, []);
  const toast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); }, []);

  // Telegram back button pops the screen stack.
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb) return;
    if (stack.length) { bb.show(); bb.onClick(pop); return () => bb.offClick(pop); }
    bb.hide();
  }, [stack.length, pop]);

  if (err === "unauthorized") return <Center>Iltimos, ilovani Telegram bot orqali oching.</Center>;
  if (err) return <Center>{err}</Center>;
  if (!me || !catalog) return <Spinner />;

  const screen = stack[stack.length - 1];
  return (
    <AppCtx.Provider value={{ me, catalog, reloadMe, push, pop, reset, setTab, toast }}>
      <div className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-4">
        <div key={screen ? `${stack.length}-${screen.name}` : tab} className="fade-in">
          {screen ? <ScreenView s={screen} /> : (
            <>
              {tab === "home" && <CatalogTab />}
              {tab === "orders" && <OrdersTab />}
              {tab === "packages" && <PackagesTab />}
              {tab === "profile" && <ProfileTab />}
              {tab === "admin" && me.isAdmin && <AdminTab />}
            </>
          )}
        </div>
        {!tg && stack.length > 0 && <button onClick={pop} className="fixed left-3 top-3 z-20 rounded-full border border-line bg-card/90 px-3 py-1.5 text-sm backdrop-blur">← Orqaga</button>}
        {toastMsg && <div className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-sm rounded-2xl bg-white px-4 py-3 text-center text-sm font-medium text-ink shadow-xl fade-in">{toastMsg}</div>}
        <Nav tab={tab} onTab={setTab} admin={me.isAdmin} />
      </div>
    </AppCtx.Provider>
  );
}

function ScreenView({ s }: { s: Screen }) {
  switch (s.name) {
    case "template": return <TemplateScreen t={s.t} />;
    case "wizard": return <WizardScreen t={s.t} />;
    case "order": return <OrderScreen id={s.id} />;
    case "checkout": return <CheckoutScreen orderId={s.orderId} />;
    case "pay": return <PayScreen purchase={s.purchase} orderId={s.orderId} />;
  }
}

const Center = ({ children }: { children: React.ReactNode }) => <div className="flex min-h-screen items-center justify-center p-8 text-center text-zinc-300">{children}</div>;

const ICONS: Record<Tab, React.ReactNode> = {
  home: <path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z" />,
  orders: <path d="M6 4h12v16l-3-2-3 2-3-2-3 2zM9 9h6M9 13h6" />,
  packages: <path d="M3 8l9-4 9 4-9 4-9-4zm0 0v8l9 4 9-4V8M12 12v8" />,
  profile: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0" />,
  admin: <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6zM9 12l2 2 4-4" />,
};
function Nav({ tab, onTab, admin }: { tab: Tab; onTab: (t: Tab) => void; admin: boolean }) {
  const items: [Tab, string][] = [["home", "Shablonlar"], ["orders", "Buyurtmalar"], ["packages", "Paketlar"], ["profile", "Profil"]];
  if (admin) items.push(["admin", "Admin"]);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {items.map(([k, label]) => (
          <button key={k} onClick={() => onTab(k)} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition ${tab === k ? "text-white" : "text-zinc-500"}`}>
            <svg viewBox="0 0 24 24" className={`h-6 w-6 fill-none stroke-[1.7] ${tab === k ? "stroke-pink-400" : "stroke-current"}`} strokeLinecap="round" strokeLinejoin="round">{ICONS[k]}</svg>
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
