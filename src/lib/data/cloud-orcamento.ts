import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  calcularComposicao,
  CONFIG_PADRAO,
  type Composicao,
  type GrupoCusto,
  type OrcamentoConfig,
} from "./orcamento-rules";
import type { MaterialItem } from "./cloud-estoque";

// Migration 0050 is newer than the generated database types.
const pub = supabase as unknown as SupabaseClient;
const est = pub.schema("estoque");

/** One entry of the cost catalog (mão de obra, deslocamento, serviço). */
export interface CustoOrcamento {
  id: string;
  grupo: GrupoCusto;
  nome: string;
  unidade: string;
  valor: number;
  dica: string | null;
  ordem: number;
  ativo: boolean;
}

/** One non-stock cost line of an item. */
export interface CustoItem {
  id: string;
  vendaItemId: string;
  custoId: string | null;
  secao: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  ordem: number;
}

export interface MaterialComposicaoInput {
  produtoId: string;
  secao: string;
  quantidade: number;
  valorUnitario: number | null;
  observacao?: string | null;
}
export interface CustoComposicaoInput {
  custoId: string | null;
  secao: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
}

type N = number | string | null;
/** Table or function not there yet (0050 not applied). */
const ausente = (e: { code?: string; message?: string }) =>
  e.code === "42P01" ||
  e.code === "PGRST205" ||
  e.code === "PGRST202" ||
  /orcamento_|vendas_itens_custos|salvar_composicao/.test(e.message ?? "");
const erro = (e: { message: string }) =>
  new Error(e.message || "Algo deu errado. Tente novamente.");

