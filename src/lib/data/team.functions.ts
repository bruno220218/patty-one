import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Removes a person from the team by deleting their account. Only gestores may do it,
 * and never on themselves (so at least one gestor always remains). Task completions
 * and blockers keep the person's name.
 */
export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isGestor, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (error) throw new Error("Não foi possível confirmar sua permissão. Tente novamente.");
    if (!isGestor) throw new Error("Somente gestores podem remover pessoas da equipe.");
    if (data.userId === context.userId) throw new Error("Você não pode remover a si mesmo(a).");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (deleteError) {
      console.error("removeTeamMember failed", deleteError);
      throw new Error("Não foi possível remover esta pessoa. Tente novamente.");
    }
    return { ok: true };
  });
