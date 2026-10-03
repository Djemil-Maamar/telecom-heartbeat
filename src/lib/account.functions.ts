import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Creates the caller's profile on first sign-in. The very first account in the
 * project becomes admin; later accounts start without a role until an admin grants one.
 */
export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = (context.claims as { email?: string }).email ?? null;
    const { data: existing } = await supabaseAdmin.from("profiles").select("user_id").eq("user_id", context.userId).maybeSingle();
    if (!existing) {
      await supabaseAdmin.from("profiles").insert({ user_id: context.userId, email, display_name: email?.split("@")[0] ?? null });
      const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true });
      if (!count) await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
    }
    return { ok: true };
  });
