import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, CalendarDays, ClipboardList, FileBarChart, LogOut, MapPinned, Radio, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState, type ReactNode } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { flushOutbox, useOutbox } from "@/lib/offline";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime, useLiveState, useTasks, useMe, ACTIVE, loadPrefs, type Role } from "@/lib/ops";

type Nav = { to: "/" | "/tasks" | "/sites" | "/availability" | "/team" | "/reports" | "/users"; label: string; short: string; icon: typeof Activity; roles?: Role[] };
const NAV: Nav[] = [
  { to: "/", label: "Overview", short: "Accueil", icon: Activity },
  { to: "/tasks", label: "Work orders", short: "Interventions", icon: ClipboardList },
  { to: "/sites", label: "Network sites", short: "Carte", icon: MapPinned },
  { to: "/availability", label: "Disponibilités", short: "Planning", icon: CalendarDays },
  { to: "/team", label: "Field team", short: "Équipe", icon: Users, roles: ["admin", "supervisor"] },
  { to: "/reports", label: "Reports & alerts", short: "Rapports", icon: FileBarChart, roles: ["admin", "supervisor"] },
  { to: "/users", label: "Utilisateurs & rôles", short: "Rôles", icon: ShieldCheck, roles: ["admin"] },
];
const ROLE_LABEL: Record<Role, string> = { admin: "Administrateur", supervisor: "Superviseur", technician: "Technicien" };

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  useRealtime((old, site) => {
    if (!old || old === site.status) return;
    const p = loadPrefs();
    if (site.status === "alarm" && p.down) toast.error(`${site.code} · ${site.name} hors service`, { description: site.last_alert ?? "Alarme / panne critique" });
    else if (site.status === "maintenance" && p.maintenance) toast.warning(`${site.code} · ${site.name} en maintenance`);
    else if (site.status === "normal" && p.restored) toast.success(`${site.code} · ${site.name} de retour à la normale`);
  });
  const { live } = useLiveState();
  const outbox = useOutbox();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => flushOutbox((sent, rejected) => {
      if (sent) toast.success(`${sent} saisie(s) hors ligne synchronisée(s)`);
      rejected.forEach((r) => toast.error(`Saisie refusée : ${r}`));
      qc.invalidateQueries();
    });
    const up = () => { setOnline(true); sync(); };
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [qc]);
  const { data: tasks } = useTasks();
  const overdue = (tasks ?? []).filter((t) => ACTIVE.includes(t.status) && t.due_at && new Date(t.due_at).getTime() < Date.now()).length;
  const items = NAV.filter((n) => !n.roles || n.roles.some((r) => me?.roles.includes(r)));
  const isActive = (to: string) => (to === "/" ? path === "/" : path.startsWith(to));

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-screen md:w-60">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Radio className="size-5" /></div>
          <div>
            <div className="font-display text-base font-bold text-sidebar-accent-foreground">GSM O&amp;M</div>
            <div className="font-mono text-[10px] tracking-widest opacity-70">NETWORK OPERATIONS</div>
          </div>
        </div>
        <div className="eyebrow px-6 pb-2 !text-sidebar-foreground/60">Dispatch desk</div>
        <nav className="flex flex-col gap-1 px-3">
          {items.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${isActive(to) ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-border" : "hover:bg-sidebar-accent/60"}`}>
              <Icon className="size-4" />{label}
              {to === "/tasks" && overdue > 0 && <span className="ml-auto rounded-full bg-destructive px-1.5 text-[11px] text-destructive-foreground">{overdue}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2 border-t border-sidebar-border px-6 py-4 text-xs">
          <span className={`size-2 rounded-full ${live ? "bg-ok" : "bg-warn"}`} />
          {live ? "Dispatch channel live" : "Connecting…"}
        </div>
      </aside>
      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <header className="sticky top-0 z-[1100] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:static md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-sidebar text-sidebar-primary md:hidden"><Radio className="size-4" /></span>
            <span className={`size-2 shrink-0 rounded-full md:hidden ${live ? "bg-ok" : "bg-warn"}`} />
            <span className="truncate text-sm text-muted-foreground">{me?.email}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="hidden rounded-md bg-secondary px-2 py-1 font-mono sm:inline">SHIFT 07:00–19:00</span>
            <span className="rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">{me?.roles.length ? me.roles.map((r) => ROLE_LABEL[r]).join(" · ") : "Sans rôle"}</span>
            <button onClick={signOut} aria-label="Se déconnecter" className="rounded-md p-2 hover:bg-muted"><LogOut className="size-4" /></button>
          </div>
        </header>
        {(!online || outbox.length > 0) && (
          <div className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold md:px-8 ${online ? "bg-warn/20" : "bg-crit/15 text-crit"}`}>
            {online ? <RefreshCw className="size-4 animate-spin" /> : <CloudOff className="size-4" />}
            {online ? `Synchronisation de ${outbox.length} saisie(s)…` : `Hors ligne — données en cache${outbox.length ? ` · ${outbox.length} saisie(s) en attente` : ""}`}
            {online && outbox.length > 0 && <button onClick={() => flushOutbox(() => qc.invalidateQueries())} className="ml-auto underline">Réessayer</button>}
          </div>
        )}
        <div className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-8">
          {me && me.roles.length === 0 ? (
            <div className="rounded-xl border bg-card p-6 text-sm">
              <h1 className="text-lg font-bold">Compte en attente</h1>
              <p className="mt-1 text-muted-foreground">Votre compte est créé. Un administrateur doit vous attribuer un rôle (superviseur ou technicien) avant que vous puissiez accéder aux sites et interventions.</p>
            </div>
          ) : children}
        </div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-[1100] flex border-t bg-sidebar text-sidebar-foreground md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {items.slice(0, 5).map(({ to, short, icon: Icon }) => (
          <Link key={to} to={to} className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${isActive(to) ? "text-sidebar-primary" : ""}`}>
            <Icon className="size-5" />{short}
            {to === "/tasks" && overdue > 0 && <span className="absolute right-1/4 top-1.5 size-2 rounded-full bg-destructive" />}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 md:mb-6">
      <div className="min-w-0">
        <div className="eyebrow !text-primary">{eyebrow}</div>
        <h1 className="mt-1 text-xl font-bold md:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border bg-card ${className}`}>{children}</section>;
}
