import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";

// The table is newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

export interface EmailDestinatario {
  id: string;
  email: string;
  nome: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizarEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function emailValido(raw: string): boolean {
  return EMAIL_RE.test(normalizarEmail(raw));
}

/** E-mails that receive every approved liberação (gestão edits; PCP/direção read). */
export const emailDestinatariosRepository = {
  /** Null when the table doesn't exist yet. */
  async list(): Promise<EmailDestinatario[] | null> {
    const { data, error } = await db
      .from("email_destinatarios")
      .select("id, email, nome")
      .order("email", { ascending: true });
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return null;
      throw dbError(error);
    }
    return (data ?? []) as EmailDestinatario[];
  },

  async add(email: string, nome: string): Promise<void> {
    const clean = normalizarEmail(email);
    if (!emailValido(clean)) throw new Error("Digite um e-mail válido.");
    const { error } = await db
      .from("email_destinatarios")
      .insert({ email: clean, nome: nome.trim() });
    if (error) {
      if (error.code === "23505") throw new Error("Esse e-mail já está na lista.");
      if (error.code === "42501") throw new Error("Somente a gestão pode editar os e-mails.");
      throw dbError(error);
    }
  },

  async remove(id: string): Promise<void> {
    const { error } = await db.from("email_destinatarios").delete().eq("id", id);
    if (error) throw dbError(error);
  },
};
