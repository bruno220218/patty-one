import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";

// Briefings and visitas técnicas linked to a pedido/proposta or a production order (0041).
const db = supabase as unknown as SupabaseClient;

export type TipoVinculado = "briefing" | "visita";

export interface Vinculado {
  tipo: TipoVinculado;
  id: string;
  numero: number;
  titulo: string;
  cliente: string;
  status: string;
  vendaId: string | null;
  ordemId: string | null;
  createdAt: string;
}

export const STATUS_VINCULADO_LABEL: Record<string, string> = {
  novo: "Novo",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  solicitada: "Solicitada",
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

export const vinculosRepository = {
  /**
   * Pedido: linked to it, to the proposta it came from and to its orders.
   * Order: linked to it, to its pedido and to that pedido's proposta.
   */
  async listar(alvo: { vendaId?: string | null; ordemId?: string | null }): Promise<Vinculado[]> {
    const { data, error } = await db.rpc("vinculados_briefing_visita", {
      p_venda: alvo.vendaId ?? null,
      p_ordem: alvo.ordemId ?? null,
    });
    if (error) throw dbError(error);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      tipo: r["tipo"] as TipoVinculado,
      id: String(r["id"]),
      numero: Number(r["numero"]),
      titulo: String(r["titulo"] ?? ""),
      cliente: String(r["cliente"] ?? ""),
      status: String(r["status"] ?? ""),
      vendaId: (r["venda_id"] as string | null) ?? null,
      ordemId: (r["ordem_id"] as string | null) ?? null,
      createdAt: String(r["created_at"] ?? ""),
    }));
  },

  /** Links by number; both targets null unlink. An order alone brings its pedido along. */
  async vincular(
    tipo: TipoVinculado,
    numero: number,
    alvo: { vendaId: string | null; ordemId: string | null },
  ): Promise<void> {
    const { error } = await db.rpc("vincular_briefing_visita", {
      p_tipo: tipo,
      p_numero: numero,
      p_venda: alvo.vendaId,
      p_ordem: alvo.ordemId,
    });
    if (error) throw dbError(error);
  },
};
