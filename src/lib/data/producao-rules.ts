/**
 * Operação (setor Produção): ordens de produção, prazos, equipes de planejamento, veículos
 * e nomes. Pure functions, tested in producao-rules.test.ts.
 */
import type { CurrentUser } from "./types";

// ---------- Permissões (o banco confere de novo) ----------

/** Gestão and PCP create and edit orders, schedule, programming and the operação records. */
export function canGerirOperacao(user: CurrentUser | null | undefined): boolean {
  return Boolean(user && user.funcoes.some((f) => f === "gestor" || f === "pcp"));
}

/** Gestão, PCP, Produção and Montagem tick order steps and change a service's situation. */
export function canExecutarOperacao(user: CurrentUser | null | undefined): boolean {
  return Boolean(
    user && user.funcoes.some((f) => ["gestor", "pcp", "producao", "montagem"].includes(f)),
  );
}

// ---------- Ordens de produção ----------

export const TIPOS_ORDEM = ["Instalação", "Impressão"] as const;
export const STATUS_ORDEM = ["Aguardando", "Em andamento", "Concluída", "Cancelada"] as const;
export const PRIORIDADES_ORDEM = ["Baixa", "Normal", "Alta", "Urgente"] as const;

export type TipoOrdem = (typeof TIPOS_ORDEM)[number];
export type StatusOrdem = (typeof STATUS_ORDEM)[number];
export type PrioridadeOrdem = (typeof PRIORIDADES_ORDEM)[number];

export const ETAPAS_PADRAO: Record<TipoOrdem, string[]> = {
  Instalação: ["Preparação", "Logística", "Instalação", "Conferência"],
  Impressão: ["Arte e preparação", "Impressão", "Acabamento", "Conferência"],
};

/** The service's own steps (from SIGE), or the default flow of the order type. */
export function etapasDaOrdem(tipo: TipoOrdem, etapasServico?: unknown): string[] {
  const lista = Array.isArray(etapasServico)
    ? etapasServico.filter((e): e is string => typeof e === "string")
    : [];
  const limpas = lista.map((e) => e.trim()).filter(Boolean);
  return limpas.length ? limpas : ETAPAS_PADRAO[tipo];
}

export function progressoOrdem(etapas: { concluido: boolean }[]): number {
  if (!etapas.length) return 0;
  return Math.round((etapas.filter((e) => e.concluido).length / etapas.length) * 100);
}

export function podeConcluirOrdem(etapas: { concluido: boolean }[]): boolean {
  return etapas.length > 0 && etapas.every((e) => e.concluido);
}

// ---------- Tempo das etapas (adaptativo) ----------

/** Marked by PCP on the order; samples are only compared within the same level. */
export const COMPLEXIDADES = ["Simples", "Média", "Complexa"] as const;
export type Complexidade = (typeof COMPLEXIDADES)[number];

/** A stretch longer than this was most likely left running by mistake: not learned from. */
export const LIMITE_TRECHO_HORAS = 12;
/** Fewer samples than this in a group: try a broader group first. */
export const MIN_AMOSTRAS = 3;
/** Only the latest samples count, so the estimate follows how the team works now. */
export const JANELA_AMOSTRAS = 20;

export interface AmostraTempo {
  servicoId: string | null;
  etapa: string;
  complexidade: Complexidade;
  concluidoEm: string | null;
  /** Person-hours: sum of (end - start) x people. */
  horas: number;
  maiorTrechoHoras: number;
}

export type BaseEstimativa = "servico_complexidade" | "etapa_complexidade" | "servico" | "etapa";

export interface EstimativaEtapa {
  horas: number;
  amostras: number;
  base: BaseEstimativa;
}

export const TEXTO_BASE_ESTIMATIVA: Record<BaseEstimativa, string> = {
  servico_complexidade: "mesmo serviço e complexidade",
  etapa_complexidade: "mesma etapa e complexidade, outros serviços",
  servico: "mesmo serviço, outras complexidades",
  etapa: "mesma etapa, qualquer serviço",
};

/** "Corte e Dobra  ACM" and "corte e dobra acm" are the same step. */
export function normalizarEtapa(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return 0;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
}

