import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import type { LiberacaoOpcao, OpcaoCampo } from "./liberacao-options";

// The options table is newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

function friendly(error: { message: string; code?: string }): Error {
  if (error.code === "23505") return new Error("Essa opção já existe nesta lista.");
  if (error.code === "42501") return new Error("Somente a gestão pode editar as listas.");
  return dbError(error);
}

/** Editable option lists of the liberação form (gestão edits; the team reads). */
export const liberacaoOpcoesRepository = {
  /** Null when the table doesn't exist yet (the form falls back to the built-in lists). */
  async list(): Promise<LiberacaoOpcao[] | null> {
    const { data, error } = await db
      .from("liberacao_opcoes")
      .select("id, modelo, campo, valor, position")
      .order("position", { ascending: true });
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return null;
      throw friendly(error);
    }
    return (data ?? []) as LiberacaoOpcao[];
  },

  async add(modelo: LiberacaoOpcao["modelo"], campo: OpcaoCampo, valor: string): Promise<void> {
    const clean = valor.trim().replace(/\s+/g, " ");
    if (!clean) throw new Error("Escreva a opção.");
    const { data: last, error: lastError } = await db
      .from("liberacao_opcoes")
      .select("position")
      .eq("modelo", modelo)
      .eq("campo", campo)
      .order("position", { ascending: false })
      .limit(1);
    if (lastError) throw friendly(lastError);
    const position = ((last as { position: number }[] | null)?.[0]?.position ?? -1) + 1;
    const { error } = await db
      .from("liberacao_opcoes")
      .insert({ modelo, campo, valor: clean, position });
    if (error) throw friendly(error);
  },

  async rename(id: string, valor: string): Promise<void> {
    const clean = valor.trim().replace(/\s+/g, " ");
    if (!clean) throw new Error("Escreva a opção.");
    const { error } = await db.from("liberacao_opcoes").update({ valor: clean }).eq("id", id);
    if (error) throw friendly(error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await db.from("liberacao_opcoes").delete().eq("id", id);
    if (error) throw friendly(error);
  },

  /** Saves a new order for one list (ids in the desired order). */
  async reorder(ids: string[]): Promise<void> {
    const results = await Promise.all(
      ids.map((id, position) => db.from("liberacao_opcoes").update({ position }).eq("id", id)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw friendly(failed.error);
  },
};
