import { supabase } from "@/integrations/supabase/client";
import type { CurrentUser } from "./types";
import { dbError } from "./db-errors";

export interface TeamMember {
  id: string;
  name: string;
  /** Approved to access the team's projects. */
  isMember: boolean;
  isGestor: boolean;
  joinedAt: string;
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile, roles] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const list = (roles.data ?? []).map((r) => r.role);
  return {
    id: user.id,
    email: user.email ?? null,
    name: profile.data?.display_name || user.email || "Você",
    isMember: list.length > 0,
    isGestor: list.includes("gestor"),
  };
}

export const teamRepository = {
  async list(): Promise<TeamMember[]> {
    const [profiles, roles] = await Promise.all([
      supabase.from("profiles").select("id, display_name, created_at").order("display_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (profiles.error) throw dbError(profiles.error);
    if (roles.error) throw dbError(roles.error);
    const members = new Set((roles.data ?? []).map((r) => r.user_id));
    const gestores = new Set(
      (roles.data ?? []).filter((r) => r.role === "gestor").map((r) => r.user_id),
    );
    return (profiles.data ?? []).map((p) => ({
      id: p.id,
      name: p.display_name || "Sem nome",
      isMember: members.has(p.id),
      isGestor: gestores.has(p.id),
      joinedAt: p.created_at,
    }));
  },
  /** Approve (or remove) someone's access to the team's projects. */
  async setAccess(userId: string, allowed: boolean): Promise<void> {
    const { error } = allowed
      ? await supabase
          .from("user_roles")
          .upsert({ user_id: userId, role: "membro" }, { onConflict: "user_id,role", ignoreDuplicates: true })
      : await supabase.from("user_roles").delete().eq("user_id", userId);
    if (error) throw dbError(error);
  },
  async setGestor(userId: string, gestor: boolean): Promise<void> {
    if (gestor) {
      const { error } = await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role: "gestor" }, { onConflict: "user_id,role", ignoreDuplicates: true });
      if (error) throw dbError(error);
      return;
    }
    // Keep team access when management permission is removed.
    const keep = await supabase
      .from("user_roles")
      .upsert({ user_id: userId, role: "membro" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (keep.error) throw dbError(keep.error);
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "gestor");
    if (error) throw dbError(error);
  },
  async updateMyName(userId: string, name: string): Promise<void> {
    const clean = name.trim();
    if (!clean) throw new Error("Informe seu nome.");
    const { error } = await supabase.from("profiles").update({ display_name: clean }).eq("id", userId);
    if (error) throw dbError(error);
  },
};