export const orcamentoRepository = {
  /** Factors of the price (falls back to the spreadsheet values while 0050 isn't applied). */
  async config(): Promise<OrcamentoConfig> {
    const { data, error } = await pub.from("orcamento_config").select("*").maybeSingle();
    if (error) {
      if (ausente(error)) return CONFIG_PADRAO;
      throw erro(error);
    }
    if (!data) return CONFIG_PADRAO;
    const r = data as Record<string, N>;
    return {
      fatorVenda: Number(r["fator_venda"]),
      fatorDesconto: Number(r["fator_desconto"]),
      fatorSemNota: Number(r["fator_sem_nota"]),
      entradaPct: Number(r["entrada_pct"]),
    };
  },

  async salvarConfig(c: OrcamentoConfig): Promise<void> {
    const { data, error } = await pub
      .from("orcamento_config")
      .update({
        fator_venda: c.fatorVenda,
        fator_desconto: c.fatorDesconto,
        fator_sem_nota: c.fatorSemNota,
        entrada_pct: c.entradaPct,
      })
      .eq("id", true)
      .select("id");
    if (error) throw erro(error);
    if (!data?.length) throw new Error("Somente Gestão e Direção mudam os fatores.");
  },

  /** Cost catalog; null when 0050 isn't applied (or the person can't see costs: empty). */
  async custos(): Promise<CustoOrcamento[] | null> {
    const { data, error } = await pub
      .from("orcamento_custos")
      .select("id, grupo, nome, unidade, valor, dica, ordem, ativo")
      .order("grupo")
      .order("ordem")
      .order("nome");
    if (error) {
      if (ausente(error)) return null;
      throw erro(error);
    }
    return (
      (data ?? []) as {
        id: string;
        grupo: string;
        nome: string;
        unidade: string;
        valor: N;
        dica: string | null;
        ordem: N;
        ativo: boolean;
      }[]
    ).map((c) => ({
      id: c.id,
      grupo: c.grupo as GrupoCusto,
      nome: c.nome,
      unidade: c.unidade,
      valor: Number(c.valor ?? 0),
      dica: c.dica,
      ordem: Number(c.ordem ?? 0),
      ativo: Boolean(c.ativo),
    }));
  },

  async salvarCusto(id: string | null, c: Omit<CustoOrcamento, "id">): Promise<void> {
    const linha = {
      grupo: c.grupo,
      nome: c.nome.trim(),
      unidade: c.unidade.trim() || "un",
      valor: c.valor,
      dica: c.dica?.trim() || null,
      ordem: c.ordem,
      ativo: c.ativo,
    };
    const { error } = id
      ? await pub.from("orcamento_custos").update(linha).eq("id", id)
      : await pub.from("orcamento_custos").insert(linha);
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um custo com esse nome no grupo.");
      throw erro(error);
    }
  },

  async excluirCusto(id: string): Promise<void> {
    const { error } = await pub.from("orcamento_custos").delete().eq("id", id);
    if (error) throw erro(error);
  },

  /** Non-stock cost lines of every item of a proposta/pedido (empty without permission). */
  async custosDaVenda(vendaId: string): Promise<CustoItem[] | null> {
    const { data, error } = await pub
      .from("vendas_itens_custos")
      .select(
        "id, venda_item_id, custo_id, secao, descricao, unidade, quantidade, valor_unitario, ordem, vendas_itens!inner(venda_id)",
      )
      .eq("vendas_itens.venda_id", vendaId)
      .order("ordem");
    if (error) {
      if (ausente(error)) return null;
      throw erro(error);
    }
    return (
      (data ?? []) as unknown as {
        id: string;
        venda_item_id: string;
        custo_id: string | null;
        secao: string;
        descricao: string;
        unidade: string;
        quantidade: N;
        valor_unitario: N;
        ordem: N;
      }[]
    ).map((c) => ({
      id: c.id,
      vendaItemId: c.venda_item_id,
      custoId: c.custo_id,
      secao: c.secao,
      descricao: c.descricao,
      unidade: c.unidade,
      quantidade: Number(c.quantidade ?? 0),
      valorUnitario: Number(c.valor_unitario ?? 0),
      ordem: Number(c.ordem ?? 0),
    }));
  },

  /** Replaces the whole composition of one item (materials + other costs). */
  async salvarComposicao(
    vendaItemId: string,
    materiais: MaterialComposicaoInput[],
    custos: CustoComposicaoInput[],
  ): Promise<void> {
    const { error } = await est.rpc("salvar_composicao", {
      _venda_item: vendaItemId,
      _dados: {
        materiais: materiais.map((m) => ({
          produto_id: m.produtoId,
          secao: m.secao,
          quantidade: m.quantidade,
          valor_unitario: m.valorUnitario,
          observacao: m.observacao ?? null,
        })),
        custos: custos.map((c) => ({
          custo_id: c.custoId,
          secao: c.secao,
          descricao: c.descricao,
          unidade: c.unidade,
          quantidade: c.quantidade,
          valor_unitario: c.valorUnitario,
        })),
      },
    });
    if (error) throw erro(error);
  },

  /** Writes the chosen total price into the item (÷ item quantity). Returns the unit value. */
  async aplicarPreco(vendaItemId: string, valorTotal: number): Promise<number> {
    const { data, error } = await est.rpc("aplicar_preco_item", {
      _venda_item: vendaItemId,
      _valor_total: valorTotal,
    });
    if (error) throw erro(error);
    return Number(data);
  },
};

/** Totals of the saved composition of one item (materials + other costs). */
export function composicaoDoItem(
  materiais: MaterialItem[],
  outros: CustoItem[],
  catalogo: CustoOrcamento[],
  config: OrcamentoConfig,
): Composicao {
  const grupo = (id: string | null) => catalogo.find((c) => c.id === id)?.grupo ?? null;
  return calcularComposicao(
    materiais.map((m) => ({
      secao: m.secao,
      quantidade: m.quantidade,
      valorUnitario: m.valorUnitario,
    })),
    outros.map((o) => ({
      secao: o.secao,
      grupo: grupo(o.custoId),
      quantidade: o.quantidade,
      valorUnitario: o.valorUnitario,
    })),
    config,
  );
}
