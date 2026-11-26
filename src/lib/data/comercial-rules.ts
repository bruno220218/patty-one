/**
 * Comercial (vindo do PattyOne): totals of propostas/pedidos, situations and the reader for
 * the SIGE commercial history exports. Pure functions, tested in comercial-rules.test.ts.
 */
import { parseCsv } from "./csv";
import type { CurrentUser } from "./types";

export type TipoVenda = "proposta" | "pedido";

export const CATEGORIAS_ITEM = ["Mídia OOH", "Produção", "Serviço", "Item livre"] as const;
export type CategoriaItem = (typeof CATEGORIAS_ITEM)[number];

export const STATUS_VENDA = {
  proposta: ["Rascunho", "Enviada", "Aprovada", "Recusada"],
  pedido: ["Aberto", "Em andamento", "Concluído", "Cancelado"],
} as const satisfies Record<TipoVenda, readonly string[]>;

export const NOME_TIPO_VENDA: Record<TipoVenda, string> = {
  proposta: "Proposta",
  pedido: "Pedido",
};

/** Comercial and gestão create and edit propostas/pedidos (database rule: can_vender). */
export function canVender(user: CurrentUser | null | undefined): boolean {
  return Boolean(user && user.funcoes.some((f) => f === "gestor" || f === "comercial"));
}

export type ItemCalc = { quantidade: number; valorUnitario: number; desconto: number };

const arred = (n: number) => Math.round(n * 100) / 100;

/** Quantity × unit price − discount, never below zero. */
export function totalItem(i: ItemCalc): number {
  return arred(Math.max(0, (i.quantidade || 0) * (i.valorUnitario || 0) - (i.desconto || 0)));
}

/** The overall discount can't exceed the subtotal. */
export function totaisVenda(itens: ItemCalc[], descontoGeral: number) {
  const subtotal = arred(itens.reduce((s, i) => s + totalItem(i), 0));
  const desconto = arred(Math.min(subtotal, Math.max(0, descontoGeral || 0)));
  return { subtotal, desconto, total: arred(subtotal - desconto) };
}

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "1.234,56" → 1234.56; anything unreadable → 0. */
export function parseValor(v: string): number {
  const limpo = v.trim().replace(/\s|R\$/g, "");
  if (!limpo) return 0;
  const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(n) ? n : 0;
}

/** 1234.5 → "1234,5"; 0 → "" (empty field in the form). */
export const valorParaCampo = (n: number | null | undefined) =>
  n ? String(n).replace(".", ",") : "";

export type ItemForm = {
  /** Saved item's id (kept on save since 0034, so orders can point at it); absent when new. */
  id?: string;
  categoria: CategoriaItem;
  descricao: string;
  ponto: string;
  periodoInicio: string;
  periodoFim: string;
  quantidade: string;
  valorUnitario: string;
  desconto: string;
};

export const itemVazio = (): ItemForm => ({
  categoria: "Mídia OOH",
  descricao: "",
  ponto: "",
  periodoInicio: "",
  periodoFim: "",
  quantidade: "1",
  valorUnitario: "",
  desconto: "",
});

export const calcDoItem = (i: ItemForm): ItemCalc => ({
  quantidade: parseValor(i.quantidade),
  valorUnitario: parseValor(i.valorUnitario),
  desconto: parseValor(i.desconto),
});

/** First problem that blocks saving, or null. */
export function validarVenda(dados: {
  empresaId: string;
  cadastroId: string | null;
  itens: ItemForm[];
}): string | null {
  if (!dados.empresaId) return "Escolha a empresa do grupo.";
  if (!dados.cadastroId) return "Escolha o cliente.";
  if (dados.itens.length === 0) return "Inclua pelo menos um item.";
  for (const [k, i] of dados.itens.entries()) {
    if (!i.descricao.trim()) return `O item ${k + 1} precisa de descrição.`;
    if (parseValor(i.quantidade) <= 0)
      return `A quantidade do item ${k + 1} precisa ser maior que zero.`;
    if (i.periodoInicio && i.periodoFim && i.periodoFim < i.periodoInicio)
      return `No item ${k + 1}, o fim do período vem antes do início.`;
  }
  return null;
}

/** A proposta can become a pedido once: not refused and no pedido generated yet. */
export function podeGerarPedido(v: {
  tipo: TipoVenda;
  status: string;
  pedidoGeradoId: string | null;
}) {
  return v.tipo === "proposta" && v.status !== "Recusada" && !v.pedidoGeradoId;
}

// ---------- Histórico comercial do SIGE ----------

export type HistoricoTipo = "proposta" | "contrato" | "reserva";

export type HistoricoSige = {
  chave_sige: string;
  tipo: HistoricoTipo;
  numero_sige: string;
  autorizacao_sige: string | null;
  contrato_sige: string | null;
  proposta_numero_sige: string | null;
  cliente_nome: string;
  empresa_nome: string | null;
  empresa_origem: "arquivo" | "proposta" | null;
  data_documento: string;
  valor: number;
  valor_liquido: number | null;
  vendedor: string | null;
  status_sige: string;
  tipo_servico: string | null;
  fontes: string[];
  dados_sige: Record<string, Record<string, string>>;
};

