/**
 * Estoque (etapa 1, migration 0046): sectors and code prefixes, who may move stock or see costs,
 * the spreadsheet columns for import/export and the on-screen search. Pure functions, tested in
 * estoque-rules.test.ts. Dates are "YYYY-MM-DD".
 */

/** Code prefix of each sector: the system completes the number (06 → 06.0001, 06.0002…). */
export const SETORES_ESTOQUE = [
  { prefixo: "01", nome: "Impressão" },
  { prefixo: "02", nome: "Serralheria" },
  { prefixo: "03", nome: "Projetos" },
  { prefixo: "04", nome: "Corte" },
  { prefixo: "05", nome: "Matéria-prima" },
  { prefixo: "06", nome: "Insumos" },
  { prefixo: "07", nome: "Ferramentas" },
  { prefixo: "08", nome: "EPI" },
] as const;

export const UNIDADES_ESTOQUE = [
  "un",
  "m",
  "m²",
  "chapa",
  "rolo",
  "barra",
  "litro",
  "kg",
  "caixa",
  "par",
] as const;
export type UnidadeEstoque = (typeof UNIDADES_ESTOQUE)[number];

export const TIPOS_MOVIMENTO = ["Entrada", "Baixa", "Devolução", "Perda", "Ajuste"] as const;
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number];

export const MOTIVOS_PERDA = ["Retrabalho", "Produto defeituoso", "Outro"] as const;
export type MotivoPerda = (typeof MOTIVOS_PERDA)[number];

type WithFuncoes = { funcoes: readonly string[] } | null | undefined;
const tem = (user: WithFuncoes, ...funcoes: string[]) =>
  Boolean(user && user.funcoes.some((f) => funcoes.includes(f)));

/** Products, entries, baixas, devoluções, perdas and import (database: estoque.pode_movimentar). */
export const canMovimentarEstoque = (user: WithFuncoes) =>
  tem(user, "gestor", "direcao", "estoque");

/** Costs and prices paid (database: estoque.pode_ver_custo; the views return null otherwise). */
export const canVerCustoEstoque = (user: WithFuncoes) =>
  tem(user, "gestor", "direcao", "estoque", "financeiro");

/** Only gestão deletes a wrong entry (database: estoque.excluir_movimento). */
export const canExcluirMovimento = (user: WithFuncoes) => tem(user, "gestor");

export function nomeDoSetor(prefixo: string): string {
  return SETORES_ESTOQUE.find((s) => s.prefixo === prefixo)?.nome ?? prefixo;
}

/** Stock changes in the balance: Baixa and Perda subtract; Ajuste carries its own sign. */
export function sinalMovimento(tipo: TipoMovimento, quantidade: number): number {
  return tipo === "Baixa" || tipo === "Perda" ? -quantidade : quantidade;
}

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
export const formatQtd = (n: number) => NUM.format(n);
export const formatCusto = (n: number | null) => (n === null ? "—" : BRL.format(n));

