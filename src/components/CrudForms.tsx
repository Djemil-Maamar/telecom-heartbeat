import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useSites, type Site, type Task, type Technician } from "@/lib/ops";

type Field = { name: string; label: string; type?: "text" | "number" | "textarea" | "select" | "datetime"; options?: { value: string; label: string }[]; required?: boolean; full?: boolean };
type Values = Record<string, string>;

const inputCls = "mt-1 h-11 w-full rounded-md border bg-card px-3 text-sm";

function RecordDialog({ title, trigger, fields, initial, schema, onSave }: {
  title: string; trigger: ReactNode; fields: Field[]; initial: Values;
  schema: z.ZodTypeAny; onSave: (v: Record<string, unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(v);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Formulaire invalide"); return; }
    setBusy(true);
    try { await onSave(parsed.data); setOpen(false); toast.success("Enregistré"); }
    catch (err) { toast.error(friendly(err)); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setV(initial); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <label key={f.name} className={f.full || f.type === "textarea" ? "col-span-2" : "col-span-2 sm:col-span-1"}>
              <span className="eyebrow">{f.label}{f.required && " *"}</span>
              {f.type === "textarea" ? (
                <textarea value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} className="mt-1 min-h-20 w-full rounded-md border bg-card p-3 text-sm" />
              ) : f.type === "select" ? (
                <select value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} className={inputCls}>
                  {!f.required && <option value="">—</option>}
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input type={f.type === "datetime" ? "datetime-local" : "text"} inputMode={f.type === "number" ? "decimal" : undefined}
                  value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} className={inputCls} />
              )}
            </label>
          ))}
          <button disabled={busy} className="col-span-2 h-11 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Enregistrement…" : "Enregistrer"}</button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const friendly = (e: unknown) => {
  const m = String((e as Error)?.message ?? e);
  if (/foreign key|violates/i.test(m)) return "Impossible : cet élément est encore utilisé (interventions liées).";
  if (/duplicate|unique/i.test(m)) return "Ce code / indicatif existe déjà.";
  if (/row-level security|permission/i.test(m)) return "Vous n'avez pas les droits pour cette action.";
  return m;
};

const req = (label: string, max = 120) => z.string().trim().min(1, `${label} requis`).max(max, `${label} trop long`);
const opt = (max = 500) => z.string().trim().max(max).transform((s) => s || null);
const coord = (label: string, min: number, max: number) =>
  z.string().trim().transform(Number).refine((n) => Number.isFinite(n) && n >= min && n <= max, `${label} invalide`);
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

const btn = "flex items-center gap-1 rounded-md border bg-card px-3 py-2 text-sm font-semibold";
function useRefresh() { const qc = useQueryClient(); return () => qc.invalidateQueries(); }

// ---------- Sites ----------
const siteSchema = z.object({
  code: req("Code", 20).transform((s) => s.toUpperCase()), name: req("Nom"), region: req("Région", 60), state: req("État", 60),
  lat: coord("Latitude", -90, 90), lng: coord("Longitude", -180, 180), equipment: opt(), access_notes: opt(),
});
const siteFields: Field[] = [
  { name: "code", label: "Code site", required: true }, { name: "name", label: "Nom", required: true },
  { name: "region", label: "Région", required: true }, { name: "state", label: "État", required: true },
  { name: "lat", label: "Latitude", type: "number", required: true }, { name: "lng", label: "Longitude", type: "number", required: true },
  { name: "equipment", label: "Équipement", full: true }, { name: "access_notes", label: "Notes d'accès", type: "textarea" },
];
export function SiteForm({ site }: { site?: Site }) {
  const refresh = useRefresh();
  const init: Values = site ? { code: site.code, name: site.name, region: site.region, state: site.state, lat: String(site.lat), lng: String(site.lng), equipment: site.equipment ?? "", access_notes: site.access_notes ?? "" } : {};
  return <RecordDialog title={site ? `Modifier ${site.code}` : "Nouveau site"} fields={siteFields} initial={init} schema={siteSchema}
    trigger={<button className={btn}>{site ? <Pencil className="size-4" /> : <Plus className="size-4" />}{site ? "Modifier" : "Nouveau site"}</button>}
    onSave={async (d) => {
      const { error } = site ? await supabase.from("ops_sites").update(d as never).eq("id", site.id) : await supabase.from("ops_sites").insert(d as never);
      if (error) throw error; refresh();
    }} />;
}

