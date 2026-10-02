import { AlertTriangle, Timer } from "lucide-react";
import { fmtCountdown, sla, type Task } from "@/lib/ops";

const STYLE = {
  ok: "bg-ok/15 text-ok",
  warning: "bg-warn/15 text-warn",
  escalate: "bg-crit/15 text-crit",
  breached: "bg-crit text-destructive-foreground",
} as const;

export function SlaBadge({ task, now }: { task: Task; now: number }) {
  if (task.status === "completed" || task.status === "cancelled") return <span className="font-mono text-xs text-muted-foreground">SLA closed</span>;
  const s = sla(task, now);
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs ${STYLE[s.state]}`}>
      {s.state === "ok" || s.state === "warning" ? <Timer className="size-3" /> : <AlertTriangle className="size-3" />}
      {s.state === "breached" ? `SLA breached ${fmtCountdown(s.remaining)}` : fmtCountdown(s.remaining)}
    </span>
  );
}
