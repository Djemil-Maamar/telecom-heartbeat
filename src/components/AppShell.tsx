import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, ClipboardList, MapPinned, Radio, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useRealtime, useTasks, ACTIVE } from "@/lib/ops";

const NAV = [
  { to: "/", label: "Overview", icon: Activity },
  { to: "/tasks", label: "Work orders", icon: ClipboardList },
  { to: "/sites", label: "Network sites", icon: MapPinned },
  { to: "/team", label: "Field team", icon: Users },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { live } = useRealtime();
  const { data: tasks } = useTasks();
  const overdue = (tasks ?? []).filter((t) => ACTIVE.includes(t.status) && t.due_at && new Date(t.due_at).getTime() < Date.now()).length;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-60">
        <div className="flex items-center gap-3 px-5 py-4 md:py-6">
          <div className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Radio className="size-5" /></div>
          <div>
            <div className="font-display text-base font-bold text-sidebar-accent-foreground">GSM O&amp;M</div>
            <div className="font-mono text-[10px] tracking-widest opacity-70">NETWORK OPERATIONS</div>
          </div>
        </div>
        <div className="eyebrow hidden px-6 pb-2 !text-sidebar-foreground/60 md:block">Dispatch desk</div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link key={to} to={to} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-border" : "hover:bg-sidebar-accent/60"}`}>
                <Icon className="size-4" />
                {label}
                {to === "/tasks" && overdue > 0 && <span className="ml-auto rounded-full bg-destructive px-1.5 text-[11px] text-destructive-foreground">{overdue}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden items-center gap-2 border-t border-sidebar-border px-6 py-4 text-xs md:flex">
          <span className={`size-2 rounded-full ${live ? "bg-ok" : "bg-warn"}`} />
          {live ? "Dispatch channel live" : "Connecting…"}
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b px-4 py-3 md:px-8">
          <span className="text-sm text-muted-foreground">Operations</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="hidden text-muted-foreground sm:inline">REGIONAL CONTROL / EAST</span>
            <span className="rounded-md bg-secondary px-2 py-1 font-mono">SHIFT 07:00–19:00</span>
            <span className="font-semibold">Ops control</span>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="eyebrow !text-primary">{eyebrow}</div>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border bg-card ${className}`}>{children}</section>;
}
