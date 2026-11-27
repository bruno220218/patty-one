import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { SituacaoOrcamento } from "./orcamento-rules";

// Migration 0052 is newer than the generated database types.
const pub = supabase as unknown as SupabaseClient;

/** One Orçamento de Projetos Especiais ("Nº 01 · NOVEMBRO"). */
export interface OrcamentoPE {
  id: string;
  ano: number;
  mes: number;
  numero: number;
  cliente: string;
  informacoes: string;
  endereco: string;
  responsavel: string;
  observacao: string;
  situacao: SituacaoOrcamento;
  revisao: number;
  briefingId: string | null;
  vendaId: string | null;
  createdByNome: string;
  createdAt: string;
  updatedAt: string;
}

/** One line of the sheet (material, service, mão de obra or deslocamento). */
export interface LinhaOrcamentoPE {
  id: string;
  secao: string;
  ordem: number;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  produtoId: string | null;
  custoId: string | null;
  observacao: string | null;
}

export interface RevisaoPE {
  id: string;
  numero: number;
  custo: number;
  venda: number;
  enviadaPorNome: string;
  enviadaEm: string;
  decisao: "aprovado" | "devolvido" | null;
  decididoPorNome: string | null;
  decididoEm: string | null;
  motivo: string | null;
  ajusteMotivo: string | null;
}

export type LinhaOrcamentoInput = Omit<LinhaOrcamentoPE, "id" | "ordem">;
export interface CabecalhoOrcamentoInput {
  cliente: string;
  informacoes: string;
  endereco: string;
  responsavel: string;
  observacao: string;
}

type N = number | string | null;
type Row = Record<string, unknown>;
const ausente = (e: { code?: string; message?: string }) =>
  e.code === "42P01" ||
  e.code === "PGRST205" ||
  e.code === "PGRST202" ||
  /orcamentos|criar_orcamento_pe/.test(e.message ?? "");
const erro = (e: { message: string }) =>
  new Error(e.message || "Algo deu errado. Tente novamente.");
const n = (v: unknown) => Number((v as N) ?? 0);
const s = (v: unknown) => (v ?? "") as string;
const sn = (v: unknown) => (v === null || v === undefined ? null : (v as string));

const orcamentoDaLinha = (r: Row): OrcamentoPE => ({
  id: s(r["id"]),
  ano: n(r["ano"]),
  mes: n(r["mes"]),
  numero: n(r["numero"]),
  cliente: s(r["cliente"]),
  informacoes: s(r["informacoes"]),
  endereco: s(r["endereco"]),
  responsavel: s(r["responsavel"]),
  observacao: s(r["observacao"]),
  situacao: s(r["situacao"]) as SituacaoOrcamento,
  revisao: n(r["revisao"]),
  briefingId: sn(r["briefing_id"]),
  vendaId: sn(r["venda_id"]),
  createdByNome: s(r["created_by_nome"]),
  createdAt: s(r["created_at"]),
  updatedAt: s(r["updated_at"]),
});

const linhaDaLinha = (r: Row): LinhaOrcamentoPE => ({
  id: s(r["id"]),
  secao: s(r["secao"]),
  ordem: n(r["ordem"]),
  descricao: s(r["descricao"]),
  unidade: s(r["unidade"]),
  quantidade: n(r["quantidade"]),
  valorUnitario: n(r["valor_unitario"]),
  produtoId: sn(r["produto_id"]),
  custoId: sn(r["custo_id"]),
  observacao: sn(r["observacao"]),
});

/** List row with the cost (sum of the lines) for the screen. */
export interface OrcamentoPEResumo extends OrcamentoPE {
  custo: number;
}

