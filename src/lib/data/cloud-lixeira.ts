import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";

// The lixeira table is newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

export interface LixeiraItem {
  lote: number;
  tipo: string;
  rotulo: string;
  detalhe: string;
  apagadoPorNome: string;
  apagadoEm: string;
  /** What went along with it (e.g. "14 tarefas, 1 bloqueio"). */
  junto: string;
}

interface Row {
  lote: number;
  principal: boolean;
  tipo: string;
  rotulo: string;
  detalhe: string;
  apagado_por_nome: string;
  apagado_em: string;
}

const PLURAL: Record<string, [string, string]> = {
  Tarefa: ["tarefa", "tarefas"],
  Bloqueio: ["bloqueio", "bloqueios"],
  "Item da liberação": ["item", "itens"],
  "Tarefa do checklist": ["tarefa", "tarefas"],
};

/** Groups deleted rows by delete (lote): the item someone deleted + what went with it. */
export function agruparLixeira(rows: Row[]): LixeiraItem[] {
  const porLote = new Map<number, Row[]>();
  for (const r of rows) porLote.set(r.lote, [...(porLote.get(r.lote) ?? []), r]);
  const itens: LixeiraItem[] = [];
  for (const [lote, grupo] of porLote) {
    const principal = grupo.find((r) => r.principal);
    if (!principal) continue;
    const contagem = new Map<string, number>();
    for (const r of grupo) {
      if (r.principal || !PLURAL[r.tipo]) continue;
      contagem.set(r.tipo, (contagem.get(r.tipo) ?? 0) + 1);
    }
    const junto = [...contagem]
      .map(([tipo, n]) => `${n} ${PLURAL[tipo]![n === 1 ? 0 : 1]}`)
      .join(", ");
    itens.push({
      lote,
      tipo: principal.tipo,
      rotulo: principal.rotulo,
      detalhe: principal.detalhe,
      apagadoPorNome: principal.apagado_por_nome,
      apagadoEm: principal.apagado_em,
      junto,
    });
  }
  return itens.sort((a, b) => b.apagadoEm.localeCompare(a.apagadoEm));
}

/** Deleted items kept for 30 days. Gestores see everything; others see what they deleted. */
export const lixeiraRepository = {
  async list(): Promise<LixeiraItem[]> {
    const { data, error } = await db
      .from("lixeira")
      .select("lote, principal, tipo, rotulo, detalhe, apagado_por_nome, apagado_em")
      .order("apagado_em", { ascending: false })
      .limit(5000);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return [];
      throw dbError(error);
    }
    return agruparLixeira((data ?? []) as Row[]);
  },

  async restaurar(lote: number): Promise<void> {
    const { error } = await db.rpc("restaurar_lixeira", { p_lote: lote });
    if (error) throw dbError(error);
  },

  async apagarDeVez(lote: number): Promise<void> {
    const { error } = await db.rpc("esvaziar_lixeira_item", { p_lote: lote });
    if (error) throw dbError(error);
  },
};
