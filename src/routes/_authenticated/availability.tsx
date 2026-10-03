import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, Panel } from "@/components/AppShell";
import { ACTIVE, AVAIL_KIND, fmtTime, useAvailability, useMe, useTasks, useTechs } from "@/lib/ops";

export const Route = createFileRoute("/_authenticated/availability")({
  head: () => ({
    meta: [
      { title: "Disponibilités techniciens — GSM O&M" },
      { name: "description", content: "Weekly technician availability calendar to avoid dispatch conflicts." },
      { property: "og:title", content: "Disponibilités techniciens — GSM O&M" },
      { property: "og:description", content: "Weekly technician availability calendar to avoid dispatch conflicts." },
    ],
  }),
  component: AvailabilityPage,
});

const KIND_CLS: Record<string, string> = { off: "bg-muted-foreground/20", leave: "bg-crit/20 text-crit", training: "bg-warn/25", standby: "bg-ok/20 text-ok" };
const DAY = 864e5;
const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); };
const toLocalInput = (ms: number) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

function AvailabilityPage() {
  const { data: techs = [] } = useTechs();
  const { data: blocks = [] } = useAvailability();
  const { data: tasks = [] } = useTasks();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => week + i * DAY);
  const editable = techs.filter((t) => me?.isDispatcher || t.id === me?.technicianId);
  const [form, setForm] = useState({ tech: "", kind: "off", start: toLocalInput(Date.now() + DAY), end: toLocalInput(Date.now() + DAY + 8 * 3600e3), note: "" });
  const [dayIdx, setDayIdx] = useState(() => Math.min(6, Math.floor((Date.now() - startOfWeek(new Date())) / DAY)));

  const cell = useMemo(() => (techId: string, day: number) => ({
    blocks: blocks.filter((b) => b.technician_id === techId && new Date(b.starts_at).getTime() < day + DAY && new Date(b.ends_at).getTime() > day),
    tasks: tasks.filter((t) => t.technician_id === techId && ACTIVE.includes(t.status) && t.due_at && new Date(t.due_at).getTime() >= day && new Date(t.due_at).getTime() < day + DAY),
  }), [blocks, tasks]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const tech = form.tech || editable[0]?.id;
    if (!tech) { toast.error("Aucun technicien modifiable"); return; }
    const { error } = await supabase.from("ops_tech_availability").insert({ technician_id: tech, kind: form.kind, starts_at: new Date(form.start).toISOString(), ends_at: new Date(form.end).toISOString(), note: form.note || null });
    if (error) { toast.error(error.message); return; }
    toast.success("Indisponibilité ajoutée");
    qc.invalidateQueries({ queryKey: ["availability"] });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("ops_tech_availability").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["availability"] });
  }
  const canEdit = (techId: string) => me?.isDispatcher || techId === me?.technicianId;

  const Cell = ({ techId, day }: { techId: string; day: number }) => {
    const c = cell(techId, day);
    return (
      <div className="space-y-1">
        {c.blocks.map((b) => (
          <div key={b.id} className={`flex items-start justify-between gap-1 rounded px-1.5 py-1 text-[11px] ${KIND_CLS[b.kind]}`} title={b.note ?? ""}>
            <span>{AVAIL_KIND[b.kind]} {new Date(b.starts_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}–{new Date(b.ends_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            {canEdit(techId) && <button onClick={() => remove(b.id)} aria-label="Supprimer" className="p-0.5"><Trash2 className="size-3" /></button>}
          </div>
        ))}
        {c.tasks.map((t) => <div key={t.id} className="rounded bg-primary/15 px-1.5 py-1 font-mono text-[11px] text-primary">{t.task_code}</div>)}
        {!c.blocks.length && !c.tasks.length && <div className="text-[11px] text-ok">Disponible</div>}
      </div>
    );
  };

  return (
    <>
      <PageHead eyebrow="Dispatch / planning" title="Disponibilités" sub="Repos, congés et formations bloquent l'assignation ; les interventions planifiées apparaissent en bleu." />
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => setWeek(week - 7 * DAY)} aria-label="Semaine précédente" className="grid size-10 place-items-center rounded-md border bg-card"><ChevronLeft className="size-4" /></button>
        <span className="text-sm font-semibold">Semaine du {new Date(week).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</span>
        <button onClick={() => setWeek(week + 7 * DAY)} aria-label="Semaine suivante" className="grid size-10 place-items-center rounded-md border bg-card"><ChevronRight className="size-4" /></button>
        <button onClick={() => setWeek(startOfWeek(new Date()))} className="ml-auto h-10 rounded-md border bg-card px-3 text-sm">Aujourd'hui</button>
      </div>

      {/* Mobile: one day at a time */}
      <div className="md:hidden">
        <div className="mb-3 flex gap-1 overflow-x-auto">
          {days.map((d, i) => (
            <button key={d} onClick={() => setDayIdx(i)} className={`min-w-12 flex-1 rounded-md border py-2 text-center text-xs ${i === dayIdx ? "bg-primary text-primary-foreground" : "bg-card"}`}>
              {new Date(d).toLocaleDateString("fr-FR", { weekday: "short" })}<div className="font-semibold">{new Date(d).getDate()}</div>
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {techs.map((t) => (
            <Panel key={t.id} className="p-3">
              <div className="mb-1 text-sm font-semibold">{t.name} <span className="font-mono text-xs text-muted-foreground">{t.call_sign}</span></div>
              <Cell techId={t.id} day={days[dayIdx] ?? week} />
            </Panel>
          ))}
        </div>
      </div>

      {/* Desktop: week grid */}
      <Panel className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] table-fixed text-sm">
          <thead><tr className="border-b">
            <th className="w-44 p-3 text-left font-semibold">Technicien</th>
            {days.map((d) => <th key={d} className={`p-3 text-left text-xs font-semibold ${new Date(d).toDateString() === new Date().toDateString() ? "text-primary" : "text-muted-foreground"}`}>{new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}</th>)}
          </tr></thead>
          <tbody>
            {techs.map((t) => (
              <tr key={t.id} className="border-b align-top last:border-0">
                <td className="p-3"><div className="font-semibold">{t.name}</div><div className="font-mono text-xs text-muted-foreground">{t.call_sign}</div></td>
                {days.map((d) => <td key={d} className="p-2"><Cell techId={t.id} day={d} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {editable.length > 0 && (
        <Panel className="mt-4 p-4">
          <h2 className="mb-3 font-semibold">Ajouter une indisponibilité</h2>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <select value={form.tech} onChange={(e) => setForm({ ...form, tech: e.target.value })} className="h-11 rounded-md border bg-card px-2 text-sm lg:col-span-2">
              {editable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="h-11 rounded-md border bg-card px-2 text-sm">
              {Object.entries(AVAIL_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="h-11 rounded-md border bg-card px-2 text-sm" />
            <input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="h-11 rounded-md border bg-card px-2 text-sm" />
            <button className="h-11 rounded-md bg-primary text-sm font-semibold text-primary-foreground">Ajouter</button>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note (optionnel)" className="h-11 rounded-md border bg-card px-3 text-sm sm:col-span-2 lg:col-span-6" />
          </form>
          <p className="mt-2 text-xs text-muted-foreground">Prochaine indisponibilité : {fmtTime(blocks.find((b) => new Date(b.ends_at).getTime() > Date.now())?.starts_at)}</p>
        </Panel>
      )}
    </>
  );
}
