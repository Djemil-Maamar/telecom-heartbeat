import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Site = Tables<"ops_sites">;
export type Technician = Tables<"ops_technicians">;
export type Task = Tables<"ops_tasks">;
export type Activity = Tables<"ops_task_activity">;
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

/** Live updates: refresh cached data whenever sites, tasks or activity change. */
export function useRealtime() {
  const qc = useQueryClient();
  const [lastEvent, setLastEvent] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const ch = supabase
      .channel("ops-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ops_sites" }, () => {
        qc.invalidateQueries({ queryKey: ["sites"] });
        setLastEvent(Date.now());
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ops_tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
        setLastEvent(Date.now());
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ops_task_activity" }, () => {
        qc.invalidateQueries({ queryKey: ["activity"] });
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
  return { live, lastEvent };
}

export async function logActivity(task_id: string, actor: string, message: string, category: Activity["category"]) {
  const { error } = await supabase.from("ops_task_activity").insert({ task_id, actor, message, category });
  if (error) throw new Error(error.message);
}
