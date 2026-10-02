import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { PageHead, Panel } from "@/components/AppShell";
import { DEFAULT_PREFS, SITE_STATUS, loadPrefs, savePrefs, sla, statusLabel, useSiteEvents, useSites, useTasks, type AlertPrefs, type SiteStatus } from "@/lib/ops";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & alerts — GSM O&M" },
      { name: "description", content: "Export site status and intervention reports by period, and configure site alerts." },
      { property: "og:title", content: "Reports & alerts — GSM O&M" },
      { property: "og:description", content: "Export site status and intervention reports by period, and configure site alerts." },
    ],
  }),
  component: Reports,
});

const day = (d: Date) => d.toISOString().slice(0, 10);
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function Reports() {
  const { data: sites = [] } = useSites();
  const { data: tasks = [] } = useTasks();
  const { data: events = [] } = useSiteEvents();
  const [from, setFrom] = useState(() => day(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(() => day(new Date()));
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_PREFS);
  useEffect(() => setPrefs(loadPrefs()), []);
  const update = (p: AlertPrefs) => { setPrefs(p); savePrefs(p); };

  const start = new Date(from).getTime(), end = new Date(to).getTime() + 864e5;
  const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t >= start && t < end; };
  const pTasks = tasks.filter((t) => inRange(t.created_at));
  const pEvents = events.filter((e) => inRange(e.created_at));
  const siteName = (id: string) => sites.find((s) => s.id === id)?.code ?? "";

  function exportCsv() {
    const rows: unknown[][] = [
      [`Rapport GSM O&M ${from} → ${to}`], [],
      ["STATUT DES SITES"], ["Code", "Nom", "Région", "Statut", "Dernière alerte", "Mis à jour"],
      ...sites.map((s) => [s.code, s.name, s.region, SITE_STATUS[s.status as SiteStatus].label, s.last_alert, s.updated_at]), [],
      ["CHANGEMENTS DE STATUT"], ["Date", "Site", "Ancien", "Nouveau"],
      ...pEvents.map((e) => [e.created_at, siteName(e.site_id), e.old_status, e.new_status]), [],
      ["INTERVENTIONS"], ["Code", "Type", "Titre", "Site", "Priorité", "Statut", "Technicien", "Créée", "Clôturée", "SLA"],
      ...pTasks.map((t) => [t.task_code, t.type, t.title, t.site?.code, t.priority, statusLabel(t.status), t.technician?.name, t.created_at, t.completed_at,
        t.completed_at ? (new Date(t.completed_at).getTime() <= sla(t, 0).deadline ? "respecté" : "dépassé") : sla(t, Date.now()).state]),
    ];
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rapport-gsm-om-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <PageHead eyebrow="Dispatch / reports" title="Rapports & alertes" sub="Statuts des sites et interventions par période." />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel className="p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label><span className="eyebrow">Du</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-10 rounded-md border bg-card px-3 text-sm" /></label>
            <label><span className="eyebrow">Au</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-10 rounded-md border bg-card px-3 text-sm" /></label>
            <button onClick={exportCsv} className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"><Download className="size-4" />Exporter (CSV)</button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Interventions", pTasks.length],
              ["Clôturées", pTasks.filter((t) => t.status === "completed").length],
              ["Changements de statut", pEvents.length],
              ["Passages en panne", pEvents.filter((e) => e.new_status === "alarm").length],
            ].map(([l, v]) => <div key={l} className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="font-display text-2xl font-bold">{v}</div></div>)}
          </div>
          <h3 className="eyebrow mt-6 mb-2">Statut actuel des sites</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {(Object.keys(SITE_STATUS) as SiteStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-2"><span className={`size-3 rounded-full ${SITE_STATUS[s].cls}`} />{SITE_STATUS[s].label} : <b>{sites.filter((x) => x.status === s).length}</b></span>
            ))}
          </div>
        </Panel>
        <Panel className="h-fit space-y-3 p-5">
          <h2 className="font-semibold">Alertes de statut</h2>
          <p className="text-xs text-muted-foreground">Notifications affichées en direct sur ce poste de dispatch.</p>
          {([["down", "Site hors service (alarme / panne)"], ["maintenance", "Site passé en maintenance"], ["restored", "Site revenu à la normale"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center justify-between gap-3 text-sm">
              {l}
              <input type="checkbox" checked={prefs[k]} onChange={(e) => update({ ...prefs, [k]: e.target.checked })} className="size-5 accent-primary" />
            </label>
          ))}
        </Panel>
      </div>
    </>
  );
}
