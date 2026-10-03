import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHead, Panel } from "@/components/AppShell";
import { useMe, useTechs, type Role } from "@/lib/ops";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Utilisateurs & rôles — GSM O&M" },
      { name: "description", content: "Assign admin, supervisor and technician roles." },
      { property: "og:title", content: "Utilisateurs & rôles — GSM O&M" },
      { property: "og:description", content: "Assign admin, supervisor and technician roles." },
    ],
  }),
  component: UsersPage,
});

const ROLES: { r: Role; label: string; desc: string }[] = [
  { r: "admin", label: "Administrateur", desc: "Tous les droits, gestion des rôles, suppression" },
  { r: "supervisor", label: "Superviseur", desc: "Sites, assignation, toutes les interventions" },
  { r: "technician", label: "Technicien", desc: "Ses interventions, fiches terrain, son planning" },
];

function UsersPage() {
  const { data: me } = useMe();
  const { data: techs = [] } = useTechs();
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const [{ data: p, error }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("*"),
      ]);
      if (error) throw error;
      return (p ?? []).map((x) => ({ ...x, roles: (r ?? []).filter((y) => y.user_id === x.user_id).map((y) => y.role as Role) }));
    },
  });
  if (!me?.isAdmin) return <p className="text-sm text-muted-foreground">Réservé aux administrateurs.</p>;

  async function toggle(userId: string, role: Role, has: boolean) {
    if (userId === me?.userId && role === "admin" && has) { toast.error("Vous ne pouvez pas retirer votre propre rôle administrateur."); return; }
    const { error } = has
      ? await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role)
      : await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["users"] });
  }
  async function link(userId: string, techId: string) {
    const { error } = await supabase.from("profiles").update({ technician_id: techId || null }).eq("user_id", userId);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["users"] });
  }

  return (
    <>
      <PageHead eyebrow="Administration" title="Utilisateurs & rôles" sub="Les nouveaux comptes n'ont aucun accès tant qu'un rôle ne leur est pas attribué." />
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {ROLES.map((x) => <div key={x.r} className="rounded-lg border bg-card p-3 text-xs"><div className="font-semibold">{x.label}</div><div className="text-muted-foreground">{x.desc}</div></div>)}
      </div>
      <Panel className="divide-y">
        {users.data?.map((u) => (
          <div key={u.user_id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto_220px] md:items-center">
            <div className="min-w-0"><div className="truncate font-semibold">{u.email}</div><div className="text-xs text-muted-foreground">{u.roles.length ? "" : "En attente d'un rôle"}</div></div>
            <div className="flex flex-wrap gap-2">
              {ROLES.map(({ r, label }) => {
                const has = u.roles.includes(r);
                return <button key={r} onClick={() => toggle(u.user_id, r, has)} aria-pressed={has} className={`h-10 rounded-md border px-3 text-xs font-semibold ${has ? "bg-primary text-primary-foreground" : "bg-card"}`}>{label}</button>;
              })}
            </div>
            <select value={u.technician_id ?? ""} onChange={(e) => link(u.user_id, e.target.value)} className="h-10 rounded-md border bg-card px-2 text-sm">
              <option value="">Fiche technicien liée : aucune</option>
              {techs.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.call_sign}</option>)}
            </select>
          </div>
        ))}
      </Panel>
    </>
  );
}
