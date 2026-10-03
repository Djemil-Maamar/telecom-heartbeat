import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — GSM O&M" },
      { name: "description", content: "Sign in to the GSM O&M dispatch desk." },
      { property: "og:title", content: "Connexion — GSM O&M" },
      { property: "og:description", content: "Sign in to the GSM O&M dispatch desk." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => data.session && nav({ to: "/", replace: true }));
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (e === "SIGNED_IN" && s) nav({ to: "/", replace: true }); });
    return () => data.subscription.unsubscribe();
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    if (mode === "up" && !res.data.session) toast.success("Vérifiez votre e-mail pour confirmer le compte.");
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(String(r.error.message ?? r.error));
  }

  return (
    <div className="grid min-h-screen place-items-center bg-sidebar px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground"><Radio className="size-5" /></div>
          <div><div className="font-display text-lg font-bold">GSM O&amp;M</div><div className="eyebrow">Network operations</div></div>
        </div>
        <h1 className="text-xl font-bold">{mode === "in" ? "Connexion" : "Créer un compte"}</h1>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" autoComplete="email" className="h-12 w-full rounded-lg border bg-card px-3 text-base" />
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" autoComplete={mode === "in" ? "current-password" : "new-password"} className="h-12 w-full rounded-lg border bg-card px-3 text-base" />
          <button disabled={busy} className="h-12 w-full rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-60">{mode === "in" ? "Se connecter" : "Créer le compte"}</button>
        </form>
        <button onClick={google} className="mt-3 h-12 w-full rounded-lg border font-semibold">Continuer avec Google</button>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 w-full text-sm text-primary">
          {mode === "in" ? "Pas de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}