export const orcamentosPERepository = {
  /** All orçamentos, newest first; null when 0052 isn't applied yet. */
  async lista(): Promise<OrcamentoPEResumo[] | null> {
    const { data, error } = await pub
      .from("orcamentos")
      .select("*, orcamentos_linhas(quantidade, valor_unitario)")
      .order("ano", { ascending: false })
      .order("mes", { ascending: false })
      .order("numero", { ascending: false })
      .limit(300);
    if (error) {
      if (ausente(error)) return null;
      throw erro(error);
    }
    return ((data ?? []) as Row[]).map((r) => ({
      ...orcamentoDaLinha(r),
      custo: ((r["orcamentos_linhas"] as Row[] | null) ?? []).reduce(
        (t, l) => t + n(l["quantidade"]) * n(l["valor_unitario"]),
        0,
      ),
    }));
  },

  async um(id: string): Promise<{ orcamento: OrcamentoPE; linhas: LinhaOrcamentoPE[] } | null> {
    const { data, error } = await pub
      .from("orcamentos")
      .select("*, orcamentos_linhas(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      if (ausente(error)) return null;
      throw erro(error);
    }
    if (!data) return null;
    const r = data as Row;
    return {
      orcamento: orcamentoDaLinha(r),
      linhas: ((r["orcamentos_linhas"] as Row[] | null) ?? []).map(linhaDaLinha),
    };
  },

  async porBriefing(briefingId: string): Promise<string | null> {
    const { data, error } = await pub
      .from("orcamentos")
      .select("id")
      .eq("briefing_id", briefingId)
      .maybeSingle();
    if (error) {
      if (ausente(error)) return null;
      throw erro(error);
    }
    return data ? s((data as Row)["id"]) : null;
  },

  async revisoes(id: string): Promise<RevisaoPE[]> {
    const { data, error } = await pub
      .from("orcamentos_revisoes")
      .select("*")
      .eq("orcamento_id", id)
      .order("numero", { ascending: false });
    if (error) {
      if (ausente(error)) return [];
      throw erro(error);
    }
    return ((data ?? []) as Row[]).map((r) => ({
      id: s(r["id"]),
      numero: n(r["numero"]),
      custo: n(r["custo"]),
      venda: n(r["venda"]),
      enviadaPorNome: s(r["enviada_por_nome"]),
      enviadaEm: s(r["enviada_em"]),
      decisao: sn(r["decisao"]) as RevisaoPE["decisao"],
      decididoPorNome: sn(r["decidido_por_nome"]),
      decididoEm: sn(r["decidido_em"]),
      motivo: sn(r["motivo"]),
      ajusteMotivo: sn(r["ajuste_motivo"]),
    }));
  },

  /** New sheet with the standard scope already filled in. Returns its id. */
  async criar(briefingId?: string): Promise<string> {
    const { data, error } = await pub.rpc("criar_orcamento_pe", { _briefing: briefingId ?? null });
    if (error) throw erro(error);
    return data as string;
  },

  async salvar(
    id: string,
    cab: CabecalhoOrcamentoInput,
    linhas: LinhaOrcamentoInput[],
  ): Promise<void> {
    const { error } = await pub.rpc("salvar_orcamento_pe", {
      _id: id,
      _dados: {
        ...cab,
        linhas: linhas.map((l) => ({
          secao: l.secao,
          descricao: l.descricao,
          unidade: l.unidade,
          quantidade: l.quantidade,
          valor_unitario: l.valorUnitario,
          produto_id: l.produtoId,
          custo_id: l.custoId,
          observacao: l.observacao,
        })),
      },
    });
    if (error) throw erro(error);
  },

  async enviar(id: string): Promise<number> {
    const { data, error } = await pub.rpc("enviar_orcamento_pe", { _id: id });
    if (error) throw erro(error);
    return Number(data);
  },

  async decidir(id: string, fechar: boolean, motivo?: string): Promise<void> {
    const { error } = await pub.rpc("decidir_orcamento_pe", {
      _id: id,
      _fechar: fechar,
      _motivo: motivo ?? null,
    });
    if (error) throw erro(error);
  },

  async reabrir(id: string, motivo: string): Promise<void> {
    const { error } = await pub.rpc("reabrir_orcamento_pe", { _id: id, _motivo: motivo });
    if (error) throw erro(error);
  },

  /** Closed → proposta (preço venda | desconto | sem_nota). Returns the proposta id. */
  async gerarProposta(
    id: string,
    cadastroId: string | null,
    empresaId: string | null,
    preco: "venda" | "desconto" | "sem_nota",
  ): Promise<string> {
    const { data, error } = await pub.rpc("gerar_proposta_orcamento_pe", {
      _id: id,
      _cadastro: cadastroId,
      _empresa: empresaId,
      _preco: preco,
    });
    if (error) throw erro(error);
    return data as string;
  },

  async excluir(id: string): Promise<void> {
    const { error } = await pub.rpc("excluir_orcamento_pe", { _id: id });
    if (error) throw erro(error);
  },
};
