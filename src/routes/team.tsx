import { createFileRoute } from "@tanstack/react-router";
import { Phone } from "lucide-react";
import { PageHead, Panel } from "@/components/AppShell";
import { ACTIVE, useTasks, useTechs } from "@/lib/ops";

export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: "Field team — GSM O&M" },
      { name: "description", content: "Field technicians, availability and current assignments." },
      { property: "og:title", content: "Field team — GSM O&M" },
      { property: "og:description", content: "Field technicians, availability and current assignments." },
    ],
  }),
  component: Team,
});

const AV = { available: "bg-ok", on_task: "bg-warn", off_duty: "bg-muted-foreground" } as Record<string, string>;

function Team() {
  const { data: techs = [] } = useTechs();
  const { data: tasks = [] } = useTasks();
  return (
    <>
      <PageHead eyebrow="Dispatch / field team" title="Field team" sub={`${techs.length} technicians`} />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {techs.map((t) => {
          const mine = tasks.filter((x) => x.technician_id === t.id && ACTIVE.includes(x.status));
          return (
            <Panel key={t.id} className="p-4">
              <div className="flex items-center justify-between">
                <div><div className="font-semibold">{t.name}</div><div className="font-mono text-xs text-muted-foreground">{t.call_sign} · {t.region}</div></div>
                <span className="flex items-center gap-1.5 text-xs"><span className={`size-2 rounded-full ${AV[t.availability]}`} />{t.availability.replace("_", " ")}</span>
              </div>
              {t.phone && <a href={`tel:${t.phone}`} className="mt-2 inline-flex items-center gap-1 text-sm text-primary"><Phone className="size-3" />{t.phone}</a>}
              <div className="mt-3 text-xs text-muted-foreground">{mine.length ? mine.map((m) => m.task_code).join(", ") : "No active work orders"}</div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
