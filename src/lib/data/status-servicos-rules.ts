/**
 * Status Serviços (fluxo de produção, etapa 8): where each job is, read from the production
 * orders (and from the old projects until they finish). Pure functions, tested in
 * status-servicos-rules.test.ts.
 */

export type ColunaServico = "aguardando" | "producao" | "fechamento" | "concluido";

export const COLUNAS_SERVICO: { id: ColunaServico; titulo: string }[] = [
  { id: "aguardando", titulo: "Aguardando" },
  { id: "producao", titulo: "Em produção" },
  { id: "fechamento", titulo: "Conferência e cliente" },
  { id: "concluido", titulo: "Concluídos (30 dias)" },
];

/** Days a finished order stays on the board. */
export const DIAS_CONCLUIDOS_VISIVEIS = 30;

/** Column of an order by its status; cancelled orders are not shown. */
export function colunaDaOrdem(status: string): ColunaServico | null {
  switch (status) {
    case "Aguardando liberação":
    case "Aguardando":
      return "aguardando";
    case "Em andamento":
      return "producao";
    case "Aguardando conferência":
    case "Aguardando cliente":
      return "fechamento";
    case "Concluída":
      return "concluido";
    default:
      return null;
  }
}

/** Old projects (before the orders) show until they finish. */
export function colunaDoProjeto(
  status: "not_started" | "in_progress" | "done",
): ColunaServico | null {
  if (status === "not_started") return "aguardando";
  if (status === "in_progress") return "producao";
  return null;
}

/** First open step, in order; null when there are none open. */
export function etapaAtualDaOrdem(
  etapas: { ordem: number; nome: string; concluido: boolean }[],
): string | null {
  return [...etapas].sort((a, b) => a.ordem - b.ordem).find((e) => !e.concluido)?.nome ?? null;
}

/** What the client-facing team should read about the order's situation. */
export function situacaoDaOrdem(status: string, etapa: string | null, totalEtapas: number): string {
  switch (status) {
    case "Aguardando liberação":
      return "Esperando o PCP aprovar a liberação";
    case "Aguardando conferência":
      return "Pronta: esperando a conferência do PCP";
    case "Aguardando cliente":
      return "Conferida: falta registrar a confirmação do cliente";
    case "Concluída":
      return "Concluída";
    default:
      if (!totalEtapas) return "PCP ainda não montou as etapas";
      return etapa ? `Etapa atual: ${etapa}` : "Todas as etapas concluídas";
  }
}

export type DataProgramada = { data: string; status: string; equipe: string };

const ABERTOS = ["Programado", "Em andamento", "Aguardando equipe"];

/**
 * The order's date in Programação: the next open one from today, or else the latest one.
 * Null when it was never scheduled.
 */
export function programacaoDaOrdem(
  servicos: DataProgramada[],
  hoje: string,
): (DataProgramada & { proxima: boolean }) | null {
  const ordenados = [...servicos].sort((a, b) => a.data.localeCompare(b.data));
  const proxima = ordenados.find((s) => s.data >= hoje && ABERTOS.includes(s.status));
  if (proxima) return { ...proxima, proxima: true };
  const ultima = ordenados.at(-1);
  return ultima ? { ...ultima, proxima: false } : null;
}
