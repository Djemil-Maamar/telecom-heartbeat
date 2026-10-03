import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Site = Tables<"ops_sites">;
export type Technician = Tables<"ops_technicians">;
export type Task = Tables<"ops_tasks">;
export type Activity = Tables<"ops_task_activity">;
export type Availability = Tables<"ops_tech_availability">;
export type Role = "admin" | "supervisor" | "technician";
export type TaskWithRefs = Task & { site: Site | null; technician: Technician | null };

export const SITE_STATUS = {
  normal: { label: "Normal", cls: "bg-ok", text: "text-ok" },
  maintenance: { label: "Maintenance", cls: "bg-warn", text: "text-warn" },
  alarm: { label: "Alarme / panne", cls: "bg-crit", text: "text-crit" },
} as const;
export type SiteStatus = keyof typeof SITE_STATUS;

export const TASK_STATUSES = ["new", "dispatched", "in_progress", "on_hold", "completed", "cancelled"] as const;
export const ACTIVE = ["new", "dispatched", "in_progress", "on_hold"];
export const statusLabel = (s: string) => s.replace("_", " ");

/** SLA resolution target in hours per incident criticality. */
export const SLA_HOURS: Record<string, number> = { critical: 4, high: 8, medium: 24, low: 72 };

export function sla(task: Task, now: number) {
  const total = (SLA_HOURS[task.priority] ?? 24) * 3600_000;
  const deadline = new Date(task.created_at).getTime() + total;
  const remaining = deadline - now;
  const ratio = remaining / total;
  const state = remaining <= 0 ? "breached" : ratio < 0.25 ? "escalate" : ratio < 0.5 ? "warning" : "ok";
  return { deadline, remaining, ratio, state } as const;
}

export function fmtCountdown(ms: number) {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${neg ? "-" : ""}${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const throwing = <T,>(r: { data: T | null; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export const useSites = () =>
  useQuery({ queryKey: ["sites"], queryFn: async () => throwing(await supabase.from("ops_sites").select("*").order("code")) });
export const useTechs = () =>
  useQuery({ queryKey: ["techs"], queryFn: async () => throwing(await supabase.from("ops_technicians").select("*").order("name")) });
export const useTasks = () =>
  useQuery({
    queryKey: ["tasks"],
    queryFn: async () =>
      throwing(
        await supabase
          .from("ops_tasks")
          .select("*, site:ops_sites(*), technician:ops_technicians(*)")
          .order("created_at", { ascending: false }),
      ) as TaskWithRefs[],
  });
export const useActivity = (taskId?: string) =>
  useQuery({
    queryKey: ["activity", taskId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("ops_task_activity").select("*, task:ops_tasks(task_code)").order("created_at", { ascending: false }).limit(40);
      if (taskId) q = q.eq("task_id", taskId);
      return throwing(await q) as (Activity & { task: { task_code: string } | null })[];
    },
  });

export type AlertPrefs = { down: boolean; maintenance: boolean; restored: boolean };
export const DEFAULT_PREFS: AlertPrefs = { down: true, maintenance: false, restored: true };
export function loadPrefs(): AlertPrefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem("ops-alert-prefs") ?? "{}") }; } catch { return DEFAULT_PREFS; }
}
export const savePrefs = (p: AlertPrefs) => localStorage.setItem("ops-alert-prefs", JSON.stringify(p));

type LiveState = { live: boolean; lastEvent: number | null };
let liveState: LiveState = { live: false, lastEvent: null };
const listeners = new Set<() => void>();
const setLive = (p: Partial<LiveState>) => { liveState = { ...liveState, ...p }; listeners.forEach((l) => l()); };
export const useLiveState = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => liveState, () => liveState);

/** Live updates (mounted once in the app shell): refresh cached data and raise configured site alerts. */
export function useRealtime(onSiteChange?: (oldStatus: string | undefined, site: Site) => void) {
  const qc = useQueryClient();
  const cb = useRef(onSiteChange);
  cb.current = onSiteChange;
  useEffect(() => {
    const ch = supabase
      .channel("ops-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ops_sites" }, (p) => {
        qc.invalidateQueries({ queryKey: ["sites"] });
        setLive({ lastEvent: Date.now() });
        if (p.eventType === "UPDATE") cb.current?.((p.old as Partial<Site>).status, p.new as Site);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ops_tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
        setLive({ lastEvent: Date.now() });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ops_task_activity" }, () => qc.invalidateQueries({ queryKey: ["activity"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "ops_site_events" }, () => qc.invalidateQueries({ queryKey: ["site-events"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "ops_tech_availability" }, () => qc.invalidateQueries({ queryKey: ["availability"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "ops_technicians" }, () => qc.invalidateQueries({ queryKey: ["techs"] }))
      .subscribe((s) => setLive({ live: s === "SUBSCRIBED" }));
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
}

export const useSiteEvents = (siteId?: string | null) =>
  useQuery({
    queryKey: ["site-events", siteId ?? "all"],
    enabled: siteId !== null,
    queryFn: async () => {
      let q = supabase.from("ops_site_events").select("*").order("created_at", { ascending: false }).limit(500);
      if (siteId) q = q.eq("site_id", siteId);
      return throwing(await q);
    },
  });

export async function logActivity(task_id: string, actor: string, message: string, category: Activity["category"]) {
  const { error } = await supabase.from("ops_task_activity").insert({ task_id, actor, message, category });
  if (error) throw new Error(error.message);
}

/** Current account: roles + linked technician. Rights are enforced by the database; this only drives the UI. */
export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return { userId: null, email: null, roles: [] as Role[], technicianId: null, isAdmin: false, isDispatcher: false };
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
      ]);
      const r = (roles ?? []).map((x) => x.role as Role);
      return {
        userId: uid, email: u.user?.email ?? null, roles: r, technicianId: profile?.technician_id ?? null,
        isAdmin: r.includes("admin"), isDispatcher: r.includes("admin") || r.includes("supervisor"),
      };
    },
  });

export const useAvailability = () =>
  useQuery({ queryKey: ["availability"], queryFn: async () => throwing(await supabase.from("ops_tech_availability").select("*").order("starts_at")) });

export const AVAIL_KIND: Record<string, string> = { off: "Repos", leave: "Congé", training: "Formation", standby: "Astreinte" };

/** Conflicts for assigning a technician over [start, end]: unavailability blocks and other active work orders. */
export function techConflicts(techId: string, start: number, end: number, blocks: Availability[], tasks: TaskWithRefs[], excludeTaskId?: string) {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.technician_id !== techId || b.kind === "standby") continue;
    if (new Date(b.starts_at).getTime() < end && new Date(b.ends_at).getTime() > start)
      out.push(`${AVAIL_KIND[b.kind] ?? b.kind} ${fmtTime(b.starts_at)} → ${fmtTime(b.ends_at)}`);
  }
  for (const t of tasks) {
    if (t.technician_id !== techId || t.id === excludeTaskId || !ACTIVE.includes(t.status)) continue;
    const ts = new Date(t.created_at).getTime(), te = t.due_at ? new Date(t.due_at).getTime() : ts + (SLA_HOURS[t.priority] ?? 24) * 3600_000;
    if (ts < end && te > start) out.push(`${t.task_code} en cours (${t.site?.code ?? ""})`);
  }
  return out;
}
