import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, MapPinned, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, Panel } from "@/components/AppShell";
import { SlaBadge } from "@/components/SlaBadge";
import { ACTIVE, SITE_STATUS, fmtTime, logActivity, sla, statusLabel, useActivity, useNow, useSites, useTasks, type SiteStatus } from "@/lib/ops";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Shift at a glance — GSM O&M" },
      { name: "description", content: "Live maintenance workload, SLA countdowns and escalations across the network." },
      { property: "og:title", content: "Shift at a glance — GSM O&M" },
      { property: "og:description", content: "Live maintenance workload, SLA countdowns and escalations across the network." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { data: tasks = [] } = useTasks();
  const { data: sites = [] } = useSites();
  const { data: activity = [] } = useActivity();
  const now = useNow();
  const open = tasks.filter((t) => ACTIVE.includes(t.status));
  const escalations = open.filter((t) => ["escalate", "breached"].includes(sla(t, now).state));
  const notified = useRef(new Set<string>());

  // Escalation alerts: notify the desk and record a one-time escalation entry per breached task.
  useEffect(() => {
    for (const t of escalations) {
      if (notified.current.has(t.id)) continue;
      notified.current.add(t.id);
      const s = sla(t, Date.now());
      toast.warning(`${t.task_code}: ${s.state === "breached" ? "SLA dépassé" : "SLA bientôt dépassé"} (${t.priority})`);
      if (s.state === "breached" && !t.escalated_at) {
        supabase.from("ops_tasks").update({ escalated_at: new Date().toISOString() }).eq("id", t.id).then(() =>
          logActivity(t.id, "SLA monitor", `SLA ${t.priority} breached — escalated to regional supervisor.`, "escalation"),
        );
      }
    }
  }, [escalations]);

  const kpis = [
    { label: "Open work orders", value: open.length, sub: "Awaiting closeout", icon: ClipboardList, tone: "border-l-primary" },
    { label: "In field", value: open.filter((t) => t.status === "in_progress").length, sub: "Technicians on task", icon: Wrench, tone: "border-l-primary" },
    { label: "SLA at risk", value: escalations.length, sub: "Needs dispatcher attention", icon: AlertTriangle, tone: "border-l-crit" },
    { label: "Closed today", value: tasks.filter((t) => t.status === "completed" && new Date(t.updated_at).toDateString() === new Date(now).toDateString()).length, sub: "Completed this shift", icon: CheckCircle2, tone: "border-l-ok" },
    { label: "Sites in alarm", value: sites.filter((s) => s.status === "alarm").length, sub: `${sites.length} sites monitored`, icon: MapPinned, tone: "border-l-warn" },
  ];

  return (
    <>
      <PageHead eyebrow="Dispatch overview / east region" title="Shift at a glance" sub="Live maintenance workload across the network."
        action={<Link to="/sites" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><MapPinned className="size-4" />Open live map</Link>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map(({ label, value, sub, icon: Icon, tone }) => (
          <Panel key={label} className={`border-l-4 p-4 ${tone}`}>
            <div className="flex justify-between text-xs font-medium text-muted-foreground">{label}<Icon className="size-4" /></div>
            <div className="mt-2 font-display text-3xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{sub}</div>
          </Panel>
        ))}
      </div>

      {escalations.length > 0 && (
        <Panel className="mt-4 border-crit/40 bg-crit/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-crit"><AlertTriangle className="size-4" />Alertes d'escalade SLA</div>
          <ul className="mt-2 space-y-1 text-sm">
            {escalations.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <Link to="/tasks/$id" params={{ id: t.id }} className="font-semibold hover:underline">{t.task_code} · {t.title}</Link>
                <span className="font-mono text-xs uppercase">{t.priority}</span>
                <SlaBadge task={t} now={now} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_400px]">
        <Panel>
          <div className="flex items-center justify-between border-b p-4">
            <div><h2 className="font-semibold">Active work queue</h2><p className="text-xs text-muted-foreground">SLA countdown by criticality (critical 4h · high 8h · medium 24h)</p></div>
            <Link to="/tasks" className="flex items-center gap-1 text-sm font-semibold text-primary">Dispatch board<ArrowRight className="size-4" /></Link>
          </div>
          {open.map((t) => (
            <Link key={t.id} to="/tasks/$id" params={{ id: t.id }} className="grid gap-2 border-b p-4 last:border-0 hover:bg-muted/50 md:grid-cols-[1.3fr_1fr_auto_auto] md:items-center">
              <div><div className="font-semibold">{t.title}</div><div className="font-mono text-xs text-muted-foreground">{t.task_code} · {t.type}</div></div>
              <div className="text-sm">
                {t.site && <span className={`mr-1.5 inline-block size-2 rounded-full ${SITE_STATUS[t.site.status as SiteStatus].cls}`} />}
                {t.site?.code} · {t.site?.name}
                <div className="text-xs text-muted-foreground">{t.technician?.name ?? "Unassigned"}</div>
              </div>
              <span className="w-fit rounded bg-secondary px-2 py-0.5 font-mono text-xs uppercase">{statusLabel(t.status)}</span>
              <SlaBadge task={t} now={now} />
            </Link>
          ))}
        </Panel>
        <Panel>
          <div className="border-b p-4"><h2 className="font-semibold">Operations log</h2><p className="text-xs text-muted-foreground">Recent field and dispatch updates</p></div>
          <ul className="max-h-[520px] divide-y overflow-y-auto">
            {activity.map((a) => (
              <li key={a.id} className="p-4 text-sm">
                <span className="font-semibold">{a.actor}</span> {a.message}
                <div className="mt-1 font-mono text-xs text-muted-foreground">{a.task?.task_code} · {fmtTime(a.created_at)}</div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
