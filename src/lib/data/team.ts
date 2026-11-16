import { supabase } from "@/integrations/supabase/client";
import type { CurrentUser } from "./types";
import { dbError } from "./db-errors";

export interface TeamMember {
  id: string;
  name: string;
  isGestor: boolean;
  joinedAt: string;
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile, role] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "gestor")
      .maybeSingle(),
  ]);
  return {
    id: user.id,
    email: user.email ?? null,
    name: profile.data?.display_name || user.email || "Você",
    isGestor: Boolean(role.data),
  };
}

export const teamRepository = {
  async list(): Promise<TeamMember[]> {
    const [profiles, roles] = await Promise.all([
      supabase.from("profiles").select("id, display_name, created_at").order("display_name"),
      supabase.from("user_roles").select("user_id").eq("role", "gestor"),
    ]);
    if (profiles.error) throw dbError(profiles.error);
    if (roles.error) throw dbError(roles.error);
    const gestores = new Set((roles.data ?? []).map((r) => r.user_id));
    return (profiles.data ?? []).map((p) => ({
      id: p.id,
      name: p.display_name || "Sem nome",
      isGestor: gestores.has(p.id),
      joinedAt: p.created_at,
    }));
  },
  async setGestor(userId: string, gestor: boolean): Promise<void> {
    const { error } = gestor
      ? await supabase.from("user_roles").insert({ user_id: userId, role: "gestor" })
      : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "gestor");
    if (error) throw dbError(error);
  },
  async updateMyName(userId: string, name: string): Promise<void> {
    const clean = name.trim();
    if (!clean) throw new Error("Informe seu nome.");
    const { error } = await supabase.from("profiles").update({ display_name: clean }).eq("id", userId);
    if (error) throw dbError(error);
  },
};
