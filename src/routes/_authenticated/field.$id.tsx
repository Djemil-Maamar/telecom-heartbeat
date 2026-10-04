import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { analyzeFieldReport } from "@/lib/gpm-ai.functions";
import type { GpmAnalysis } from "@/lib/gpm-ai.server";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { fmtTime, logActivity, useMe, useTasks } from "@/lib/ops";
import { fileToPhoto, runOrQueue } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/field/$id")({
  head: () => ({
    meta: [
      { title: "Fiche d'intervention terrain — GSM O&M" },
      { name: "description", content: "Mobile field checklist with hour meter, fuel, battery voltage and photos." },
      { property: "og:title", content: "Fiche d'intervention terrain — GSM O&M" },
      { property: "og:description", content: "Mobile field checklist with hour meter, fuel, battery voltage and photos." },
    ],
  }),
  component: FieldSheet,
});

const CHECKLISTS: Record<string, string[]> = {
  GPM: ["Niveau d'huile vérifié / vidange", "Filtres huile, air, carburant", "Liquide de refroidissement", "Courroies et durites", "Test de charge (30 min)", "Inverseur ATS testé", "Fuites carburant / huile", "Propreté du local groupe"],
  PM: ["Inspection visuelle BTS", "Revue des alarmes", "Mise à la terre", "Climatisation shelter", "Redresseurs et batteries"],
  CM: ["Diagnostic de la panne", "Remplacement / réparation", "Test de fonctionnement", "Alarme levée côté NOC"],
};

