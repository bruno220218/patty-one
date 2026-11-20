/**
 * Financeiro: situation of a receivable, monthly cost of rent contracts and the totals at the top
 * of the page. Pure functions, tested in financeiro-rules.test.ts. Dates are "YYYY-MM-DD".
 */
import type { CurrentUser } from "./types";

export const STATUS_CONTA = ["Aberto", "Recebido", "Cancelado"] as const;
export type StatusConta = (typeof STATUS_CONTA)[number];
/** What the screen shows: an open receivable is "A vencer" or "Vencido". */
export const SITUACOES_CONTA = ["A vencer", "Vencido", "Recebido", "Cancelado"] as const;
export type SituacaoConta = (typeof SITUACOES_CONTA)[number];

export const PERIODICIDADES = [
  "Mensal",
  "Bimestral",
  "Trimestral",
  "Semestral",
  "Anual",
  "Sem recorrência",
] as const;
export type Periodicidade = (typeof PERIODICIDADES)[number];
const MESES: Record<Periodicidade, number> = {
  Mensal: 1,
  Bimestral: 2,
  Trimestral: 3,
  Semestral: 6,
  Anual: 12,
  "Sem recorrência": 0,
};

/** Gestão, Direção and Financeiro see and edit (database rule: can_financeiro). */
export function canFinanceiro(user: CurrentUser | null | undefined): boolean {
  return Boolean(
    user && user.funcoes.some((f) => f === "gestor" || f === "direcao" || f === "financeiro"),
  );
}
/** Only Gestão and Direção delete (database rule: can_excluir_financeiro). */
export function canExcluirFinanceiro(user: CurrentUser | null | undefined): boolean {
  return Boolean(user && user.funcoes.some((f) => f === "gestor" || f === "direcao"));
}

export function situacaoConta(
  status: StatusConta,
  vencimento: string,
  hoje: string,
): SituacaoConta {
  if (status !== "Aberto") return status;
  return vencimento < hoje ? "Vencido" : "A vencer";
}

/** Monthly equivalent; contracts without recurrence don't count toward the monthly cost. */
export function aluguelMensal(valor: number, periodicidade: Periodicidade): number {
  const m = MESES[periodicidade];
  return m ? valor / m : 0;
}

export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

type ContaResumo = { status: StatusConta; vencimento: string; valor: number };
type AluguelResumo = {
  ativo: boolean;
  valor: number;
  periodicidade: Periodicidade;
  vencimento: string | null;
};

export function resumoFinanceiro(contas: ContaResumo[], alugueis: AluguelResumo[], hoje: string) {
  const em30 = somarDias(hoje, 30);
  let aVencer = 0;
  let vencido = 0;
  for (const c of contas) {
    const s = situacaoConta(c.status, c.vencimento, hoje);
    if (s === "A vencer") aVencer += c.valor;
    if (s === "Vencido") vencido += c.valor;
  }
  const ativos = alugueis.filter((a) => a.ativo);
  return {
    aVencer,
    vencido,
    aluguelMes: ativos.reduce((s, a) => s + aluguelMensal(a.valor, a.periodicidade), 0),
    alugueisVencendo: ativos.filter(
      (a) => a.vencimento && a.vencimento >= hoje && a.vencimento <= em30,
    ).length,
  };
}

/** "062, 1040,007" → ["062", "1040", "007"]: codes of the media points in a rent contract. */
export function codigosMidias(midias: string): string[] {
  return [
    ...new Set(
      midias
        .split(/[,;\n]/)
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  ];
}

export type ContaForm = {
  descricao: string;
  vencimento: string;
  valor: string;
  cadastroId: string;
  cadastroNome: string;
  empresaId: string;
  observacao: string;
};
export type AluguelForm = {
  contrato: string;
  proprietario: string;
  midias: string;
  periodicidade: Periodicidade;
  vigencia: string;
  vencimento: string;
  valor: string;
  ativo: boolean;
  validado: boolean;
  observacao: string;
};
export type EnergiaForm = {
  numCliente: string;
  numInstalacao: string;
  unidade: string;
  dataInicio: string;
  titular: string;
  local: string;
  ativo: boolean;
  observacao: string;
};

/** First problem with the form, or null. `valor` is already parsed. */
export function validarConta(f: ContaForm, valor: number): string | null {
  if (!f.descricao.trim()) return "Informe a descrição.";
  if (!f.vencimento) return "Informe o vencimento.";
  if (!(valor > 0)) return "Informe um valor maior que zero.";
  return null;
}
export function validarAluguel(f: AluguelForm, valor: number): string | null {
  if (!f.proprietario.trim()) return "Informe o proprietário.";
  if (valor < 0) return "O valor não pode ser negativo.";
  if (f.vigencia && f.vencimento && f.vencimento > f.vigencia)
    return "O próximo vencimento passa da vigência do contrato.";
  return null;
}
export function validarEnergia(f: EnergiaForm): string | null {
  if (!f.numCliente.trim() && !f.numInstalacao.trim() && !f.local.trim())
    return "Informe o nº do cliente, a instalação ou o local.";
  return null;
}