/** Samples that can be learned from (closed, positive, no stretch left running by mistake). */
export function amostrasValidas(amostras: AmostraTempo[]): AmostraTempo[] {
  return amostras.filter((a) => a.horas > 0 && a.maiorTrechoHoras <= LIMITE_TRECHO_HORAS);
}

/**
 * Hours a step should take, learned from finished steps: the median of the latest samples
 * of the most specific group that has enough of them (same service + step + complexity,
 * then same step + complexity, then same service + step, then the step anywhere). With too
 * few samples everywhere, the most specific group that has any is used. null = no history.
 */
export function estimarHorasEtapa(
  alvo: { servicoId: string | null; etapa: string; complexidade: Complexidade },
  amostras: AmostraTempo[],
): EstimativaEtapa | null {
  const etapa = normalizarEtapa(alvo.etapa);
  const mesmas = amostrasValidas(amostras)
    .filter((a) => normalizarEtapa(a.etapa) === etapa)
    .sort((a, b) => (b.concluidoEm ?? "").localeCompare(a.concluidoEm ?? ""));
  const grupos: [BaseEstimativa, AmostraTempo[]][] = [
    [
      "servico_complexidade",
      alvo.servicoId
        ? mesmas.filter(
            (a) => a.servicoId === alvo.servicoId && a.complexidade === alvo.complexidade,
          )
        : [],
    ],
    ["etapa_complexidade", mesmas.filter((a) => a.complexidade === alvo.complexidade)],
    ["servico", alvo.servicoId ? mesmas.filter((a) => a.servicoId === alvo.servicoId) : []],
    ["etapa", mesmas],
  ];
  const escolhido =
    grupos.find(([, g]) => g.length >= MIN_AMOSTRAS) ?? grupos.find(([, g]) => g.length > 0);
  if (!escolhido) return null;
  const [base, grupo] = escolhido;
  const recentes = grupo.slice(0, JANELA_AMOSTRAS);
  return {
    horas: Math.round(mediana(recentes.map((a) => a.horas)) * 100) / 100,
    amostras: recentes.length,
    base,
  };
}

export interface TrechoEtapa {
  inicio: string;
  fim: string | null;
  pessoas: number;
}

/** Person-hours spent so far; an open stretch counts up to `agora`. */
export function horasGastas(trechos: TrechoEtapa[], agora: Date): number {
  const total = trechos.reduce((soma, t) => {
    const fim = t.fim ? Date.parse(t.fim) : agora.getTime();
    const ms = Math.max(0, fim - Date.parse(t.inicio));
    return soma + (ms / 3_600_000) * t.pessoas;
  }, 0);
  return Math.round(total * 100) / 100;
}

export type SituacaoEtapa = "Pendente" | "Em andamento" | "Pausada" | "Concluída";

export function situacaoEtapa(etapa: {
  concluido: boolean;
  trechos: { fim: string | null }[];
}): SituacaoEtapa {
  if (etapa.concluido) return "Concluída";
  if (etapa.trechos.some((t) => !t.fim)) return "Em andamento";
  return etapa.trechos.length ? "Pausada" : "Pendente";
}

/**
 * Step progress for the PCP: 100 when finished; while open, the share of the estimate
 * already spent, held at 95% until the step is closed (only the baixa says it's done).
 */
export function progressoEtapa(
  concluido: boolean,
  gastas: number,
  estimativa: number | null,
): number | null {
  if (concluido) return 100;
  if (!estimativa || estimativa <= 0) return gastas > 0 ? null : 0;
  return Math.min(95, Math.round((gastas / estimativa) * 100));
}

/** "45 min", "3,5 h". */
export function textoHoras(horas: number): string {
  if (horas < 1) return `${Math.max(0, Math.round(horas * 60))} min`;
  return `${(Math.round(horas * 10) / 10).toLocaleString("pt-BR")} h`;
}

export const DIAS_ALERTA_PRAZO = 3;
export type AlertaPrazo = { tipo: "atrasada" | "proxima"; dias: number };

