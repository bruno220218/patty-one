import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { CurrentUser, Funcao } from "./types";
import { dbError } from "./db-errors";
import { removeTeamMember, renameTeamMember, setTeamMemberPassword } from "./team.functions";

export interface TeamMember {
  id: string;
  name: string;
  /** Approved to access the team's projects. */
  isMember: boolean;
  isGestor: boolean;
  isComercial: boolean;
  funcoes: Funcao[];
  joinedAt: string;
  /** Account e-mail, shown to gestão so nobody approves an impostor ("" when unknown). */
  email: string;
  /** Last time a gestor set this person's password (gestão only; null when never/unknown). */
  senhaDefinida: { por: string; em: string } | null;
  /** Ids of the production sectors the person works in (empty before migration 0031). */
  setores: string[];
}

// The sector tables (migration 0031) are newer than the generated database types.
const anyDb = supabase as unknown as SupabaseClient;

/** Sector rows of one person or of everyone; empty when the table doesn't exist yet. */
async function lerSetoresDasPessoas(
  userId?: string,
): Promise<{ user_id: string; setor_id: string; nome: string }[]> {
  let query = anyDb
    .from("usuario_setores")
    .select("user_id, setor_id, setor:producao_setores(nome)");
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) return [];
  return (
    (data ?? []) as unknown as {
      user_id: string;
      setor_id: string;
      setor: { nome: string } | null;
    }[]
  ).map((r) => ({ user_id: r.user_id, setor_id: r.setor_id, nome: r.setor?.nome ?? "" }));
}

const FUNCAO_VALUES: Funcao[] = [
  "gestor",
  "comercial",
  "pcp",
  "direcao",
  "criacao",
  "projetos_especiais",
  "producao",
  "montagem",
  "checking",
  "financeiro",
];
const asFuncoes = (roles: string[]) => FUNCAO_VALUES.filter((f) => roles.includes(f));

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile, roles, setores] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    lerSetoresDasPessoas(user.id),
  ]);
  const list = (roles.data ?? []).map((r) => r.role);
  return {
    id: user.id,
    email: user.email ?? null,
    name: profile.data?.display_name || user.email || "Você",
    isMember: list.length > 0,
    isGestor: list.includes("gestor"),
    isComercial: (list as string[]).includes("comercial"),
    funcoes: asFuncoes(list as string[]),
    setores: setores.map((s) => s.nome).filter(Boolean),
  };
}

