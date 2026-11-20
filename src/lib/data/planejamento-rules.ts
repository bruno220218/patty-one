/**
 * Planejamento (cronograma): periods, days and conflicts. Pure functions, tested in
 * planejamento-rules.test.ts. Dates are "YYYY-MM-DD" strings, handled in UTC.
 */

export const TIPOS_AGENDAMENTO = ["Agendamento", "Reserva de urgência", "Urgência"] as const;
export type TipoAgendamento = (typeof TIPOS_AGENDAMENTO)[number];
export type VisaoPlanejamento = "diario" | "semanal" | "mensal";
export type Periodo = { inicio: string; fim: string };

export function hojeISO(agora = new Date()): string {
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

const dataUTC = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function adicionarDias(iso: string, quantidade: number): string {
  const data = dataUTC(iso);
  data.setUTCDate(data.getUTCDate() + quantidade);
  return data.toISOString().slice(0, 10);
}

export function adicionarMeses(iso: string, quantidade: number): string {
  const ano = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  return new Date(Date.UTC(ano, mes - 1 + quantidade, 1)).toISOString().slice(0, 10);
}

/** Monday of the week. */
export function inicioDaSemana(iso: string): string {
  const dia = dataUTC(iso).getUTCDay();
  return adicionarDias(iso, -((dia + 6) % 7));
}

/** Day: that day. Week: Monday–Sunday. Month: 6 full weeks starting on the Monday before the 1st. */
export function periodoDaVisao(anchor: string, visao: VisaoPlanejamento): Periodo {
  if (visao === "diario") return { inicio: anchor, fim: anchor };
  if (visao === "semanal") {
    const inicio = inicioDaSemana(anchor);
    return { inicio, fim: adicionarDias(inicio, 6) };
  }
  const inicio = inicioDaSemana(`${anchor.slice(0, 7)}-01`);
  return { inicio, fim: adicionarDias(inicio, 41) };
}

export function diasDoPeriodo(periodo: Periodo): string[] {
  const dias: string[] = [];
  let atual = periodo.inicio;
  while (atual <= periodo.fim) {
    dias.push(atual);
    atual = adicionarDias(atual, 1);
  }
  return dias;
}

export type IntervaloAgendamento = {
  dataInicio: string;
  dataFim: string;
  horaInicio?: string | null;
  horaFim?: string | null;
};

/** Same days and, when both have times, overlapping hours. */
export function periodosSeSobrepoem(a: IntervaloAgendamento, b: IntervaloAgendamento): boolean {
  if (a.dataInicio > b.dataFim || a.dataFim < b.dataInicio) return false;
  if (!a.horaInicio || !a.horaFim || !b.horaInicio || !b.horaFim) return true;
  return a.horaInicio < b.horaFim && a.horaFim > b.horaInicio;
}

/** An urgency may use an urgency reservation; everything else conflicts. */
export function tiposTemConflito(novo: TipoAgendamento, existente: TipoAgendamento): boolean {
  return !(novo === "Urgência" && existente === "Reserva de urgência");
}

export function agendamentosTemConflito(
  novo: IntervaloAgendamento & { tipo: TipoAgendamento },
  existente: IntervaloAgendamento & { tipo: TipoAgendamento },
): boolean {
  return periodosSeSobrepoem(novo, existente) && tiposTemConflito(novo.tipo, existente.tipo);
}

export function eventoNoDia(evento: { dataInicio: string; dataFim: string }, dia: string): boolean {
  return evento.dataInicio <= dia && evento.dataFim >= dia;
}

export function validarAgendamento(dados: {
  titulo: string;
  dataInicio: string;
  dataFim: string;
  horaInicio: string;
  horaFim: string;
  veiculoId: string;
  equipe: string[];
  equipeId: string;
}): string | null {
  if (!dados.titulo.trim()) return "Informe o título do agendamento.";
  if (!dados.dataInicio || !dados.dataFim) return "Informe o período do agendamento.";
  if (dados.dataFim < dados.dataInicio)
    return "A data final deve ser igual ou posterior à inicial.";
  if (!dados.horaInicio !== !dados.horaFim) {
    return "Preencha o horário inicial e final, ou deixe ambos vazios.";
  }
  if (dados.horaInicio && dados.horaFim <= dados.horaInicio) {
    return "O horário final deve ser posterior ao inicial.";
  }
  if (!dados.veiculoId && !dados.equipe.length && !dados.equipeId) {
    return "Selecione pelo menos um colaborador ou um veículo.";
  }
  return null;
}

export function horarioCurto(hora?: string | null): string {
  return hora ? hora.slice(0, 5) : "";
}

export function tituloDoPeriodo(anchor: string, visao: VisaoPlanejamento): string {
  if (visao === "diario") {
    return dataUTC(anchor).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  if (visao === "semanal") {
    const periodo = periodoDaVisao(anchor, visao);
    const inicio = dataUTC(periodo.inicio);
    const fim = dataUTC(periodo.fim);
    const mesmoMes = inicio.getUTCMonth() === fim.getUTCMonth();
    const primeiro = inicio.toLocaleDateString("pt-BR", {
      day: "2-digit",
      ...(mesmoMes ? {} : { month: "short" }),
      timeZone: "UTC",
    });
    const ultimo = fim.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return `${primeiro} – ${ultimo}`;
  }
  const titulo = dataUTC(`${anchor.slice(0, 7)}-01`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return titulo.charAt(0).toUpperCase() + titulo.slice(1);
}

export const DIAS_SEMANA_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
