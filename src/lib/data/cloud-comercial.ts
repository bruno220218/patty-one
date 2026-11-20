import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import {
  calcDoItem,
  totaisVenda,
  type CategoriaItem,
  type HistoricoSige,
  type HistoricoTipo,
  type ItemForm,
  type TipoVenda,
} from "./comercial-rules";

// The comercial tables are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

export const VENDAS_POR_PAGINA = 50;

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
}

export interface VendaFiltros {
  tipo: TipoVenda;
  busca: string;
  status: string;
}

export interface VendaLinha {
  id: string;
  tipo: TipoVenda;
  numero: number;
  status: string;
  clienteNome: string;
  empresaNome: string;
  vendedor: string;
  validade: string | null;
  createdAt: string;
  daProposta: boolean;
  total: number;
}

export interface VendaItem {
  categoria: CategoriaItem;
  descricao: string;
  ponto: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  quantidade: number;
  valorUnitario: number;
  desconto: number;
}

export interface VendaCliente {
  id: string;
  nome: string;
  razaoSocial: string | null;
  cpfCnpj: string | null;
  contato: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string;
}

export interface Venda {
  id: string;
  tipo: TipoVenda;
  numero: number;
  status: string;
  empresaId: string;
  empresa: { nome: string; cnpj: string | null } | null;
  cliente: VendaCliente | null;
  vendedor: string;
  validade: string | null;
  condicoesPagamento: string;
  observacao: string;
  desconto: number;
  createdAt: string;
  updatedAt: string;
  itens: VendaItem[];
  propostaOrigem: { id: string; numero: number } | null;
  pedidoGerado: { id: string; numero: number } | null;
  ordens: { id: string; numero: number; status: string }[];
}

export interface VendaInput {
  empresaId: string;
  cadastroId: string;
  vendedor: string;
  status: string;
  validade: string;
  condicoesPagamento: string;
  observacao: string;
  desconto: number;
  itens: ItemForm[];
}

export interface PedidoResumo {
  id: string;
  numero: number;
  cadastroId: string | null;
  clienteNome: string;
  primeiroItem: string;
}

export interface HistoricoFiltros {
  busca: string;
  tipo: "" | HistoricoTipo;
}

export interface HistoricoLinha {
  id: string;
  tipo: HistoricoTipo;
  numeroSige: string;
  autorizacaoSige: string | null;
  contratoSige: string | null;
  propostaNumeroSige: string | null;
  clienteNome: string;
  cadastroId: string | null;
  empresaNome: string | null;
  empresaId: string | null;
  empresaOrigem: "arquivo" | "proposta" | null;
  dataDocumento: string;
  valor: number;
  valorLiquido: number | null;
  vendedor: string | null;
  statusSige: string;
  tipoServico: string | null;
}

/** Strips characters that would break a PostgREST filter. */
const limparBusca = (s: string) => s.trim().replace(/[%,()*]/g, "");

const num = (v: unknown) => Number(v) || 0;
const txt = (v: unknown) => (typeof v === "string" ? v : "");
const txtOuNull = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
type Row = Record<string, unknown>;
const umDe = (v: unknown): Row | null =>
  Array.isArray(v) ? ((v[0] as Row | undefined) ?? null) : ((v as Row | null) ?? null);

const toItem = (i: Row): VendaItem => ({
  categoria: txt(i["categoria"]) as CategoriaItem,
  descricao: txt(i["descricao"]),
  ponto: txtOuNull(i["ponto"]),
  periodoInicio: txtOuNull(i["periodo_inicio"]),
  periodoFim: txtOuNull(i["periodo_fim"]),
  quantidade: num(i["quantidade"]),
  valorUnitario: num(i["valor_unitario"]),
  desconto: num(i["desconto"]),
});

const SELECT_LISTA =
  "id, tipo, numero, status, validade, vendedor, desconto, created_at, proposta_id, empresas(nome), cadastros!inner(nome), vendas_itens(quantidade, valor_unitario, desconto)";

