import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, X, Navigation, Phone, Clock, Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, Panel } from "@/components/AppShell";
import { SlaBadge } from "@/components/SlaBadge";
import {
  ACTIVE, SITE_STATUS, statusLabel, distanceKm, fmtTime, logActivity, useNow, useLiveState, useSiteEvents, useSites, useTasks, useTechs,
  type SiteStatus,
} from "@/lib/ops";

const SiteMap = lazy(() => import("@/components/SiteMap"));

export const Route = createFileRoute("/sites")({
  head: () => ({
    meta: [
      { title: "Network sites map — GSM O&M" },
      { name: "description", content: "Live map of telecom sites with status, alerts and nearest technician dispatch." },
      { property: "og:title", content: "Network sites map — GSM O&M" },
      { property: "og:description", content: "Live map of telecom sites with status, alerts and nearest technician dispatch." },
    ],
  }),
  component: SitesPage,
});

const STATUSES = Object.keys(SITE_STATUS) as SiteStatus[];

function SitesPage() {
  const { data: sites = [] } = useSites();
  const { data: techs = [] } = useTechs();
  const { data: tasks = [] } = useTasks();
  const { live, lastEvent } = useLiveState();
  const now = useNow();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Set<SiteStatus>>(new Set(STATUSES));
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: number } | null>(null);

  const visible = sites.filter((s) => filters.has(s.status as SiteStatus));
  const matches = query.trim()
    ? sites.filter((s) => `${s.code} ${s.name}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : [];
  const selected = sites.find((s) => s.id === selectedId) ?? null;
  const siteTasks = tasks.filter((t) => t.site_id === selectedId && ACTIVE.includes(t.status));
  const nearest = useMemo(
    () => (selected ? techs.filter((t) => t.availability !== "off_duty").map((t) => ({ t, d: distanceKm(selected, t) })).sort((a, b) => a.d - b.d).slice(0, 3) : []),
    [selected, techs],
  );
  const { data: events = [] } = useSiteEvents(selectedId);
  const allSiteTasks = tasks.filter((t) => t.site_id === selectedId);
  const history = [
    ...events.map((e) => ({ at: e.created_at, kind: "status" as const, text: `Statut : ${SITE_STATUS[(e.old_status ?? "normal") as SiteStatus]?.label ?? e.old_status} → ${SITE_STATUS[e.new_status as SiteStatus]?.label ?? e.new_status}` })),
    ...allSiteTasks.map((t) => ({ at: t.completed_at ?? t.created_at, kind: "task" as const, text: `${t.task_code} · ${t.title} — ${statusLabel(t.status)}${t.technician ? ` (${t.technician.name})` : ""}`, id: t.id })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const lastUpdate = sites.reduce((m, s) => Math.max(m, new Date(s.updated_at).getTime()), 0);

  const select = (id: string) => {
    const s = sites.find((x) => x.id === id);
    setSelectedId(id);
    if (s) {
      if (!filters.has(s.status as SiteStatus)) setFilters(new Set([...filters, s.status as SiteStatus]));
      setFocus({ lat: s.lat, lng: s.lng, key: Date.now() });
    }
    setQuery("");
  };

  const toggle = (st: SiteStatus) => {
    const next = new Set(filters);
    next.has(st) ? next.delete(st) : next.add(st);
    setFilters(next);
  };

  async function setStatus(status: SiteStatus) {
    if (!selected) return;
    const { error } = await supabase.from("ops_sites").update({ status }).eq("id", selected.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["sites"] });
  }

  async function assign(techId: string, techName: string) {
    if (!selected) return;
    try {
      let task = siteTasks.sort((a, b) => ["critical", "high", "medium", "low"].indexOf(a.priority) - ["critical", "high", "medium", "low"].indexOf(b.priority))[0];
      if (!task) {
        const { data, error } = await supabase
          .from("ops_tasks")
          .insert({
            task_code: `CM-${Date.now().toString().slice(-6)}`,
            title: selected.last_alert ?? `Intervention ${selected.code}`,
            type: "CM",
            priority: selected.status === "alarm" ? "critical" : "medium",
            site_id: selected.id,
            equipment: selected.equipment,
            due_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
          })
          .select()
          .single();
        if (error) throw error;
        task = { ...data, site: selected, technician: null };
      }
      const { error } = await supabase.from("ops_tasks").update({ technician_id: techId, status: "dispatched" }).eq("id", task.id);
      if (error) throw error;
      await supabase.from("ops_technicians").update({ availability: "on_task" }).eq("id", techId);
      await logActivity(task.id, "Operations Desk", `Dispatched ${techName} (nearest technician).`, "status_change");
      qc.invalidateQueries();
      toast.success(`${techName} dispatched to ${selected.code}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Network sites / live map"
        title="Carte des sites"
        sub="Localisez les pannes et assignez le technicien le plus proche."
        action={
          <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs">
            <span className={`size-2 rounded-full ${live ? "bg-ok" : "bg-warn"}`} />
            <span className="font-mono">{live ? "LIVE" : "OFFLINE"}</span>
            <Clock className="size-3 text-muted-foreground" />
            <span>Dernière mise à jour : {fmtTime(new Date(Math.max(lastUpdate, lastEvent ?? 0) || now).toISOString())}</span>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && matches[0] && select(matches[0].id)}
            placeholder="Rechercher un site (nom ou ID)…"
            className="h-11 w-full rounded-lg border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {matches.length > 0 && (
            <ul className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
              {matches.map((s) => (
                <li key={s.id}>
                  <button onClick={() => select(s.id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted">
                    <span className={`size-2.5 rounded-full ${SITE_STATUS[s.status as SiteStatus].cls}`} />
                    <span className="font-mono text-xs">{s.code}</span> {s.name}
                    <span className="ml-auto text-xs text-muted-foreground">{s.region}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtres et légende">
          {STATUSES.map((st) => {
            const on = filters.has(st);
            const n = sites.filter((s) => s.status === st).length;
            return (
              <button key={st} onClick={() => toggle(st)} aria-pressed={on}
                className={`flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${on ? "bg-card" : "bg-transparent opacity-50 line-through"}`}>
                <span className={`size-3 rounded-full ${SITE_STATUS[st].cls}`} />
                {SITE_STATUS[st].label}
                <span className="font-mono text-xs text-muted-foreground">{n}</span>
              </button>
            );
          })}
          <span className="flex h-11 items-center gap-2 px-2 text-xs text-muted-foreground">
            <span className="grid size-4 place-items-center rounded bg-sidebar text-[8px] text-sidebar-primary">T</span> Technicien
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel className="relative h-[60vh] overflow-hidden lg:h-[640px]">
          <ClientOnly fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Chargement de la carte…</div>}>
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Chargement de la carte…</div>}>
              <SiteMap sites={visible} techs={techs} selectedId={selectedId} focus={focus} onSelect={select} />
            </Suspense>
          </ClientOnly>
        </Panel>

        <Panel className="p-5 lg:max-h-[640px] lg:overflow-y-auto">
          {!selected ? (
            <div className="space-y-3">
              <h2 className="font-semibold">Sites en alerte</h2>
              {sites.filter((s) => s.status !== "normal").map((s) => (
                <button key={s.id} onClick={() => select(s.id)} className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted">
                  <span className={`mt-1 size-3 shrink-0 rounded-full ${SITE_STATUS[s.status as SiteStatus].cls}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold"><span className="font-mono text-xs">{s.code}</span> · {s.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.last_alert ?? "—"} · {fmtTime(s.last_alert_at)}</div>
                  </div>
                </button>
              ))}
              <p className="text-xs text-muted-foreground">Touchez un marqueur pour ouvrir la fiche du site.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="eyebrow !text-primary">{selected.code}</div>
                  <h2 className="text-lg font-bold">{selected.name}</h2>
                  <div className="text-xs text-muted-foreground">{selected.region} · {selected.state}</div>
                </div>
                <button onClick={() => setSelectedId(null)} aria-label="Fermer" className="rounded-md p-2 hover:bg-muted"><X className="size-4" /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((st) => (
                  <button key={st} onClick={() => setStatus(st)}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${selected.status === st ? "ring-2 ring-ring" : "opacity-70"}`}>
                    <span className={`size-2 rounded-full ${SITE_STATUS[st].cls}`} />{SITE_STATUS[st].label}
                  </button>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2"><dt className="eyebrow">Dernière alerte</dt><dd className="font-medium">{selected.last_alert ?? "Aucune"} <span className="text-xs text-muted-foreground">{fmtTime(selected.last_alert_at)}</span></dd></div>
                <div><dt className="eyebrow">Équipement</dt><dd>{selected.equipment ?? "—"}</dd></div>
                <div><dt className="eyebrow">Mis à jour</dt><dd>{fmtTime(selected.updated_at)}</dd></div>
                <div className="col-span-2"><dt className="eyebrow">Accès</dt><dd>{selected.access_notes ?? "—"}</dd></div>
              </dl>

              <div>
                <h3 className="eyebrow mb-2">Interventions ouvertes</h3>
                {siteTasks.length === 0 && <p className="text-xs text-muted-foreground">Aucune intervention ouverte.</p>}
                {siteTasks.map((t) => (
                  <Link key={t.id} to="/tasks/$id" params={{ id: t.id }} className="mb-2 block rounded-lg border p-2.5 hover:bg-muted">
                    <div className="text-sm font-semibold">{t.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono uppercase text-muted-foreground">{t.priority}</span>
                      <SlaBadge task={t} now={now} />
                      <span className="text-muted-foreground">{t.technician?.name ?? "Non assigné"}</span>
                    </div>
                  </Link>
                ))}
              </div>

              <AssignBox techs={techs} onAssign={assign} />
              <div>
                <h3 className="eyebrow mb-2">Techniciens les plus proches</h3>
                {nearest.map(({ t, d }, i) => (
                  <div key={t.id} className="mb-2 flex items-center gap-3 rounded-lg border p-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{t.name} <span className="font-mono text-xs text-muted-foreground">{t.call_sign}</span></div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Navigation className="size-3" />{d.toFixed(1)} km · {t.availability.replace("_", " ")}
                        {t.phone && <a href={`tel:${t.phone}`} className="inline-flex items-center gap-1 text-primary"><Phone className="size-3" />Appeler</a>}
                      </div>
                    </div>
                    <button onClick={() => assign(t.id, t.name)}
                      className={`rounded-md px-3 py-2 text-xs font-semibold ${i === 0 ? "bg-primary text-primary-foreground" : "border"}`}>
                      Assigner
                    </button>
                  </div>
                ))}
                {nearest.length === 0 && <p className="text-xs text-muted-foreground">Aucun technicien disponible.</p>}
              </div>
              <div>
                <h3 className="eyebrow mb-2">Historique</h3>
                <ol className="space-y-2 border-l pl-3">
                  {history.map((h, i) => (
                    <li key={i} className="relative text-xs">
                      <span className={`absolute -left-[17px] top-1 size-2 rounded-full ${h.kind === "status" ? "bg-warn" : "bg-primary"}`} />
                      <div>{"id" in h && h.id ? <Link to="/tasks/$id" params={{ id: h.id }} className="hover:underline">{h.text}</Link> : h.text}</div>
                      <div className="font-mono text-muted-foreground">{fmtTime(h.at)}</div>
                    </li>
                  ))}
                  {history.length === 0 && <li className="text-xs text-muted-foreground">Aucun historique.</li>}
                </ol>
              </div>
            </div>
          )}
        </Panel>
      </div>
      <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><Radio className="size-3" />Les statuts se mettent à jour automatiquement en temps réel.</p>
    </>
  );
}

function AssignBox({ techs, onAssign }: { techs: { id: string; name: string; call_sign: string; availability: string }[]; onAssign: (id: string, name: string) => void }) {
  const [tech, setTech] = useState("");
  return (
    <div>
      <h3 className="eyebrow mb-2">Assigner une intervention</h3>
      <div className="flex gap-2">
        <select value={tech} onChange={(e) => setTech(e.target.value)} className="h-10 min-w-0 flex-1 rounded-md border bg-card px-2 text-sm">
          <option value="">Choisir un technicien…</option>
          {techs.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.call_sign} ({t.availability.replace("_", " ")})</option>)}
        </select>
        <button disabled={!tech} onClick={() => { const t = techs.find((x) => x.id === tech); if (t) onAssign(t.id, t.name); }}
          className="rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">Assigner</button>
      </div>
    </div>
  );
}