const texto = (v?: string): string | null => (v?.trim() && v.trim() !== "-" ? v.trim() : null);

/** "R$ 1.234,56" → 1234.56. Throws on anything else. */
export function moedaSige(valor: string): number {
  const limpo = valor
    .replace(/R\$|\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) throw new Error(`Valor inválido: ${valor}`);
  return Number(limpo);
}

/** "31/12/2025" → "2025-12-31". Throws on invalid dates. */
export function dataSige(valor: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!m) throw new Error(`Data inválida: ${valor}`);
  const [, dia, mes, ano] = m;
  const iso = `${ano}-${mes}-${dia}`;
  const d = new Date(`${iso}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== iso)
    throw new Error(`Data inválida: ${valor}`);
  return iso;
}

/**
 * Reads the SIGE exports (propostas, contratos, reservas) into one record per document.
 * Contracts and reservations appearing in several files are merged by authorization number;
 * a contract takes the company from the single proposta with the same authorization.
 */
export function prepararHistoricoSige(
  arquivos: { name: string; content: string }[],
): HistoricoSige[] {
  const registros = new Map<string, HistoricoSige>();
  for (const arquivo of arquivos) {
    const { headers, rows } = parseCsv(arquivo.content);
    const proposta = headers.includes("Orc.");
    const contrato = headers.includes("Contrato");
    const obrigatorias = proposta
      ? ["#", "Orc.", "Empresa", "Cliente", "Data", "Total", "Status", "Autorização"]
      : ["#", "Autorização", "Fantasia", "Data", "Valor", "Status"];
    if (obrigatorias.some((c) => !headers.includes(c)))
      throw new Error(`${arquivo.name}: colunas incompatíveis com o histórico comercial SIGE.`);
    for (const [index, raw] of rows.entries()) {
      const numero = texto(proposta ? raw["Orc."] : raw["Autorização"]);
      const cliente = texto(proposta ? raw["Cliente"] : raw["Fantasia"]);
      const status = texto(raw["Status"]);
      if (!numero || !/^\d+$/.test(numero) || !cliente || !status)
        throw new Error(
          `${arquivo.name}, linha ${index + 2}: número, cliente ou situação inválidos.`,
        );
      const chave = `${proposta ? "proposta" : "autorizacao"}:${numero}`;
      const linha: HistoricoSige = {
        chave_sige: chave,
        tipo: proposta ? "proposta" : status === "RESERVA" ? "reserva" : "contrato",
        numero_sige: numero,
        autorizacao_sige: proposta ? texto(raw["Autorização"]) : numero,
        contrato_sige: contrato ? texto(raw["Contrato"]) : null,
        proposta_numero_sige: null,
        cliente_nome: cliente,
        empresa_nome: proposta ? texto(raw["Empresa"]) : null,
        empresa_origem: proposta ? "arquivo" : null,
        data_documento: dataSige(raw["Data"] ?? ""),
        valor: moedaSige((proposta ? raw["Total"] : raw["Valor"]) ?? ""),
        valor_liquido: contrato ? moedaSige(raw["Valor líquido"] ?? "") : null,
        vendedor: texto(raw["Vendedor"]),
        status_sige: status,
        tipo_servico: proposta ? texto(raw["Tipo"]) : null,
        fontes: [arquivo.name],
        dados_sige: { [arquivo.name]: raw },
      };
      const atual = registros.get(chave);
      if (!atual) {
        registros.set(chave, linha);
        continue;
      }
      if (
        atual.cliente_nome !== linha.cliente_nome ||
        atual.data_documento !== linha.data_documento ||
        atual.valor !== linha.valor
      )
        throw new Error(`Autorização ${numero}: dados conflitantes entre arquivos.`);
      // The contract export has the richer fields, whatever the upload order.
      const preferido = contrato ? linha : atual;
      registros.set(chave, {
        ...preferido,
        fontes: [...new Set([...atual.fontes, arquivo.name])],
        dados_sige: { ...atual.dados_sige, ...linha.dados_sige },
      });
    }
  }
  const linhas = [...registros.values()];
  for (const r of linhas.filter((l) => l.tipo !== "proposta")) {
    const propostas = linhas.filter(
      (p) => p.tipo === "proposta" && p.autorizacao_sige === r.numero_sige,
    );
    const p = propostas.length === 1 ? propostas[0] : undefined;
    if (p) {
      r.proposta_numero_sige = p.numero_sige;
      r.empresa_nome = p.empresa_nome;
      r.empresa_origem = "proposta";
    }
  }
  return linhas;
}

/** Latest date the PCP set in "Solicitar prazo" (the liberação's data de entrega), or null. */
export function ultimoPrazo(prazos: { status: string; prazo: string | null }[]): string | null {
  return prazos.filter((p) => p.status === "respondido" && p.prazo).at(-1)?.prazo ?? null;
}