/** "1.234,5" / "1234.5" / "12,50" → number; empty or invalid → null. */
export function lerNumero(texto: string | null | undefined): number | null {
  const s = (texto ?? "").trim().replace(/\s|R\$/g, "");
  if (!s) return null;
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Search by name, code, sector or supplier, ignoring accents and case. */
export function filtrarProdutos<
  T extends { nome: string; codigo: string; setorNome: string; fornecedor: string | null },
>(produtos: T[], busca: string, setor: string): T[] {
  const termo = semAcento(busca);
  return produtos.filter(
    (p) =>
      (!setor || p.codigo.startsWith(`${setor}.`)) &&
      (!termo ||
        semAcento(`${p.nome} ${p.codigo} ${p.setorNome} ${p.fornecedor ?? ""}`).includes(termo)),
  );
}

// ---------- Spreadsheet (import and export use the same columns) ----------
export const COLUNAS_PLANILHA_ESTOQUE = [
  "codigo",
  "produto",
  "setor",
  "unidade",
  "quantidade",
  "custo",
  "fornecedor",
  "lote",
  "minimo",
  "observacao",
] as const;

export interface LinhaPlanilhaEstoque {
  codigo: string;
  produto: string;
  setor: string;
  unidade: string;
  quantidade: string;
  custo: string;
  fornecedor: string;
  lote: string;
  minimo: string;
  observacao: string;
}

/** Accepted header spellings (accents/case ignored) for each column. */
const APELIDOS: Record<keyof LinhaPlanilhaEstoque, string[]> = {
  codigo: ["codigo", "cod", "código"],
  produto: ["produto", "material", "nome", "descricao"],
  setor: ["setor", "prefixo", "grupo"],
  unidade: ["unidade", "un", "und"],
  quantidade: ["quantidade", "qtd", "qtde", "saldo", "estoque"],
  custo: ["custo", "valor", "valor unitario", "ultimo valor pago", "preco"],
  fornecedor: ["fornecedor"],
  lote: ["lote"],
  minimo: ["minimo", "estoque minimo"],
  observacao: ["observacao", "obs", "observacoes"],
};

/**
 * Spreadsheet rows (parsed CSV with any of the accepted headers) → import rows. Rows without a
 * product name are dropped; numbers keep the text so the database reports bad values per row.
 */
export function linhasDaPlanilha(rows: Record<string, string>[]): LinhaPlanilhaEstoque[] {
  const [primeira] = rows;
  if (!primeira) return [];
  const headers = Object.keys(primeira);
  const coluna = (campo: keyof LinhaPlanilhaEstoque) =>
    headers.find((h) => APELIDOS[campo].map(semAcento).includes(semAcento(h)));
  const mapa = Object.fromEntries(COLUNAS_PLANILHA_ESTOQUE.map((c) => [c, coluna(c)])) as Record<
    keyof LinhaPlanilhaEstoque,
    string | undefined
  >;
  if (!mapa.produto) throw new Error("A planilha precisa de uma coluna “produto”.");
  const num = (v: string) => {
    const n = lerNumero(v);
    return n === null ? v.trim() : String(n);
  };
  return rows
    .map((r) => {
      const get = (c: keyof LinhaPlanilhaEstoque) => (mapa[c] ? (r[mapa[c]] ?? "").trim() : "");
      return {
        codigo: get("codigo"),
        produto: get("produto").replace(/\s+/g, " "),
        setor: get("setor"),
        unidade: get("unidade"),
        quantidade: num(get("quantidade")),
        custo: num(get("custo")),
        fornecedor: get("fornecedor"),
        lote: get("lote"),
        minimo: num(get("minimo")),
        observacao: get("observacao"),
      };
    })
    .filter((l) => l.produto !== "");
}

// ---------- Lista de material, previsão e lista de compras (migration 0048) ----------
/** Who builds the material list of a proposta/pedido item (database: estoque.pode_listar_material). */
export const canListarMaterial = (user: WithFuncoes) =>
  tem(user, "gestor", "direcao", "estoque", "projetos_especiais");

interface ItemPrevisao {
  codigo: string;
  nome: string;
  unidade: string;
  fornecedor: string | null;
  ultimoValor: number | null;
  ultimoLote: string | null;
  saldo: number;
  reservado: number;
  falta: number;
  faltaComMinimo: number;
}

/** What to buy: falta (or falta + estoque mínimo) above zero. */
export const quantoComprar = (p: ItemPrevisao, comMinimo: boolean) =>
  comMinimo ? p.faltaComMinimo : p.falta;

/**
 * Rows of the downloadable shopping list (Material | Fornecedor | Último valor pago | Lote, plus
 * the quantities), only the products missing something, ordered by code. The price column is
 * left empty when the person can't see costs.
 */
export function linhasListaCompras(previsao: ItemPrevisao[], comMinimo: boolean) {
  return previsao
    .filter((p) => quantoComprar(p, comMinimo) > 0)
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map((p) => ({
      material: p.nome,
      codigo: p.codigo,
      fornecedor: p.fornecedor ?? "",
      ultimo_valor_pago: p.ultimoValor === null ? "" : String(p.ultimoValor),
      lote: p.ultimoLote ?? "",
      comprar: String(quantoComprar(p, comMinimo)),
      unidade: p.unidade,
      saldo: String(p.saldo),
      reservado: String(p.reservado),
    }));
}
