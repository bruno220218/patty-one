import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";

// pedido_prazos (0033) is newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

export type PrazoStatus = "aguardando" | "respondido" | "cancelado";

/** One "Solicitar prazo" of a pedido: the comercial asks, the PCP sets the date. */
export interface PrazoPedido {
  id: string;
  vendaId: string;
  status: PrazoStatus;
  /** YYYY-MM-DD the client would like, or null. */
  dataDesejada: string | null;
  observacao: string;
  solicitadoPor: string | null;
  solicitadoPorNome: string;
  solicitadoEm: string;
  /** YYYY-MM-DD set by the PCP (only when respondido). */
  prazo: string | null;
  resposta: string;
  respondidoPorNome: string;
  respondidoEm: string | null;
}

/** An open request in the PCP list, with the pedido it belongs to. */
export interface PrazoAberto extends PrazoPedido {
  pedidoNumero: number;
  clienteNome: string;
}

type Row = Record<string, unknown>;
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const txtOuNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const umDe = (v: unknown) => (Array.isArray(v) ? (v[0] as Row | undefined) : (v as Row | null));

const COLUNAS = `id, venda_id, status, data_desejada, observacao, solicitado_por, solicitado_por_nome,
  solicitado_em,
  prazo, resposta, respondido_por_nome, respondido_em`;

function toPrazo(r: Row): PrazoPedido {
  return {
    id: txt(r["id"]),
    vendaId: txt(r["venda_id"]),
    status: txt(r["status"]) as PrazoStatus,
    dataDesejada: txtOuNull(r["data_desejada"]),
    observacao: txt(r["observacao"]),
    solicitadoPor: txtOuNull(r["solicitado_por"]),
    solicitadoPorNome: txt(r["solicitado_por_nome"]),
    solicitadoEm: txt(r["solicitado_em"]),
    prazo: txtOuNull(r["prazo"]),
    resposta: txt(r["resposta"]),
    respondidoPorNome: txt(r["respondido_por_nome"]),
    respondidoEm: txtOuNull(r["respondido_em"]),
  };
}

function erro(error: { message: string; code?: string }): Error {
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202") {
    return new Error("O pedido de prazo ainda não foi ativado no banco de dados.");
  }
  // The functions explain what is wrong (e.g. "Já existe um pedido de prazo aguardando o PCP.").
  if (error.code === "42501" || error.code === "P0001") return new Error(error.message);
  return dbError(error);
}

export const prazoRepository = {
  /** Every request of a pedido, oldest first. */
  async doPedido(vendaId: string): Promise<PrazoPedido[]> {
    const { data, error } = await db
      .from("pedido_prazos")
      .select(COLUNAS)
      .eq("venda_id", vendaId)
      .order("solicitado_em");
    if (error) throw erro(error);
    return ((data ?? []) as Row[]).map(toPrazo);
  },

  /** Requests waiting for the PCP, oldest first (the queue). */
  async abertos(): Promise<PrazoAberto[]> {
    const { data, error } = await db
      .from("pedido_prazos")
      .select(`${COLUNAS}, vendas(numero, cadastros(nome))`)
      .eq("status", "aguardando")
      .order("solicitado_em");
    if (error) throw erro(error);
    return ((data ?? []) as Row[]).map((r) => {
      const v = umDe(r["vendas"]);
      return {
        ...toPrazo(r),
        pedidoNumero: Number(v?.["numero"] ?? 0),
        clienteNome: txt(umDe(v?.["cadastros"])?.["nome"]),
      };
    });
  },

  /** Comercial/gestão. */
  async solicitar(vendaId: string, dataDesejada: string | null, observacao: string) {
    const { error } = await db.rpc("solicitar_prazo", {
      _venda_id: vendaId,
      _data_desejada: dataDesejada || null,
      _observacao: observacao.trim(),
    });
    if (error) throw erro(error);
  },

  /** PCP/gestão: the PCP always has the final word. */
  async responder(id: string, prazo: string, resposta: string) {
    if (!prazo) throw new Error("Informe a data do prazo.");
    const { error } = await db.rpc("responder_prazo", {
      _id: id,
      _prazo: prazo,
      _resposta: resposta.trim(),
    });
    if (error) throw erro(error);
  },

  /** Whoever asked, or gestão. */
  async cancelar(id: string) {
    const { error } = await db.rpc("cancelar_prazo", { _id: id });
    if (error) throw erro(error);
  },
};
