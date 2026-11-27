import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
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

export interface ImportacaoEstoque {
  criados: number;
  entradas: number;
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
};