// ---------- Technicians ----------
const AVAIL = [{ value: "available", label: "Disponible" }, { value: "on_task", label: "En intervention" }, { value: "off_duty", label: "Hors service" }];
const techSchema = z.object({
  name: req("Nom"), call_sign: req("Indicatif", 20).transform((s) => s.toUpperCase()), region: req("Région", 60),
  phone: z.string().trim().max(30).regex(/^[+\d\s()-]*$/, "Téléphone invalide").transform((s) => s || null),
  availability: z.enum(["available", "on_task", "off_duty"]), lat: coord("Latitude", -90, 90), lng: coord("Longitude", -180, 180),
});
const techFields: Field[] = [
  { name: "name", label: "Nom", required: true }, { name: "call_sign", label: "Indicatif", required: true },
  { name: "region", label: "Région", required: true }, { name: "phone", label: "Téléphone" },
  { name: "availability", label: "Disponibilité", type: "select", options: AVAIL, required: true, full: true },
  { name: "lat", label: "Latitude (base)", type: "number", required: true }, { name: "lng", label: "Longitude (base)", type: "number", required: true },
];
export function TechForm({ tech }: { tech?: Technician }) {
  const refresh = useRefresh();
  const init: Values = tech ? { name: tech.name, call_sign: tech.call_sign, region: tech.region, phone: tech.phone ?? "", availability: tech.availability, lat: String(tech.lat), lng: String(tech.lng) } : { availability: "available" };
  return <RecordDialog title={tech ? `Modifier ${tech.name}` : "Nouveau technicien"} fields={techFields} initial={init} schema={techSchema}
    trigger={<button className={tech ? "grid size-9 place-items-center rounded-md border" : btn} aria-label={tech ? "Modifier" : undefined}>{tech ? <Pencil className="size-4" /> : <><Plus className="size-4" />Nouveau technicien</>}</button>}
    onSave={async (d) => {
      const { error } = tech ? await supabase.from("ops_technicians").update(d as never).eq("id", tech.id) : await supabase.from("ops_technicians").insert(d as never);
      if (error) throw error; refresh();
    }} />;
}

// ---------- Work orders ----------
const TYPES = ["CM", "PM", "GPM"].map((t) => ({ value: t, label: t }));
const PRIOS = ["critical", "high", "medium", "low"].map((p) => ({ value: p, label: p }));
const taskSchema = z.object({
  title: req("Titre", 160), type: z.enum(["CM", "PM", "GPM"]), priority: z.enum(["critical", "high", "medium", "low"]),
  site_id: z.string().uuid("Site requis"), equipment: opt(120), description: z.string().trim().max(2000),
  due_at: z.string().transform((s) => (s ? new Date(s).toISOString() : null)),
});
export function TaskForm({ task, siteId }: { task?: Task; siteId?: string }) {
  const refresh = useRefresh();
  const { data: sites = [] } = useSites();
  const fields: Field[] = [
    { name: "title", label: "Titre", required: true, full: true },
    { name: "type", label: "Type", type: "select", options: TYPES, required: true },
    { name: "priority", label: "Priorité", type: "select", options: PRIOS, required: true },
    { name: "site_id", label: "Site", type: "select", required: true, full: true, options: sites.map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` })) },
    { name: "equipment", label: "Équipement" }, { name: "due_at", label: "Échéance", type: "datetime" },
    { name: "description", label: "Description", type: "textarea" },
  ];
  const init: Values = task
    ? { title: task.title, type: task.type, priority: task.priority, site_id: task.site_id, equipment: task.equipment ?? "", description: task.description, due_at: toLocal(task.due_at) }
    : { type: "CM", priority: "medium", site_id: siteId ?? sites[0]?.id ?? "" };
  return <RecordDialog title={task ? `Modifier ${task.task_code}` : "Nouvel ordre de travail"} fields={fields} initial={init} schema={taskSchema}
    trigger={<button className={task ? btn : "flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"}>{task ? <Pencil className="size-4" /> : <Plus className="size-4" />}{task ? "Modifier" : "Nouvel ordre"}</button>}
    onSave={async (d) => {
      if (task) {
        const { error } = await supabase.from("ops_tasks").update(d as never).eq("id", task.id); if (error) throw error;
      } else {
        const code = `${d.type}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const { error } = await supabase.from("ops_tasks").insert({ ...(d as object), task_code: code, status: "new" } as never); if (error) throw error;
      }
      refresh();
    }} />;
}

// ---------- Delete ----------
export function DeleteButton({ table, id, label, onDone, iconOnly }: { table: "ops_sites" | "ops_technicians"; id: string; label: string; onDone?: () => void; iconOnly?: boolean }) {
  const refresh = useRefresh();
  return (
    <button aria-label={`Supprimer ${label}`} onClick={async () => {
      if (!confirm(`Supprimer ${label} ? Cette action est définitive.`)) return;
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) { toast.error(friendly(error)); return; }
      toast.success("Supprimé"); onDone?.(); refresh();
    }} className={iconOnly ? "grid size-9 place-items-center rounded-md border border-destructive/40 text-destructive" : "flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive"}>
      <Trash2 className="size-4" />{!iconOnly && "Supprimer"}
    </button>
  );
}
