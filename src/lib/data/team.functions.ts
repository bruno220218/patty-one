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

/**
 * Renames a team member (their display name). Only gestores may rename other people;
 * the profiles policy only lets each person update their own row, so this runs with
 * the admin client after the gestor check. Tasks/blockers show the live name.
 */
export const renameTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        name: z.string().trim().min(1, "Informe o nome.").max(80, "Use no máximo 80 caracteres."),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isGestor, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (error) throw new Error("Não foi possível confirmar sua permissão. Tente novamente.");
    if (!isGestor) throw new Error("Somente gestores podem renomear pessoas da equipe.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ display_name: data.name })
      .eq("id", data.userId)
      .select("id");
    if (updateError) {
      console.error("renameTeamMember failed", updateError);
      throw new Error("Não foi possível renomear esta pessoa. Tente novamente.");
    }
    if (!updated || updated.length === 0) throw new Error("Pessoa não encontrada.");
    return { ok: true };
  });
