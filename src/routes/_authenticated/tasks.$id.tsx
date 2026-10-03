import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, Panel } from "@/components/AppShell";
import { SlaBadge } from "@/components/SlaBadge";
import { SLA_HOURS, TASK_STATUSES, fmtTime, logActivity, statusLabel, techConflicts, useActivity, useAvailability, useMe, useNow, useTasks, useTechs, type Task } from "@/lib/ops";
import { runOrQueue } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/tasks/$id")({
  head: () => ({
    meta: [
      { title: "Task detail — GSM O&M" },
      { name: "description", content: "Work order detail, dispatch assignment, SLA and activity log." },
      { property: "og:title", content: "Task detail — GSM O&M" },
      { property: "og:description", content: "Work order detail, dispatch assignment, SLA and activity log." },
    ],
  }),
  component: TaskDetail,
});

function TaskDetail() {
  const { id } = Route.useParams();
  const { data: tasks, isLoading } = useTasks();
  const { data: techs = [] } = useTechs();
  const { data: activity = [] } = useActivity(id);
  const now = useNow();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [actor, setActor] = useState("");
  const [cat, setCat] = useState<"field_update" | "note">("field_update");
  const [msg, setMsg] = useState("");
  const { data: me } = useMe();
  const { data: blocks = [] } = useAvailability();
  const task = tasks?.find((t) => t.id === id);
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!task) return <p>Work order not found. <Link to="/tasks" className="text-primary">Back</Link></p>;

  async function update(patch: Partial<Task>, note?: string) {
    try {
      const full = { ...patch, ...(patch.status === "completed" ? { completed_at: new Date().toISOString() } : {}) };
      // Optimistic cache update so the change is visible immediately, even offline.
      qc.setQueryData<typeof tasks>(["tasks"], (old) => old?.map((t) => (t.id === id ? { ...t, ...full } : t)));
      const res = await runOrQueue({ kind: "task_update", taskId: id, patch: full });
      if (note) await logActivity(id, me?.email?.split("@")[0] ?? "Operations Desk", note, "status_change");
      if (res === "queued") toast.info("Hors ligne : changement enregistré, synchronisation au retour du réseau");
      else qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); qc.invalidateQueries(); }
  }

  return (
    <>
      <PageHead eyebrow={`Dispatch / ${task.task_code}`} title={task.title} sub={`${task.task_code} · ${task.type} · created ${fmtTime(task.created_at)}`}
        action={<Link to="/tasks" className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold"><ArrowLeft className="size-4" />Back to board</Link>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs uppercase">{statusLabel(task.status)}</span>
              <span className="font-mono text-xs uppercase text-accent">{task.priority}</span>
              <SlaBadge task={task} now={now} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{task.description}</p>
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-sm md:grid-cols-3">
              <div><dt className="eyebrow">Site</dt><dd className="font-semibold">{task.site?.code} · {task.site?.name}</dd></div>
              <div><dt className="eyebrow">Region</dt><dd className="font-semibold">{task.site?.region}</dd></div>
              <div><dt className="eyebrow">Equipment</dt><dd className="font-semibold">{task.equipment ?? "—"}</dd></div>
              <div><dt className="eyebrow">Assigned to</dt><dd className="font-semibold">{task.technician?.name ?? "Unassigned"}</dd></div>
              <div><dt className="eyebrow">Due</dt><dd className="font-semibold">{fmtTime(task.due_at)}</dd></div>
              <div><dt className="eyebrow">Last updated</dt><dd className="font-semibold">{fmtTime(task.updated_at)}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {TASK_STATUSES.filter((s) => s !== "new").map((s) => (
                <button key={s} onClick={() => update({ status: s }, `Status changed to ${statusLabel(s)}.`)}
                  className={`min-h-11 flex-1 rounded-md border px-3 py-2 text-xs font-semibold capitalize sm:flex-none ${task.status === s ? "bg-primary text-primary-foreground" : ""}`}>{statusLabel(s)}</button>
              ))}
              <Link to="/field/$id" params={{ id }} className="flex min-h-11 w-full items-center justify-center gap-1 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground sm:w-auto"><ClipboardCheck className="size-4" />Fiche d'intervention</Link>
              {me?.isAdmin && <button onClick={async () => { if (!confirm("Delete this work order?")) return; await supabase.from("ops_tasks").delete().eq("id", id); qc.invalidateQueries(); nav({ to: "/tasks" }); }}
                className="ml-auto flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive"><Trash2 className="size-4" />Delete</button>}
            </div>
          </Panel>
          <Panel className="p-5">
            <h2 className="font-semibold">Task activity</h2>
            <ol className="mt-3 space-y-3 border-l pl-4">
              {activity.map((a) => (
                <li key={a.id} className="text-sm"><span className="font-semibold">{a.actor}</span> · {a.message}
                  <div className="font-mono text-xs text-muted-foreground">{statusLabel(a.category)} · {fmtTime(a.created_at)}</div></li>
              ))}
            </ol>
            <form className="mt-5 grid gap-3 border-t pt-4 md:grid-cols-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!actor.trim() || !msg.trim()) { toast.error("Name and update are required"); return; }
              await logActivity(id, actor.trim(), msg.trim(), cat);
              setMsg(""); qc.invalidateQueries({ queryKey: ["activity"] });
            }}>
              <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Your name or call sign" className="h-10 rounded-md border bg-card px-3 text-sm" />
              <select value={cat} onChange={(e) => setCat(e.target.value as "note")} className="h-10 rounded-md border bg-card px-3 text-sm"><option value="field_update">Field update</option><option value="note">Note</option></select>
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Record progress, findings, or access issues…" className="min-h-24 rounded-md border bg-card p-3 text-sm md:col-span-2" />
              <button className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Add to activity log</button>
            </form>
          </Panel>
        </div>
        <Panel className="order-first h-fit space-y-3 p-5 lg:order-none">
          <h2 className="font-semibold">Dispatch assignment</h2>
          {me?.isDispatcher ? (<>
          <label className="block"><span className="eyebrow">Technician</span>
            <select value={task.technician_id ?? ""} onChange={(e) => {
              const t = techs.find((x) => x.id === e.target.value);
              if (t) {
                const start = Date.now(), end = task.due_at ? new Date(task.due_at).getTime() : start + (SLA_HOURS[task.priority] ?? 24) * 3600_000;
                const c = techConflicts(t.id, start, Math.max(end, start + 3600_000), blocks, tasks ?? [], task.id);
                if (c.length && !confirm(`${t.name} a un conflit :\n- ${c.join("\n- ")}\n\nAssigner quand même ?`)) return;
              }
              update({ technician_id: e.target.value || null, ...(e.target.value && task.status === "new" ? { status: "dispatched" } : {}) }, t ? `Assigned to ${t.name}.` : "Unassigned.");
            }}
              className="mt-1 h-11 w-full rounded-md border bg-card px-3 text-sm"><option value="">Unassigned</option>{techs.map((t) => {
                const c = techConflicts(t.id, Date.now(), task.due_at ? Math.max(new Date(task.due_at).getTime(), Date.now() + 3600_000) : Date.now() + 4 * 3600_000, blocks, tasks ?? [], task.id);
                return <option key={t.id} value={t.id}>{t.name}{c.length ? " — conflit" : ""}</option>;
              })}</select></label>
          <label className="block"><span className="eyebrow">Priority</span>
            <select value={task.priority} onChange={(e) => update({ priority: e.target.value }, `Priority set to ${e.target.value}.`)} className="mt-1 h-11 w-full rounded-md border bg-card px-3 text-sm">
              {["critical", "high", "medium", "low"].map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          </>) : <p className="text-sm">Assigné à <b>{task.technician?.name ?? "—"}</b>. Mettez à jour le statut et remplissez la fiche terrain.</p>}
          <Link to="/sites" className="block text-sm font-semibold text-primary">Voir le site sur la carte →</Link>
        </Panel>
      </div>
    </>
  );
}
