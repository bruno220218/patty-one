import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import { SETORES_PROGRAMACAO } from "./programacao-rules";

// The sector tables (migration 0031) are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

/** A production sector (Impressão, Corte, Pintura…): where a person of Produção works. */
export interface SetorProducao {
  id: string;
  nome: string;
  posicao: number;
}

/** True when the table doesn't exist yet (migration 0031 not applied). */
export const tabelaAusente = (error: { code?: string }) =>
  error.code === "42P01" || error.code === "PGRST205";

function friendly(error: { message: string; code?: string }): Error {
  if (error.code === "23505") return new Error("Já existe um setor com esse nome.");
  if (error.code === "23503")
    return new Error(
      "Este setor está em uso na programação ou em equipes. Renomeie em vez de excluir.",
    );
  if (error.code === "42501") return new Error("Somente Gestão e PCP podem editar os setores.");
  return dbError(error);
}

const limpar = (nome: string) => nome.trim().replace(/\s+/g, " ");

/**
 * Sector names in list order. Before migration 0031 (or with an empty list) the fixed seven
 * sectors of the programação are used.
 */
export function nomesDosSetores(setores: SetorProducao[] | null | undefined): string[] {
  return setores && setores.length > 0 ? setores.map((s) => s.nome) : [...SETORES_PROGRAMACAO];
}

/** Editable list of production sectors (Gestão and PCP edit; the team reads). */
export const setoresRepository = {
  /** Null when the table doesn't exist yet. */
  async list(): Promise<SetorProducao[] | null> {
    const { data, error } = await db
      .from("producao_setores")
      .select("id, nome, posicao")
      .order("posicao", { ascending: true })
      .order("nome", { ascending: true });
    if (error) {
      if (tabelaAusente(error)) return null;
      throw friendly(error);
    }
    return (data ?? []) as SetorProducao[];
  },

  async add(nome: string): Promise<void> {
    const clean = limpar(nome);
    if (!clean) throw new Error("Escreva o nome do setor.");
    const { data: last, error: lastError } = await db
      .from("producao_setores")
      .select("posicao")
      .order("posicao", { ascending: false })
      .limit(1);
    if (lastError) throw friendly(lastError);
    const posicao = ((last as { posicao: number }[] | null)?.[0]?.posicao ?? 0) + 1;
    const { error } = await db.from("producao_setores").insert({ nome: clean, posicao });
    if (error) throw friendly(error);
  },

  /** Renaming also renames the sector in the programação and the teams (database rule). */
  async rename(id: string, nome: string): Promise<void> {
    const clean = limpar(nome);
    if (!clean) throw new Error("Escreva o nome do setor.");
    const { error } = await db.from("producao_setores").update({ nome: clean }).eq("id", id);
    if (error) throw friendly(error);
  },

  /** Only a sector that no service or team uses can be deleted (database rule). */
  async remove(id: string): Promise<void> {
    const { error } = await db.from("producao_setores").delete().eq("id", id);
    if (error) throw friendly(error);
  },

  async reorder(ids: string[]): Promise<void> {
    const results = await Promise.all(
      ids.map((id, i) =>
        db
          .from("producao_setores")
          .update({ posicao: i + 1 })
          .eq("id", id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw friendly(failed.error);
  },
};
