import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { NotaNfe } from "./nfe-xml";
import type {
  LinhaPlanilhaEstoque,
  MotivoPerda,
  TipoMovimento,
  UnidadeEstoque,
} from "./estoque-rules";

// The estoque schema (migration 0046) is newer than the generated database types.
const db = (supabase as unknown as SupabaseClient).schema("estoque");
const pub = supabase as unknown as SupabaseClient;

/** One product with its balance (view estoque.v_produtos). Cost is null without permission. */
export interface ProdutoEstoque {
  id: string;
  codigo: string;
  setor: string;
  setorNome: string;
  nome: string;
  unidade: UnidadeEstoque;
  estoqueMinimo: number | null;
  observacao: string | null;
  ativo: boolean;
  fornecedorId: string | null;
  fornecedor: string | null;
  quantidade: number;
  custo: number | null;
  ultimaEntrada: string | null;
  ultimoLote: string | null;
  abaixoMinimo: boolean;
  movimentos: number;
  /** Preço da tabela de cotação (0049); null sem permissão. */
  precoReferencia: number | null;
  precoReferenciaData: string | null;
  /** Where `custo` comes from: last Entrada or the reference price. */
  custoOrigem: "entrada" | "referencia" | null;
}

/** One stock movement (view estoque.v_movimentos). */
export interface MovimentoEstoque {
  id: string;
  produtoId: string;
  codigo: string;
  produto: string;
  unidade: string;
  tipo: TipoMovimento;
  data: string;
  quantidade: number;
  quantidadeSinal: number;
  valorUnitario: number | null;
  fornecedor: string | null;
  lote: string | null;
  cliente: string | null;
  ordemId: string | null;
  ordemNumero: number | null;
  responsavel: string | null;
  motivo: MotivoPerda | null;
  notaNumero: string | null;
  observacao: string | null;
  registradoPorNome: string | null;
  createdAt: string;
}

export interface ProdutoInput {
  setor: string;
  nome: string;
  unidade: UnidadeEstoque;
  estoqueMinimo: number | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  observacao: string;
  ativo: boolean;
  /** Omit to keep it; null clears it. */
  precoReferencia?: number | null;
}

export interface MovimentoInput {
  tipo: TipoMovimento;
  produtoId: string;
  data: string;
  quantidade: number;
  valorUnitario?: number | null;
  fornecedorId?: string | null;
  fornecedorNome?: string | null;
  lote?: string;
  clienteId?: string | null;
  /** Production order number (nº); the database fills the client from the order. */
  ordemNumero?: number | null;
  responsavel?: string;
  motivo?: MotivoPerda | null;
  notaNumero?: string;
  observacao?: string;
}

/** How a note item was recognized (null = no match). */
export type OrigemItemNota = "codigo" | "similar" | "similar_geral" | "produto";

export interface IdentificacaoNota {
  fornecedorId: string | null;
  jaImportada: boolean;
  itens: { produtoId: string | null; origem: OrigemItemNota | null; fator: number }[];
}

/** What to do with each note item when importing. */
export interface ItemImportacao {
  acao: "produto" | "novo" | "ignorar";
  produtoId: string | null;
  novoSetor: string;
  novoNome: string;
  novaUnidade: UnidadeEstoque;
  /** Stock units per note unit (1 box = 12 un → 12). */
  fator: number;
  lote: string;
  /** Save this supplier name/code as a similar of the product (default true). */
  lembrar: boolean;
}

/** A supplier name (or a general name) linked to a product. */
export interface SimilarEstoque {
  id: string;
  produtoId: string;
  nome: string;
  fornecedorCnpj: string | null;
  fornecedorNome: string | null;
  codigoFornecedor: string | null;
  fator: number;
}

export interface ImportacaoEstoque {
  criados: number;
  entradas: number;
  /** Reference prices saved (0049; missing on older databases). */
  precos?: number;
  erros: { linha: number; produto: string | null; erro: string }[];
}

/** True when the schema isn't there or isn't exposed in the Data API yet. */
export const estoqueAusente = (error: { code?: string; message?: string }) =>
  error.code === "42P01" ||
  error.code === "PGRST205" ||
  error.code === "PGRST106" ||
  /schema must be one of|Invalid schema/i.test(error.message ?? "");

