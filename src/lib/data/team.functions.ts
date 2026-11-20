import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
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
 * the admin client after the gestor check. Tasks/blockers show the live
 * name; already-sent notifications keep their snapshot.
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

/**
 * Sets a password on a team member's existing account (e.g. people who signed up with
 * Google and have no password), so they can sign in with e-mail + password on any host.
 * Gestor-only; also marks the e-mail as confirmed. Needs SUPABASE_SERVICE_ROLE_KEY on the server.
 * Every change is logged in equipe_eventos (who set whose password, when) before it happens.
 */
export const setTeamMemberPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(72),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isGestor, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (error) throw new Error("Não foi possível confirmar sua permissão. Tente novamente.");
    if (!isGestor) throw new Error("Somente gestores podem definir senhas.");
    // A gestor setting another gestor's password could then sign in as them.
    if (data.userId !== context.userId) {
      const { data: alvoGestor, error: alvoError } = await context.supabase.rpc("has_role", {
        _user_id: data.userId,
        _role: "gestor",
      });
      if (alvoError) throw new Error("Não foi possível confirmar a conta. Tente novamente.");
      if (alvoGestor) {
        throw new Error(
          "Não é possível definir a senha de outro gestor. Peça para a pessoa usar 'Esqueci minha senha'.",
        );
      }
    }

    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      throw new Error(
        "O servidor não está configurado para definir senhas (falta SUPABASE_SERVICE_ROLE_KEY).",
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // equipe_eventos (migration 0027) is newer than the generated database types.
    const admin = supabaseAdmin as unknown as SupabaseClient;

    const { data: alvo, error: alvoUserError } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    if (alvoUserError || !alvo?.user) throw new Error("Pessoa não encontrada.");
    const { data: perfis } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", [context.userId, data.userId]);
    const nomeDe = (id: string) =>
      (perfis as { id: string; display_name: string }[] | null)?.find((p) => p.id === id)
        ?.display_name ?? "";

    // Log first: no password changes without a record of who did it.
    const { data: evento, error: logError } = await admin
      .from("equipe_eventos")
      .insert({
        tipo: "senha_definida",
        alvo_id: data.userId,
        alvo_nome: nomeDe(data.userId),
        alvo_email: alvo.user.email ?? "",
        autor_id: context.userId,
        autor_nome: nomeDe(context.userId),
      })
      .select("id")
      .single();
    if (logError || !evento) {
      console.error("setTeamMemberPassword log failed", logError);
      throw new Error("Não foi possível registrar quem definiu a senha. Tente novamente.");
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
      email_confirm: true,
    });
    if (updateError) {
      console.error("setTeamMemberPassword failed", updateError);
      await admin
        .from("equipe_eventos")
        .delete()
        .eq("id", (evento as { id: string }).id);
      throw new Error("Não foi possível definir a senha. Tente novamente.");
    }
    return { ok: true };
  });