export const comercialRepository = {
  async empresas(): Promise<Empresa[]> {
    const { data, error } = await db.from("empresas").select("id, nome, cnpj").order("nome");
    if (error) throw dbError(error);
    return (data ?? []).map((e: Row) => ({
      id: txt(e["id"]),
      nome: txt(e["nome"]),
      cnpj: txt(e["cnpj"]),
    }));
  },

  /** One page (50), newest number first. A numeric search looks for the number. */
  async list(
    filtros: VendaFiltros,
    pagina: number,
  ): Promise<{ total: number; linhas: VendaLinha[] }> {
    const p = Math.max(1, pagina);
    let q = db
      .from("vendas")
      .select(SELECT_LISTA, { count: "exact" })
      .eq("tipo", filtros.tipo)
      .order("numero", { ascending: false })
      .range((p - 1) * VENDAS_POR_PAGINA, p * VENDAS_POR_PAGINA - 1);
    if (filtros.status) q = q.eq("status", filtros.status);
    const busca = limparBusca(filtros.busca);
    if (busca)
      q = /^\d+$/.test(busca)
        ? q.eq("numero", Number(busca))
        : q.ilike("cadastros.nome", `%${busca}%`);
    const { data, error, count } = await q;
    if (error) throw dbError(error);
    return {
      total: count ?? 0,
      linhas: (data ?? []).map((r: Row) => ({
        id: txt(r["id"]),
        tipo: r["tipo"] as TipoVenda,
        numero: num(r["numero"]),
        status: txt(r["status"]),
        clienteNome: txt(umDe(r["cadastros"])?.["nome"]),
        empresaNome: txt(umDe(r["empresas"])?.["nome"]),
        vendedor: txt(r["vendedor"]),
        validade: txtOuNull(r["validade"]),
        createdAt: txt(r["created_at"]),
        daProposta: Boolean(r["proposta_id"]),
        total: totaisVenda(
          ((r["vendas_itens"] as Row[] | null) ?? []).map(toItem),
          num(r["desconto"]),
        ).total,
      })),
    };
  },

  async get(id: string): Promise<Venda> {
    const { data, error } = await db
      .from("vendas")
      .select(
        "*, empresas(nome, cnpj), cadastros(id, nome, razao_social, cpf_cnpj, contato, email, telefone, celular, endereco, numero, bairro, cidade, estado), vendas_itens(*)",
      )
      .eq("id", id)
      .order("ordem", { referencedTable: "vendas_itens" })
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new Error("Documento não encontrado.");
    const r = data as Row;
    const propostaId = txtOuNull(r["proposta_id"]);
    const [pedido, proposta, ordens] = await Promise.all([
      db.from("vendas").select("id, numero").eq("proposta_id", id).maybeSingle(),
      propostaId
        ? db.from("vendas").select("id, numero").eq("id", propostaId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.from("ordens_producao").select("id, numero, status").eq("venda_id", id).order("numero"),
    ]);
    for (const x of [pedido, proposta, ordens]) if (x.error) throw dbError(x.error);
    const c = umDe(r["cadastros"]);
    const e = umDe(r["empresas"]);
    const ref = (x: unknown) => {
      const o = x as Row | null;
      return o ? { id: txt(o["id"]), numero: num(o["numero"]) } : null;
    };
    return {
      id,
      tipo: r["tipo"] as TipoVenda,
      numero: num(r["numero"]),
      status: txt(r["status"]),
      empresaId: txt(r["empresa_id"]),
      empresa: e ? { nome: txt(e["nome"]), cnpj: txtOuNull(e["cnpj"]) } : null,
      cliente: c
        ? {
            id: txt(c["id"]),
            nome: txt(c["nome"]),
            razaoSocial: txtOuNull(c["razao_social"]),
            cpfCnpj: txtOuNull(c["cpf_cnpj"]),
            contato: txtOuNull(c["contato"]),
            email: txtOuNull(c["email"]),
            telefone: txtOuNull(c["telefone"]) ?? txtOuNull(c["celular"]),
            endereco: [
              c["endereco"],
              c["numero"],
              c["bairro"],
              c["cidade"] && `${txt(c["cidade"])}${c["estado"] ? `/${txt(c["estado"])}` : ""}`,
            ]
              .filter(Boolean)
              .join(", "),
          }
        : null,
      vendedor: txt(r["vendedor"]),
      validade: txtOuNull(r["validade"]),
      condicoesPagamento: txt(r["condicoes_pagamento"]),
      observacao: txt(r["observacao"]),
      desconto: num(r["desconto"]),
      createdAt: txt(r["created_at"]),
      updatedAt: txt(r["updated_at"]),
      itens: ((r["vendas_itens"] as Row[] | null) ?? []).map(toItem),
      propostaOrigem: ref(proposta.data),
      pedidoGerado: ref(pedido.data),
      ordens: ((ordens.data ?? []) as Row[]).map((o) => ({
        id: txt(o["id"]),
        numero: num(o["numero"]),
        status: txt(o["status"]),
      })),
    };
  },

  /** Creates (no id) or updates the header and replaces the items; returns the id. */
  async save(tipo: TipoVenda, input: VendaInput, id?: string): Promise<string> {
    const dados = {
      tipo,
      empresa_id: input.empresaId,
      cadastro_id: input.cadastroId,
      vendedor: input.vendedor,
      status: input.status,
      validade: tipo === "proposta" ? input.validade : "",
      condicoes_pagamento: input.condicoesPagamento,
      observacao: input.observacao,
      desconto: input.desconto,
      itens: input.itens.map((i) => {
        const c = calcDoItem(i);
        const midia = i.categoria === "Mídia OOH";
        return {
          categoria: i.categoria,
          descricao: i.descricao,
          ponto: midia ? i.ponto : "",
          periodo_inicio: midia ? i.periodoInicio : "",
          periodo_fim: midia ? i.periodoFim : "",
          quantidade: c.quantidade,
          valor_unitario: c.valorUnitario,
          desconto: c.desconto,
        };
      }),
    };
    const { data, error } = await db.rpc("salvar_venda", {
      dados,
      ...(id ? { venda_uuid: id } : {}),
    });
    if (error) throw dbError(error);
    return data as string;
  },

  /** Approves the proposta and creates the pedido with the same items; returns the pedido id. */
  async gerarPedido(propostaId: string): Promise<string> {
    const { data, error } = await db.rpc("converter_proposta", { proposta_uuid: propostaId });
    if (error) throw dbError(error);
    return data as string;
  },

  /** Gestão only (database rule). */
  async remove(id: string): Promise<void> {
    const { data, error } = await db.from("vendas").delete().eq("id", id).select("id");
    if (error) throw dbError(error);
    if (!data?.length) throw new Error("Só a gestão exclui propostas e pedidos.");
  },

  /** Pedidos not cancelled, for linking a production order (latest 200). */
  async pedidosAbertos(): Promise<PedidoResumo[]> {
    const { data, error } = await db
      .from("vendas")
      .select("id, numero, cadastro_id, cadastros(nome), vendas_itens(descricao, ordem)")
      .eq("tipo", "pedido")
      .neq("status", "Cancelado")
      .order("numero", { ascending: false })
      .limit(200);
    if (error) throw dbError(error);
    return (data ?? []).map((r: Row) => {
      const itens = ((r["vendas_itens"] as Row[] | null) ?? []).sort(
        (a, b) => num(a["ordem"]) - num(b["ordem"]),
      );
      return {
        id: txt(r["id"]),
        numero: num(r["numero"]),
        cadastroId: txtOuNull(r["cadastro_id"]),
        clienteNome: txt(umDe(r["cadastros"])?.["nome"]),
        primeiroItem: txt(itens[0]?.["descricao"]),
      };
    });
  },

  async historico(
    filtros: HistoricoFiltros,
    pagina: number,
  ): Promise<{ total: number; linhas: HistoricoLinha[] }> {
    const p = Math.max(1, pagina);
    let q = db
      .from("historico_comercial_sige")
      .select(
        "id, tipo, numero_sige, autorizacao_sige, contrato_sige, proposta_numero_sige, cliente_nome, cadastro_id, empresa_nome, empresa_id, empresa_origem, data_documento, valor, valor_liquido, vendedor, status_sige, tipo_servico",
        { count: "exact" },
      )
      .order("data_documento", { ascending: false })
      .order("numero_sige", { ascending: false })
      .range((p - 1) * VENDAS_POR_PAGINA, p * VENDAS_POR_PAGINA - 1);
    if (filtros.tipo) q = q.eq("tipo", filtros.tipo);
    const busca = limparBusca(filtros.busca);
    if (busca)
      q = q.or(
        `cliente_nome.ilike.%${busca}%,numero_sige.ilike.%${busca}%,contrato_sige.ilike.%${busca}%,vendedor.ilike.%${busca}%`,
      );
    const { data, error, count } = await q;
    if (error) throw dbError(error);
    return {
      total: count ?? 0,
      linhas: (data ?? []).map((r: Row) => ({
        id: txt(r["id"]),
        tipo: r["tipo"] as HistoricoTipo,
        numeroSige: txt(r["numero_sige"]),
        autorizacaoSige: txtOuNull(r["autorizacao_sige"]),
        contratoSige: txtOuNull(r["contrato_sige"]),
        propostaNumeroSige: txtOuNull(r["proposta_numero_sige"]),
        clienteNome: txt(r["cliente_nome"]),
        cadastroId: txtOuNull(r["cadastro_id"]),
        empresaNome: txtOuNull(r["empresa_nome"]),
        empresaId: txtOuNull(r["empresa_id"]),
        empresaOrigem: (txtOuNull(r["empresa_origem"]) as HistoricoLinha["empresaOrigem"]) ?? null,
        dataDocumento: txt(r["data_documento"]),
        valor: num(r["valor"]),
        valorLiquido: r["valor_liquido"] === null ? null : num(r["valor_liquido"]),
        vendedor: txtOuNull(r["vendedor"]),
        statusSige: txt(r["status_sige"]),
        tipoServico: txtOuNull(r["tipo_servico"]),
      })),
    };
  },

  /** Gestão only, up to 500 per call. */
  async importarHistorico(
    linhas: HistoricoSige[],
  ): Promise<{ inseridos: number; atualizados: number }> {
    const { data, error } = await db.rpc("importar_historico_comercial_sige", { linhas });
    if (error) throw dbError(error);
    const r = (data ?? {}) as Row;
    return { inseridos: num(r["inseridos"]), atualizados: num(r["atualizados"]) };
  },
};