function erro(error: { message: string; code?: string }): Error {
  if (estoqueAusente(error))
    return new Error(
      "O estoque ainda não está ligado: rode a migration 0046 e exponha o schema “estoque” no Supabase.",
    );
  if (error.code === "23505") return new Error("Já existe um produto com esse nome.");
  return new Error(error.message || "Algo deu errado. Tente novamente.");
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// Raw rows of the views (numeric columns arrive as numbers or strings).
type N = number | string | null;
interface ProdutoRow {
  id: string;
  codigo: string;
  setor: string;
  setor_nome: string;
  nome: string;
  unidade: string;
  estoque_minimo: N;
  observacao: string | null;
  ativo: boolean;
  fornecedor_id: string | null;
  fornecedor: string | null;
  quantidade: N;
  custo: N;
  ultima_entrada: string | null;
  ultimo_lote: string | null;
  abaixo_minimo: boolean | null;
  movimentos: N;
  preco_referencia?: N;
  preco_referencia_data?: string | null;
  custo_origem?: string | null;
}
interface MovimentoRow {
  id: string;
  produto_id: string;
  codigo: string;
  produto: string;
  unidade: string;
  tipo: string;
  data: string;
  quantidade: N;
  quantidade_sinal: N;
  valor_unitario: N;
  fornecedor: string | null;
  lote: string | null;
  cliente: string | null;
  ordem_id: string | null;
  ordem_numero: N;
  responsavel: string | null;
  motivo: string | null;
  nota_numero: string | null;
  observacao: string | null;
  registrado_por_nome: string | null;
  created_at: string;
}
const produtoDaLinha = (r: ProdutoRow): ProdutoEstoque => ({
  id: r.id,
  codigo: r.codigo,
  setor: r.setor,
  setorNome: r.setor_nome,
  nome: r.nome,
  unidade: r.unidade as UnidadeEstoque,
  estoqueMinimo: num(r.estoque_minimo),
  observacao: r.observacao ?? null,
  ativo: Boolean(r.ativo),
  fornecedorId: r.fornecedor_id ?? null,
  fornecedor: r.fornecedor ?? null,
  quantidade: Number(r.quantidade ?? 0),
  custo: num(r.custo),
  ultimaEntrada: r.ultima_entrada ?? null,
  ultimoLote: r.ultimo_lote ?? null,
  abaixoMinimo: Boolean(r.abaixo_minimo),
  movimentos: Number(r.movimentos ?? 0),
  precoReferencia: num(r.preco_referencia),
  precoReferenciaData: r.preco_referencia_data ?? null,
  custoOrigem:
    r.custo_origem === "entrada" || r.custo_origem === "referencia" ? r.custo_origem : null,
});

const movimentoDaLinha = (r: MovimentoRow): MovimentoEstoque => ({
  id: r.id,
  produtoId: r.produto_id,
  codigo: r.codigo,
  produto: r.produto,
  unidade: r.unidade,
  tipo: r.tipo as TipoMovimento,
  data: r.data,
  quantidade: Number(r.quantidade),
  quantidadeSinal: Number(r.quantidade_sinal),
  valorUnitario: num(r.valor_unitario),
  fornecedor: r.fornecedor ?? null,
  lote: r.lote ?? null,
  cliente: r.cliente ?? null,
  ordemId: r.ordem_id ?? null,
  ordemNumero: num(r.ordem_numero),
  responsavel: r.responsavel ?? null,
  motivo: (r.motivo as MotivoPerda | null) ?? null,
  notaNumero: r.nota_numero ?? null,
  observacao: r.observacao ?? null,
  registradoPorNome: r.registrado_por_nome ?? null,
  createdAt: r.created_at,
});

/** One line of a service's material list (view estoque.v_materiais_item, migration 0048). */
export interface MaterialItem {
  id: string;
  vendaItemId: string;
  vendaId: string;
  vendaTipo: "proposta" | "pedido";
  vendaNumero: number | null;
  vendaStatus: string;
  cliente: string | null;
  itemOrdem: number;
  itemDescricao: string;
  ordemId: string | null;
  ordemNumero: number | null;
  ordemStatus: string | null;
  produtoId: string;
  codigo: string;
  produto: string;
  unidade: string;
  quantidade: number;
  /** Baixas − devoluções already made for the item's ordem. */
  baixado: number;
  pendente: number;
  /** Approved and still open: counts in the previsão. */
  contaNaPrevisao: boolean;
  observacao: string | null;
  atualizadoPorNome: string | null;
  /** Seção da composição (0050; "" = sem seção). */
  secao: string;
  /** Null without permission to see costs. */
  valorUnitario: number | null;
  /** Quantity of this product in all sections of the item. */
  quantidadeTotal: number;
  ordem: number;
}

/** One product in the previsão (view estoque.v_previsao). ultimoValor is null without permission. */
export interface PrevisaoEstoque {
  id: string;
  codigo: string;
  setor: string;
  nome: string;
  unidade: string;
  estoqueMinimo: number | null;
  ativo: boolean;
  fornecedor: string | null;
  ultimoValor: number | null;
  ultimaEntrada: string | null;
  ultimoLote: string | null;
  saldo: number;
  reservado: number;
  previsto: number;
  falta: number;
  faltaComMinimo: number;
  servicos: number;
}

export interface LinhaListaMaterial {
  produtoId: string;
  quantidade: number;
  observacao?: string | null;
}

interface MaterialRow {
  id: string;
  venda_item_id: string;
  venda_id: string;
  venda_tipo: string;
  venda_numero: N;
  venda_status: string;
  cliente: string | null;
  item_ordem: N;
  item_descricao: string;
  ordem_id: string | null;
  ordem_numero: N;
  ordem_status: string | null;
  produto_id: string;
  codigo: string;
  produto: string;
  unidade: string;
  quantidade: N;
  baixado: N;
  pendente: N;
  conta_na_previsao: boolean | null;
  observacao: string | null;
  atualizado_por_nome: string | null;
  secao?: string | null;
  valor_unitario?: N;
  quantidade_total?: N;
  ordem?: N;
}
const materialDaLinha = (r: MaterialRow): MaterialItem => ({
  id: r.id,
  vendaItemId: r.venda_item_id,
  vendaId: r.venda_id,
  vendaTipo: r.venda_tipo === "pedido" ? "pedido" : "proposta",
  vendaNumero: num(r.venda_numero),
  vendaStatus: r.venda_status,
  cliente: r.cliente ?? null,
  itemOrdem: Number(r.item_ordem ?? 0),
  itemDescricao: r.item_descricao,
  ordemId: r.ordem_id ?? null,
  ordemNumero: num(r.ordem_numero),
  ordemStatus: r.ordem_status ?? null,
  produtoId: r.produto_id,
  codigo: r.codigo,
  produto: r.produto,
  unidade: r.unidade,
  quantidade: Number(r.quantidade ?? 0),
  baixado: Number(r.baixado ?? 0),
  pendente: Number(r.pendente ?? 0),
  contaNaPrevisao: Boolean(r.conta_na_previsao),
  observacao: r.observacao ?? null,
  atualizadoPorNome: r.atualizado_por_nome ?? null,
  secao: r.secao ?? "",
  valorUnitario: num(r.valor_unitario),
  quantidadeTotal: Number(r.quantidade_total ?? r.quantidade ?? 0),
  ordem: Number(r.ordem ?? 0),
});

interface PrevisaoRow {
  id: string;
  codigo: string;
  setor: string;
  nome: string;
  unidade: string;
  estoque_minimo: N;
  ativo: boolean;
  fornecedor: string | null;
  ultimo_valor: N;
  ultima_entrada: string | null;
  ultimo_lote: string | null;
  saldo: N;
  reservado: N;
  previsto: N;
  falta: N;
  falta_com_minimo: N;
  servicos: N;
}
const previsaoDaLinha = (r: PrevisaoRow): PrevisaoEstoque => ({
  id: r.id,
  codigo: r.codigo,
  setor: r.setor,
  nome: r.nome,
  unidade: r.unidade,
  estoqueMinimo: num(r.estoque_minimo),
  ativo: Boolean(r.ativo),
  fornecedor: r.fornecedor ?? null,
  ultimoValor: num(r.ultimo_valor),
  ultimaEntrada: r.ultima_entrada ?? null,
  ultimoLote: r.ultimo_lote ?? null,
  saldo: Number(r.saldo ?? 0),
  reservado: Number(r.reservado ?? 0),
  previsto: Number(r.previsto ?? 0),
  falta: Number(r.falta ?? 0),
  faltaComMinimo: Number(r.falta_com_minimo ?? 0),
  servicos: Number(r.servicos ?? 0),
});

/** True when the 0048 views aren't there yet (older database): the screens then hide the list. */
const listaAusente = (error: { code?: string; message?: string }) => estoqueAusente(error);

export const estoqueRepository = {
  /** Null when the estoque schema isn't available yet (migration or Data API setting missing). */
  async produtos(): Promise<ProdutoEstoque[] | null> {
    const { data, error } = await db.from("v_produtos").select("*").order("codigo");
    if (error) {
      if (estoqueAusente(error)) return null;
      throw erro(error);
    }
    return ((data ?? []) as ProdutoRow[]).map(produtoDaLinha);
  },

  /** Latest movements, newest first (one product, or everything). */
  async movimentos(produtoId?: string, limite = 500): Promise<MovimentoEstoque[]> {
    let q = db
      .from("v_movimentos")
      .select("*")
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limite);
    if (produtoId) q = q.eq("produto_id", produtoId);
    const { data, error } = await q;
    if (error) throw erro(error);
    return ((data ?? []) as MovimentoRow[]).map(movimentoDaLinha);
  },

  async salvarProduto(id: string | null, p: ProdutoInput): Promise<string> {
    const { data, error } = await db.rpc("salvar_produto", {
      _id: id,
      _dados: {
        setor: p.setor,
        nome: p.nome,
        unidade: p.unidade,
        estoque_minimo: p.estoqueMinimo,
        fornecedor_id: p.fornecedorId,
        fornecedor_nome: p.fornecedorId ? null : p.fornecedorNome,
        observacao: p.observacao,
        ativo: p.ativo,
        ...(p.precoReferencia !== undefined && { preco_referencia: p.precoReferencia }),
      },
    });
    if (error) throw erro(error);
    return data as string;
  },

  async excluirProduto(id: string): Promise<void> {
    const { error } = await db.rpc("excluir_produto", { _id: id });
    if (error) throw erro(error);
  },

  async registrarMovimento(m: MovimentoInput): Promise<void> {
    let ordemId: string | null = null;
    if (m.ordemNumero) {
      const { data, error } = await pub
        .from("ordens_producao")
        .select("id")
        .eq("numero", m.ordemNumero)
        .maybeSingle();
      if (error) throw erro(error);
      if (!data) throw new Error(`Ordem de produção nº ${m.ordemNumero} não encontrada.`);
      ordemId = data.id as string;
    }
    const { error } = await db.rpc("registrar_movimento", {
      _dados: {
        tipo: m.tipo,
        produto_id: m.produtoId,
        data: m.data,
        quantidade: m.quantidade,
        valor_unitario: m.valorUnitario ?? null,
        fornecedor_id: m.fornecedorId ?? null,
        fornecedor_nome: m.fornecedorId ? null : (m.fornecedorNome ?? null),
        lote: m.lote ?? null,
        cliente_id: m.clienteId ?? null,
        ordem_id: ordemId,
        responsavel: m.responsavel ?? null,
        motivo: m.motivo ?? null,
        nota_numero: m.notaNumero ?? null,
        observacao: m.observacao ?? null,
      },
    });
    if (error) throw erro(error);
  },

  async excluirMovimento(id: string): Promise<void> {
    const { error } = await db.rpc("excluir_movimento", { _id: id });
    if (error) throw erro(error);
  },

  async importarPlanilha(linhas: LinhaPlanilhaEstoque[]): Promise<ImportacaoEstoque> {
    const { data, error } = await db.rpc("importar_planilha", { _linhas: linhas });
    if (error) throw erro(error);
    return data as ImportacaoEstoque;
  },

  // ---------- NF-e XML and similares (0047) ----------
  /** Suggests the product of each note item (supplier code → supplier name → general → product). */
  async identificarNota(nota: NotaNfe): Promise<IdentificacaoNota> {
    const { data, error } = await db.rpc("identificar_itens_nota", {
      _cnpj: nota.cnpj,
      _chave: nota.chave,
      _itens: nota.itens.map((i) => ({ codigo: i.codigo, nome: i.nome })),
    });
    if (error) throw erro(error);
    const r = data as {
      fornecedor_id: string | null;
      ja_importada: boolean;
      itens: { produto_id: string | null; origem: OrigemItemNota | null; fator: N }[];
    };
    return {
      fornecedorId: r.fornecedor_id,
      jaImportada: r.ja_importada,
      itens: r.itens.map((i) => ({
        produtoId: i.produto_id,
        origem: i.origem,
        fator: Number(i.fator ?? 1),
      })),
    };
  },

  /** Saves the note, the similares (when `lembrar`) and one Entrada per item; returns its id. */
  async importarNota(
    nota: NotaNfe,
    fornecedorId: string | null,
    itens: ItemImportacao[],
  ): Promise<string> {
    const { data, error } = await db.rpc("importar_nota", {
      _nota: {
        chave: nota.chave,
        numero: nota.numero,
        serie: nota.serie,
        emissao: nota.emissao,
        cnpj: nota.cnpj,
        fornecedor_nome: nota.fornecedorNome,
        fornecedor_id: fornecedorId,
        valor_total: nota.valorTotal,
        itens: nota.itens.map((item, i) => {
          const d = itens[i];
          if (!d || d.acao === "ignorar") return { nome: item.nome, ignorar: true };
          return {
            codigo: item.codigo,
            nome: item.nome,
            quantidade: item.quantidade,
            valor_unitario: item.valorUnitario,
            lote: d.lote,
            fator: d.fator,
            lembrar: d.lembrar,
            ...(d.acao === "novo"
              ? { novo: { setor: d.novoSetor, nome: d.novoNome, unidade: d.novaUnidade } }
              : { produto_id: d.produtoId }),
          };
        }),
      },
    });
    if (error) {
      if (error.code === "23505") throw new Error("Esta nota já foi importada.");
      throw erro(error);
    }
    return data as string;
  },

  async similares(produtoId: string): Promise<SimilarEstoque[]> {
    const { data, error } = await db
      .from("v_similares")
      .select("id, produto_id, nome, fornecedor_cnpj, fornecedor_nome, codigo_fornecedor, fator")
      .eq("produto_id", produtoId)
      .order("nome");
    if (error) {
      if (estoqueAusente(error)) return [];
      throw erro(error);
    }
    return (
      (data ?? []) as {
        id: string;
        produto_id: string;
        nome: string;
        fornecedor_cnpj: string | null;
        fornecedor_nome: string | null;
        codigo_fornecedor: string | null;
        fator: N;
      }[]
    ).map((s) => ({
      id: s.id,
      produtoId: s.produto_id,
      nome: s.nome,
      fornecedorCnpj: s.fornecedor_cnpj,
      fornecedorNome: s.fornecedor_nome,
      codigoFornecedor: s.codigo_fornecedor,
      fator: Number(s.fator ?? 1),
    }));
  },

  async salvarSimilar(produtoId: string, nome: string, fator = 1): Promise<void> {
    const { error } = await db.rpc("salvar_similar", {
      _produto: produtoId,
      _nome: nome,
      _fator: fator,
    });
    if (error) {
      if (error.code === "23505") throw new Error("Esse nome já está ligado a um produto.");
      throw erro(error);
    }
  },

  async excluirSimilar(id: string): Promise<void> {
    const { error } = await db.rpc("excluir_similar", { _id: id });
    if (error) throw erro(error);
  },

  /** Material lists of a proposta/pedido (all its items). Null when 0048 isn't applied yet. */
  async materiaisDaVenda(vendaId: string): Promise<MaterialItem[] | null> {
    const { data, error } = await db
      .from("v_materiais_item")
      .select("*")
      .eq("venda_id", vendaId)
      .order("item_ordem")
      .order("codigo");
    if (error) {
      if (listaAusente(error)) return null;
      throw erro(error);
    }
    return ((data ?? []) as MaterialRow[]).map(materialDaLinha);
  },

  /** Material list of the item behind a production order (empty when the order has no item). */
  async materiaisDaOrdem(ordemId: string): Promise<MaterialItem[]> {
    const { data, error } = await db
      .from("v_materiais_item")
      .select("*")
      .eq("ordem_id", ordemId)
      .order("codigo");
    if (error) {
      if (listaAusente(error)) return [];
      throw erro(error);
    }
    return ((data ?? []) as MaterialRow[]).map(materialDaLinha);
  },

  /** What the open, approved services still need (pending > 0), optionally for one product. */
  async demanda(produtoId?: string): Promise<MaterialItem[]> {
    let q = db.from("v_demanda").select("*").order("venda_numero").order("item_ordem");
    if (produtoId) q = q.eq("produto_id", produtoId);
    const { data, error } = await q;
    if (error) {
      if (listaAusente(error)) return [];
      throw erro(error);
    }
    return ((data ?? []) as MaterialRow[]).map(materialDaLinha);
  },

  /** Balance − reserved for every product. Null when 0048 isn't applied yet. */
  async previsao(): Promise<PrevisaoEstoque[] | null> {
    const { data, error } = await db.from("v_previsao").select("*").order("codigo");
    if (error) {
      if (listaAusente(error)) return null;
      throw erro(error);
    }
    return ((data ?? []) as PrevisaoRow[]).map(previsaoDaLinha);
  },

  /** Replaces the whole material list of one item (empty list clears it). */
  async salvarListaMaterial(vendaItemId: string, linhas: LinhaListaMaterial[]): Promise<number> {
    const { data, error } = await db.rpc("salvar_lista_material", {
      _venda_item: vendaItemId,
      _linhas: linhas.map((l) => ({
        produto_id: l.produtoId,
        quantidade: l.quantidade,
        observacao: l.observacao ?? null,
      })),
    });
    if (error) throw erro(error);
    return Number(data ?? 0);
  },
};