function FieldSheet() {
  const { id } = Route.useParams();
  const { data: tasks } = useTasks();
  const qc = useQueryClient();
  const task = tasks?.find((t) => t.id === id);
  const items: string[] = CHECKLISTS[task?.type ?? "GPM"] ?? [];
  const { data: me } = useMe();
  const [tech, setTech] = useState("");
  const techName = tech || (me?.email?.split("@")[0] ?? "");
  const [hours, setHours] = useState("");
  const [fuel, setFuel] = useState(50);
  const [volts, setVolts] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState<GpmAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const analyze = useServerFn(analyzeFieldReport);

  const reports = useQuery({
    queryKey: ["reports", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_field_reports").select("*").eq("task_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return Promise.all(data.map(async (r) => ({
        ...r,
        urls: (await Promise.all(r.photos.map((p) => supabase.storage.from("field-photos").createSignedUrl(p, 3600)))).map((x) => x.data?.signedUrl).filter(Boolean) as string[],
      })));
    },
  });

  if (!task) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const isGpm = task.type === "GPM";

  async function runAnalysis() {
    if (!navigator.onLine) { toast.error("Analyse IA indisponible hors ligne"); return; }
    setAnalyzing(true);
    try {
      const photos = await Promise.all(files.slice(0, 4).map(shrinkImage));
      const res = await analyze({ data: {
        type: task!.type, site: `${task!.site?.code ?? ""} ${task!.site?.name ?? ""}`.trim(), equipment: task!.equipment ?? null,
        hourMeter: hours ? Number(hours) : null, fuelPct: isGpm ? fuel : null, batteryV: volts ? Number(volts) : null,
        checklist: items.map((i) => ({ item: i, done: !!checked[i] })), notes,
        previous: (reports.data ?? []).slice(0, 5).map((r) => ({ at: r.created_at, hourMeter: r.hour_meter, fuelPct: r.fuel_level_pct, batteryV: r.battery_voltage })),
        photos,
      } });
      setAnalysis(res);
    } catch (err) { toast.error((err as Error).message); }
    finally { setAnalyzing(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const tech_ = techName; if (!tech_.trim()) { toast.error("Nom du technicien requis"); return; }
    setSaving(true);
    try {
      const photos = await Promise.all(files.map(fileToPhoto));
      const res = await runOrQueue({
        kind: "report",
        row: {
          task_id: id, technician_name: techName.trim(), notes,
          hour_meter: hours ? Number(hours) : null, fuel_level_pct: isGpm ? fuel : null, battery_voltage: volts ? Number(volts) : null,
          checklist: checked, photos: [], ai_analysis: analysis,
        },
        photos,
      });
      const done = items.filter((i) => checked[i]).length;
      await logActivity(id, techName.trim(), `Fiche terrain soumise : ${done}/${items.length} points${hours ? `, compteur ${hours} h` : ""}${isGpm ? `, carburant ${fuel}%` : ""}${volts ? `, batterie ${volts} V` : ""}${photos.length ? `, ${photos.length} photo(s)` : ""}.`, "field_update");
      if (res === "queued") toast.info("Hors ligne : fiche enregistrée sur l'appareil, envoi automatique au retour du réseau");
      if (res === "sent") toast.success("Fiche enregistrée");
      setChecked({}); setFiles([]); setNotes(""); setAnalysis(null);
      qc.invalidateQueries();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/tasks/$id" params={{ id }} className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowLeft className="size-4" />{task.task_code}</Link>
      <div className="eyebrow !text-primary">Fiche d'intervention · {task.type}{isGpm && " · Generator preventive maintenance"}</div>
      <h1 className="text-2xl font-bold">{task.title}</h1>
      <p className="text-sm text-muted-foreground">{task.site?.code} · {task.site?.name} · {task.equipment}</p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Panel className="space-y-3 p-4">
          <input value={techName} onChange={(e) => setTech(e.target.value)} placeholder="Technicien / indicatif" className="h-12 w-full rounded-lg border bg-card px-3 text-base" />
          <div className="grid grid-cols-2 gap-3">
            <label><span className="eyebrow">Compteur horaire (h)</span>
              <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} className="mt-1 h-12 w-full rounded-lg border bg-card px-3 text-base" placeholder="ex. 12450" /></label>
            <label><span className="eyebrow">Tension batterie (V)</span>
              <input inputMode="decimal" value={volts} onChange={(e) => setVolts(e.target.value)} className="mt-1 h-12 w-full rounded-lg border bg-card px-3 text-base" placeholder="ex. 53.4" /></label>
          </div>
          {isGpm && (
            <label className="block"><span className="eyebrow">Niveau de carburant : {fuel}%</span>
              <input type="range" min={0} max={100} step={5} value={fuel} onChange={(e) => setFuel(Number(e.target.value))} className="mt-2 w-full accent-primary" />
              {fuel < 25 && <span className="text-xs font-semibold text-crit">Niveau bas — prévoir ravitaillement</span>}
            </label>
          )}
        </Panel>
        <Panel className="divide-y">
          {items.map((i) => (
            <button type="button" key={i} onClick={() => setChecked({ ...checked, [i]: !checked[i] })} className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-sm">
              <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${checked[i] ? "border-primary bg-primary text-primary-foreground" : ""}`}>{checked[i] && <Check className="size-4" />}</span>{i}
            </button>
          ))}
        </Panel>
        <Panel className="space-y-3 p-4">
          <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm font-semibold">
            <Camera className="size-5" />Ajouter des photos ({files.length})
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations…" className="min-h-20 w-full rounded-lg border bg-card p-3 text-base" />
        </Panel>
        <Panel className="space-y-3 p-4">
          <button type="button" onClick={runAnalysis} disabled={analyzing} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-primary text-sm font-semibold text-primary disabled:opacity-60">
            <Sparkles className="size-5" />{analyzing ? "Analyse en cours…" : "Analyser avec l'IA (anomalies & actions)"}
          </button>
          {analysis && <AnalysisView a={analysis} />}
        </Panel>
        <button disabled={saving} className="h-14 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60">{saving ? "Envoi…" : "Soumettre la fiche"}</button>
      </form>

      <h2 className="mt-8 font-semibold">Fiches précédentes</h2>
      {reports.data?.map((r) => (
        <Panel key={r.id} className="mt-2 p-4 text-sm">
          <div className="font-semibold">{r.technician_name} · {fmtTime(r.created_at)}</div>
          <div className="text-xs text-muted-foreground">Compteur {r.hour_meter ?? "—"} h · Carburant {r.fuel_level_pct ?? "—"}% · Batterie {r.battery_voltage ?? "—"} V</div>
          {r.notes && <p className="mt-1">{r.notes}</p>}
          {r.ai_analysis && <div className="mt-2"><AnalysisView a={r.ai_analysis as unknown as GpmAnalysis} /></div>}
          <div className="mt-2 flex flex-wrap gap-2">{r.urls.map((u) => <img key={u} src={u} alt="Photo terrain" className="size-20 rounded-md object-cover" />)}</div>
        </Panel>
      ))}
    </div>
  );
}

const SEV: Record<string, string> = { ok: "text-ok", warning: "text-warn", critical: "text-crit" };
const SEV_LABEL: Record<string, string> = { ok: "RAS", warning: "Attention", critical: "Critique" };
const PRIO: Record<string, string> = { immediate: "Immédiat", soon: "Sous 48 h", routine: "Routine" };

function AnalysisView({ a }: { a: GpmAnalysis }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2"><span className="eyebrow">Analyse IA</span><span className={`font-mono text-xs font-bold uppercase ${SEV[a.severity] ?? ""}`}>{SEV_LABEL[a.severity] ?? a.severity}</span></div>
      <p>{a.summary}</p>
      {a.anomalies?.length > 0 && <ul className="space-y-1">{a.anomalies.map((x, i) => (
        <li key={i}><span className={`font-semibold ${SEV[x.severity] ?? ""}`}>⚠ {x.title}</span> — <span className="text-muted-foreground">{x.detail}</span></li>))}</ul>}
      {a.actions?.length > 0 && <div><div className="eyebrow">Prochaines actions</div><ol className="mt-1 list-decimal space-y-1 pl-5">{a.actions.map((x, i) => (
        <li key={i}>{x.action} <span className="font-mono text-xs text-muted-foreground">· {PRIO[x.priority] ?? x.priority}</span></li>))}</ol></div>}
    </div>
  );
}

/** Downscales a photo to max 1024 px JPEG before sending it for analysis. */
function shrinkImage(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1024 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(f);
  });
}
