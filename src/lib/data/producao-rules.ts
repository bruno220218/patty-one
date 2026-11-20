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