export const teamRepository = {
  async list(): Promise<TeamMember[]> {
    const [profiles, roles, emails, senhas, setores] = await Promise.all([
      supabase.from("profiles").select("id, display_name, created_at").order("display_name"),
      supabase.from("user_roles").select("user_id, role"),
      // Gestão only (database rule); empty for everyone else or before migration 0015.
      (supabase as unknown as SupabaseClient)
        .rpc("equipe_emails")
        .then((r) => (r.error ? [] : ((r.data ?? []) as { id: string; email: string }[]))),
      // Gestão only (database rule); empty for everyone else or before migration 0027.
      (supabase as unknown as SupabaseClient)
        .from("equipe_eventos")
        .select("alvo_id, autor_nome, created_at")
        .eq("tipo", "senha_definida")
        .order("created_at", { ascending: false })
        .then((r) =>
          r.error
            ? []
            : ((r.data ?? []) as {
                alvo_id: string | null;
                autor_nome: string;
                created_at: string;
              }[]),
        ),
      lerSetoresDasPessoas(),
    ]);
    const setoresOf = new Map<string, string[]>();
    for (const s of setores) {
      setoresOf.set(s.user_id, [...(setoresOf.get(s.user_id) ?? []), s.setor_id]);
    }
    const emailOf = new Map(emails.map((e) => [e.id, e.email]));
    // Newest first, so the first entry per person is the latest.
    const senhaOf = new Map<string, { por: string; em: string }>();
    for (const s of senhas) {
      if (s.alvo_id && !senhaOf.has(s.alvo_id)) {
        senhaOf.set(s.alvo_id, { por: s.autor_nome || "alguém da gestão", em: s.created_at });
      }
    }
    if (profiles.error) throw dbError(profiles.error);
    if (roles.error) throw dbError(roles.error);
    const members = new Set((roles.data ?? []).map((r) => r.user_id));
    const gestores = new Set(
      (roles.data ?? []).filter((r) => r.role === "gestor").map((r) => r.user_id),
    );
    const rolesOf = new Map<string, string[]>();
    for (const r of roles.data ?? []) {
      rolesOf.set(r.user_id, [...(rolesOf.get(r.user_id) ?? []), r.role as string]);
    }
    return (profiles.data ?? []).map((p) => ({
      id: p.id,
      name: p.display_name || "Sem nome",
      isMember: members.has(p.id),
      isGestor: gestores.has(p.id),
      isComercial: (rolesOf.get(p.id) ?? []).includes("comercial"),
      funcoes: asFuncoes(rolesOf.get(p.id) ?? []),
      joinedAt: p.created_at,
      email: emailOf.get(p.id) ?? "",
      senhaDefinida: senhaOf.get(p.id) ?? null,
      setores: setoresOf.get(p.id) ?? [],
    }));
  },
  /** Put a person in a production sector, or take them out (gestão only, database rule). */
  async setSetor(userId: string, setorId: string, on: boolean): Promise<void> {
    const { error } = on
      ? await anyDb
          .from("usuario_setores")
          .upsert(
            { user_id: userId, setor_id: setorId },
            { onConflict: "user_id,setor_id", ignoreDuplicates: true },
          )
      : await anyDb.from("usuario_setores").delete().eq("user_id", userId).eq("setor_id", setorId);
    if (error) throw dbError(error);
  },
  /** Approve (or remove) someone's access to the team's projects. */
  async setAccess(userId: string, allowed: boolean): Promise<void> {
    const { error } = allowed
      ? await supabase
          .from("user_roles")
          .upsert(
            { user_id: userId, role: "membro" },
            { onConflict: "user_id,role", ignoreDuplicates: true },
          )
      : await supabase.from("user_roles").delete().eq("user_id", userId);
    if (error) throw dbError(error);
  },
  async setGestor(userId: string, gestor: boolean): Promise<void> {
    if (gestor) {
      const { error } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: userId, role: "gestor" },
          { onConflict: "user_id,role", ignoreDuplicates: true },
        );
      if (error) throw dbError(error);
      return;
    }
    // Keep team access when management permission is removed.
    const keep = await supabase
      .from("user_roles")
      .upsert(
        { user_id: userId, role: "membro" },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    if (keep.error) throw dbError(keep.error);
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "gestor");
    if (error) throw dbError(error);
  },
  /** Give or take a team function. Keeps basic team access. "gestor" uses setGestor. */
  async setFuncao(userId: string, funcao: Exclude<Funcao, "gestor">, on: boolean): Promise<void> {
    // The new functions are newer than the generated database types.
    const role = funcao as unknown as "gestor";
    if (on) {
      const keep = await supabase
        .from("user_roles")
        .upsert(
          { user_id: userId, role: "membro" },
          { onConflict: "user_id,role", ignoreDuplicates: true },
        );
      if (keep.error) throw dbError(keep.error);
      const { error } = await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id,role", ignoreDuplicates: true });
      if (error) throw dbError(error);
      return;
    }
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", role);
    if (error) throw dbError(error);
  },
  /** Remove someone from the team for good (their account is deleted). */
  async remove(userId: string): Promise<void> {
    await removeTeamMember({ data: { userId } });
  },
  /** Rename a team member (gestor only, checked on the server). */
  async rename(userId: string, name: string): Promise<void> {
    const clean = name.trim();
    if (!clean) throw new Error("Informe o nome.");
    await renameTeamMember({ data: { userId, name: clean } });
  },
  /** Set a password on someone's account (gestor only, checked on the server). */
  async setPassword(userId: string, password: string): Promise<void> {
    // Same limits as setTeamMemberPassword on the server (8–72).
    if (password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    if (password.length > 72) throw new Error("Use no máximo 72 caracteres.");
    await setTeamMemberPassword({ data: { userId, password } });
  },
  async updateMyName(userId: string, name: string): Promise<void> {
    const clean = name.trim();
    if (!clean) throw new Error("Informe seu nome.");
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: clean })
      .eq("id", userId);
    if (error) throw dbError(error);
  },
};
