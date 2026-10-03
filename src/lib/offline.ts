import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/** Field entries made without network are kept in this outbox and replayed in order when the connection returns. */
type Photo = { name: string; type: string; dataUrl: string };
export type OutboxOp =
  | { id: string; at: number; kind: "activity"; row: TablesInsert<"ops_task_activity"> }
  | { id: string; at: number; kind: "task_update"; taskId: string; patch: TablesUpdate<"ops_tasks"> }
  | { id: string; at: number; kind: "report"; row: TablesInsert<"ops_field_reports">; photos: Photo[] };

const KEY = "ops-outbox";
const listeners = new Set<() => void>();
let cache: OutboxOp[] | null = null;
let flushing = false;

const read = (): OutboxOp[] => {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { cache = []; }
  return cache!;
};
const write = (ops: OutboxOp[]) => {
  cache = ops;
  try { localStorage.setItem(KEY, JSON.stringify(ops)); } catch { /* storage full */ }
  listeners.forEach((l) => l());
};
const EMPTY: OutboxOp[] = [];
export const useOutbox = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => (typeof window === "undefined" ? EMPTY : read()), () => EMPTY);

const isNetworkError = (e: unknown) =>
  (typeof navigator !== "undefined" && !navigator.onLine) || /fetch|network|Failed to fetch|Load failed/i.test(String((e as Error)?.message ?? e));

async function execute(op: OutboxOp) {
  if (op.kind === "activity") {
    const { error } = await supabase.from("ops_task_activity").insert(op.row);
    if (error) throw error;
  } else if (op.kind === "task_update") {
    const { error } = await supabase.from("ops_tasks").update(op.patch).eq("id", op.taskId);
    if (error) throw error;
  } else {
    const paths: string[] = [...(op.row.photos ?? [])];
    for (const p of op.photos) {
      const blob = await (await fetch(p.dataUrl)).blob();
      const path = `${op.row.task_id}/${op.at}-${p.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("field-photos").upload(path, blob, { contentType: p.type, upsert: true });
      if (error) throw error;
      paths.push(path);
    }
    const { error } = await supabase.from("ops_field_reports").insert({ ...op.row, photos: paths });
    if (error) throw error;
  }
}

/** Runs the change now when online; queues it when the network is unavailable. Returns "queued" or "sent". */
export async function runOrQueue(op: Omit<OutboxOp, "id" | "at"> & Partial<Pick<OutboxOp, "id" | "at">>): Promise<"sent" | "queued"> {
  const full = { id: crypto.randomUUID(), at: Date.now(), ...op } as OutboxOp;
  if (navigator.onLine && read().length === 0) {
    try { await execute(full); return "sent"; } catch (e) { if (!isNetworkError(e)) throw e; }
  }
  write([...read(), full]);
  return "queued";
}

export const fileToPhoto = (f: File) =>
  new Promise<Photo>((res, rej) => { const r = new FileReader(); r.onload = () => res({ name: f.name, type: f.type, dataUrl: String(r.result) }); r.onerror = rej; r.readAsDataURL(f); });

/** Replays queued ops in order; stops at the first network failure, drops ops the server rejects. */
export async function flushOutbox(onDone?: (sent: number, rejected: string[]) => void) {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  let sent = 0;
  const rejected: string[] = [];
  try {
    for (const op of [...read()]) {
      try { await execute(op); sent++; }
      catch (e) { if (isNetworkError(e)) break; rejected.push((e as Error).message); }
      write(read().filter((x) => x.id !== op.id));
    }
  } finally {
    flushing = false;
    if (sent || rejected.length) onDone?.(sent, rejected);
  }
}
