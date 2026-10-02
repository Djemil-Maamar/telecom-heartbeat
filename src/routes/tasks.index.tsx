import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHead, Panel } from "@/components/AppShell";
import { SlaBadge } from "@/components/SlaBadge";
import { TASK_STATUSES, statusLabel, useNow, useTasks } from "@/lib/ops";

export const Route = createFileRoute("/tasks/")({
  head: () => ({
    meta: [
      { title: "Work orders — GSM O&M" },
      { name: "description", content: "Dispatch board of CM, PM and GPM work orders with SLA countdowns." },
      { property: "og:title", content: "Work orders — GSM O&M" },
      { property: "og:description", content: "Dispatch board of CM, PM and GPM work orders with SLA countdowns." },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { data: tasks = [] } = useTasks();
  const now = useNow();
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("active");
  const list = tasks.filter((t) => (type === "all" || t.type === type) && (status === "all" || (status === "active" ? !["completed", "cancelled"].includes(t.status) : t.status === status)));
  return (
    <>
      <PageHead eyebrow="Dispatch / work orders" title="Work orders" sub={`${list.length} work orders`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "CM", "PM", "GPM"].map((v) => (
          <button key={v} onClick={() => setType(v)} className={`rounded-md border px-3 py-2 text-sm ${type === v ? "bg-primary text-primary-foreground" : "bg-card"}`}>{v === "all" ? "All types" : v}</button>
        ))}
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border bg-card px-3 py-2 text-sm">
          <option value="active">Active</option><option value="all">All statuses</option>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </div>
      <Panel>
        {list.map((t) => (
          <Link key={t.id} to="/tasks/$id" params={{ id: t.id }} className="grid gap-2 border-b p-4 last:border-0 hover:bg-muted/50 md:grid-cols-[1.4fr_1fr_auto_auto_auto] md:items-center">
            <div><div className="font-semibold">{t.title}</div><div className="font-mono text-xs text-muted-foreground">{t.task_code} · {t.type}</div></div>
            <div className="text-sm">{t.site?.code} · {t.site?.name}<div className="text-xs text-muted-foreground">{t.technician?.name ?? "Unassigned"}</div></div>
            <span className="font-mono text-xs uppercase text-muted-foreground">{t.priority}</span>
            <span className="w-fit rounded bg-secondary px-2 py-0.5 font-mono text-xs uppercase">{statusLabel(t.status)}</span>
            <SlaBadge task={t} now={now} />
          </Link>
        ))}
        {list.length === 0 && <p className="p-6 text-sm text-muted-foreground">No work orders match.</p>}
      </Panel>
    </>
  );
}
