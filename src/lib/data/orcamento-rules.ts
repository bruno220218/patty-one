/**
 * Orçamento de Projetos Especiais (migration 0050): the cost composition of a proposta/pedido item
 * and the prices that come out of it, following the Patty spreadsheet ("modelo orçamento"):
 * materiais por seção + serviços + mão de obra (R$/h × horas) + deslocamento (R$/km × km) = custo;
 * preço = custo ÷ fator (venda, com desconto, sem nota); entrada = % do preço de venda.
 * Pure functions, tested in orcamento-rules.test.ts.
 */

export const SECOES_ORCAMENTO = [
  "Painel",
  "Estrutura",
  "Letreiro",
  "Pintura",
  "Iluminação",
  "Outros",
] as const;
export type SecaoOrcamento = (typeof SECOES_ORCAMENTO)[number];

export const GRUPOS_CUSTO = ["Mão de obra", "Deslocamento", "Serviço"] as const;
export type GrupoCusto = (typeof GRUPOS_CUSTO)[number];

export interface OrcamentoConfig {
  fatorVenda: number;
  fatorDesconto: number;
  fatorSemNota: number;
  entradaPct: number;
}

/** Values of the spreadsheet; used until the database answers (or when 0050 isn't applied). */
export const CONFIG_PADRAO: OrcamentoConfig = {
  fatorVenda: 0.55,
  fatorDesconto: 0.59,
  fatorSemNota: 0.62,
  entradaPct: 50,
};

type WithFuncoes = { funcoes: readonly string[] } | null | undefined;
const tem = (user: WithFuncoes, ...funcoes: string[]) =>
  Boolean(user && user.funcoes.some((f) => funcoes.includes(f)));

/** Who changes the factors and the cost catalog (database: RLS of orcamento_config/custos). */
export const canEditarCustosOrcamento = (user: WithFuncoes) => tem(user, "gestor", "direcao");

/** Section shown for a stored value ('' or unknown → "Outros"). */
export const secaoDe = (s: string | null | undefined): SecaoOrcamento =>
  (SECOES_ORCAMENTO as readonly string[]).includes(s ?? "") ? (s as SecaoOrcamento) : "Outros";

export interface LinhaCusto {
  quantidade: number;
  valorUnitario: number | null;
}
export interface LinhaMaterialCusto extends LinhaCusto {
  secao: string;
}
export interface LinhaOutroCusto extends LinhaCusto {
  secao: string;
  grupo: GrupoCusto | null;
}

export interface Composicao {
  porSecao: Record<SecaoOrcamento, number>;
  materiais: number;
  servicos: number;
  maoDeObra: number;
  deslocamento: number;
  custo: number;
  venda: number;
  desconto: number;
  semNota: number;
  entrada: number;
}

const total = (l: LinhaCusto) => l.quantidade * (l.valorUnitario ?? 0);
const div = (a: number, b: number) => (b > 0 ? a / b : 0);
const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Totals of an item's composition. Materials and services (lines without grupo or grupo
 * "Serviço") add to their section; mão de obra and deslocamento are separate totals.
 */
export function calcularComposicao(
  materiais: LinhaMaterialCusto[],
  outros: LinhaOutroCusto[],
  config: OrcamentoConfig,
): Composicao {
  const porSecao = Object.fromEntries(SECOES_ORCAMENTO.map((s) => [s, 0])) as Record<
    SecaoOrcamento,
    number
  >;
  let mat = 0,
    serv = 0,
    mod = 0,
    desl = 0;
  for (const m of materiais) {
    const t = total(m);
    mat += t;
    porSecao[secaoDe(m.secao)] += t;
  }
  for (const o of outros) {
    const t = total(o);
    if (o.grupo === "Mão de obra") mod += t;
    else if (o.grupo === "Deslocamento") desl += t;
    else {
      serv += t;
      porSecao[secaoDe(o.secao)] += t;
    }
  }
  const custo = mat + serv + mod + desl;
  const venda = div(custo, config.fatorVenda);
  return {
    porSecao: Object.fromEntries(
      Object.entries(porSecao).map(([k, v]) => [k, centavos(v)]),
    ) as Record<SecaoOrcamento, number>,
    materiais: centavos(mat),
    servicos: centavos(serv),
    maoDeObra: centavos(mod),
    deslocamento: centavos(desl),
    custo: centavos(custo),
    venda: centavos(venda),
    desconto: centavos(div(custo, config.fatorDesconto)),
    semNota: centavos(div(custo, config.fatorSemNota)),
    entrada: centavos((venda * config.entradaPct) / 100),
  };
}

// ---------- Fluxo do orçamento (migration 0051) ----------
/** Briefing → Projetos (em_orcamento) → Gestão (aguardando_aprovacao) → fechado (aprovado) → Comercial. */
export type SituacaoOrcamento = "em_orcamento" | "aguardando_aprovacao" | "devolvido" | "aprovado";

export const NOME_SITUACAO_ORCAMENTO: Record<SituacaoOrcamento, string> = {
  em_orcamento: "Com Projetos",
  devolvido: "Devolvido para Projetos revisar",
  aguardando_aprovacao: "Aguardando a Gestão",
  aprovado: "Fechado pela Gestão",
};

/** Step of the flowchart where the proposta is (0 Projetos, 1 Gestão, 2 Comercial/cliente). */
export const etapaDoOrcamento = (s: SituacaoOrcamento) =>
  s === "aguardando_aprovacao" ? 1 : s === "aprovado" ? 2 : 0;

/** Projetos (and Gestão) send the orçamento to the Gestão. */
export const canEnviarOrcamento = (user: WithFuncoes) =>
  tem(user, "gestor", "direcao", "projetos_especiais");

/** Only Gestão/Direção close (approve price and margin) or return the orçamento. */
export const canDecidirOrcamento = (user: WithFuncoes) => tem(user, "gestor", "direcao");

/** Items, values and composition are locked while the Gestão decides and after it closes. */
export const orcamentoTravado = (s: SituacaoOrcamento | null | undefined) =>
  s === "aguardando_aprovacao" || s === "aprovado";

/**
 * Who edits the proposta's items (database: pode_editar_venda): Comercial/Gestão always,
 * Projetos Especiais while the orçamento is with them.
 */
export const podeEditarItensVenda = (
  user: WithFuncoes,
  podeVender: boolean,
  tipo: string,
  s: SituacaoOrcamento | null | undefined,
) =>
  podeVender ||
  (tem(user, "projetos_especiais") &&
    tipo === "proposta" &&
    (s === "em_orcamento" || s === "devolvido"));

/** Margin over the sale value: (valor − custo) ÷ valor, in %. Null without a value. */
export const margemPct = (custo: number, valor: number) =>
  valor > 0 ? Math.round(((valor - custo) / valor) * 1000) / 10 : null;