export function diasParaPrazo(dataPrevista: string, hoje: string): number {
  const prazo = Date.parse(`${dataPrevista}T00:00:00Z`);
  const referencia = Date.parse(`${hoje}T00:00:00Z`);
  return Math.round((prazo - referencia) / 86_400_000);
}

/** Active orders that are late or due within 3 days. */
export function alertaPrazo(
  dataPrevista: string | null,
  status: string,
  hoje: string,
): AlertaPrazo | null {
  if (!dataPrevista || status === "Concluída" || status === "Cancelada") return null;
  const dias = diasParaPrazo(dataPrevista, hoje);
  if (dias < 0) return { tipo: "atrasada", dias: Math.abs(dias) };
  if (dias <= DIAS_ALERTA_PRAZO) return { tipo: "proxima", dias };
  return null;
}

export function textoAlertaPrazo(alerta: AlertaPrazo): string {
  if (alerta.tipo === "atrasada") {
    return `Atrasada há ${alerta.dias} ${alerta.dias === 1 ? "dia" : "dias"}`;
  }
  if (alerta.dias === 0) return "Vence hoje";
  if (alerta.dias === 1) return "Vence amanhã";
  return `Vence em ${alerta.dias} dias`;
}

export function validarOrdem(dados: {
  tipo: TipoOrdem;
  descricao: string;
  localInstalacao: string;
  etapas: string[];
}): string | null {
  if (!dados.descricao.trim()) return "Informe a descrição da ordem.";
  if (dados.tipo === "Instalação" && !dados.localInstalacao.trim()) {
    return "Informe o local da instalação.";
  }
  if (!dados.etapas.length) return "A ordem precisa de pelo menos uma etapa.";
  return null;
}

// ---------- Equipes de planejamento ----------

export function capacidadeNumerica(valor: string): number {
  return Number(valor.replace(",", "."));
}

export function validarEquipe(dados: {
  nome: string;
  setor: string;
  capacidade: string;
  colaboradores: string[];
  veiculos: string[];
}): string | null {
  if (!dados.nome.trim()) return "Informe o nome da equipe.";
  if (!dados.setor.trim()) return "Informe o setor da equipe.";
  const capacidade = capacidadeNumerica(dados.capacidade);
  if (!Number.isFinite(capacidade) || capacidade <= 0) {
    return "A capacidade diária deve ser maior que zero.";
  }
  if (!dados.colaboradores.length && !dados.veiculos.length) {
    return "Selecione pelo menos um colaborador ou um veículo.";
  }
  return null;
}

// ---------- Veículos ----------

export function rotuloVeiculo(v: {
  placa: string;
  modelo?: string | null;
  apelido?: string | null;
}): string {
  const nome = v.apelido?.trim() || v.modelo?.trim();
  return [nome, v.placa].filter(Boolean).join(" — ");
}

export function normalizarPlaca(placa: string): string {
  return placa.trim().toLocaleUpperCase("pt-BR").replace(/\s+/g, "");
}

export function validarVeiculo(dados: {
  placa: string;
  modelo?: string;
  apelido?: string;
}): string | null {
  const placa = normalizarPlaca(dados.placa);
  if (!placa) return "Informe a placa do veículo.";
  if (placa.length > 10) return "A placa deve ter no máximo 10 caracteres.";
  if (dados.modelo && dados.modelo.length > 120)
    return "O modelo deve ter no máximo 120 caracteres.";
  if (dados.apelido && dados.apelido.length > 80)
    return "O apelido deve ter no máximo 80 caracteres.";
  return null;
}

// ---------- Nomes ----------

const PREPOSICOES = new Set(["da", "de", "do", "das", "dos", "e"]);

/** First and second name for display only (skips "da", "de"…); the stored name stays whole. */
export function abreviarNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 2) return partes.join(" ");
  const segundo = partes.slice(1).find((p) => !PREPOSICOES.has(p.toLocaleLowerCase("pt-BR")));
  return segundo ? `${partes[0]} ${segundo}` : (partes[0] ?? "");
}

/** "20/11/2026" from "2026-11-20" (or a full timestamp). */
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}
