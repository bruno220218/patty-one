import { projectProgress, projectStatus } from "./rules";

/** Inclusive date range as YYYY-MM-DD; null bounds mean "no limit" (todo o período). */
export interface ReportPeriod {
  from: string | null;
  to: string | null;
  label: string;
}

type ReportTask = { completedAt: string | null; completedBy: { name: string } | null };
type ReportProject = {
  id: string;
  name: string;
  dueDate: string | null;
  createdAt: string;
  archived: boolean;
  tasks: ReportTask[];
  clientInfo?: { serviceType?: string };
};

export interface DeliveredRow {
  name: string;
  serviceType: string;
  dueDate: string | null;
  deliveredOn: string;
  /** Days after the due date (0 or less = on time). Null when there was no due date. */
  daysLate: number | null;
}

export interface OpenRow {
  name: string;
  serviceType: string;
  dueDate: string | null;
  percent: number;
  done: number;
  total: number;
  overdue: boolean;
}

export interface Indicators {
  clients: { count: number; names: string[] };
  tasksByPerson: { name: string; count: number }[];
  tasksTotal: number;
  onTime: DeliveredRow[];
  late: DeliveredRow[];
  /** Delivered without a due date (can't be judged on time/late). */
  noDueDate: DeliveredRow[];
  open: OpenRow[];
}

/** Local calendar date (YYYY-MM-DD) of an ISO timestamp. */
export function localDateOf(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const inPeriod = (date: string, p: ReportPeriod) =>
  (p.from === null || date >= p.from) && (p.to === null || date <= p.to);

const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

/** Month period for "YYYY-MM". */
export function monthPeriod(month: string): ReportPeriod {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
    label: label.charAt(0).toUpperCase() + label.slice(1),
  };
}

export const ALL_TIME: ReportPeriod = { from: null, to: null, label: "Todo o período" };

/**
 * Indicators for the period, from active and archived projects:
 * - clients: distinct project names created in the period (each project is a client job);
 * - tasks completed in the period, per person (name kept even after removal);
 * - projects delivered in the period (all tasks done; delivery = last completion), split by
 *   on time (delivered on/before the due date), late, and without a due date;
 * - projects not finished yet (current status), created up to the end of the period.
 */
export function buildIndicators(
  projects: ReportProject[],
  period: ReportPeriod,
  today: string,
): Indicators {
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

  const clientNames = new Map<string, string>();
  for (const p of projects) {
    if (!inPeriod(localDateOf(p.createdAt), period)) continue;
    const key = p.name.trim().toLocaleLowerCase("pt-BR");
    if (!clientNames.has(key)) clientNames.set(key, p.name.trim());
  }

  const perPerson = new Map<string, number>();
  let tasksTotal = 0;
  for (const p of projects) {
    for (const t of p.tasks) {
      if (!t.completedAt || !inPeriod(localDateOf(t.completedAt), period)) continue;
      const name = t.completedBy?.name || "Alguém da equipe";
      perPerson.set(name, (perPerson.get(name) ?? 0) + 1);
      tasksTotal++;
    }
  }

  const onTime: DeliveredRow[] = [];
  const late: DeliveredRow[] = [];
  const noDueDate: DeliveredRow[] = [];
  const open: OpenRow[] = [];

  for (const p of projects) {
    const serviceType = p.clientInfo?.serviceType ?? "";
    if (projectStatus(p.tasks) === "done") {
      const deliveredOn = p.tasks
        .map((t) => localDateOf(t.completedAt as string))
        .reduce((a, b) => (a > b ? a : b));
      if (!inPeriod(deliveredOn, period)) continue;
      const daysLate = p.dueDate ? dayDiff(deliveredOn, p.dueDate) : null;
      const row = { name: p.name, serviceType, dueDate: p.dueDate, deliveredOn, daysLate };
      if (daysLate === null) noDueDate.push(row);
      else if (daysLate <= 0) onTime.push(row);
      else late.push(row);
    } else {
      if (period.to !== null && localDateOf(p.createdAt) > period.to) continue;
      const { done, total, percent } = projectProgress(p.tasks);
      open.push({
        name: p.name,
        serviceType,
        dueDate: p.dueDate,
        percent,
        done,
        total,
        overdue: p.dueDate !== null && p.dueDate < today,
      });
    }
  }

  const byDelivery = (a: DeliveredRow, b: DeliveredRow) =>
    a.deliveredOn.localeCompare(b.deliveredOn) || collator.compare(a.name, b.name);
  open.sort((a, b) => {
    if (a.dueDate === b.dueDate) return collator.compare(a.name, b.name);
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return {
    clients: {
      count: clientNames.size,
      names: [...clientNames.values()].sort(collator.compare),
    },
    tasksByPerson: [...perPerson.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name)),
    tasksTotal,
    onTime: onTime.sort(byDelivery),
    late: late.sort(byDelivery),
    noDueDate: noDueDate.sort(byDelivery),
    open,
  };
}

type ReportLiberacao = { id: string; numero: number; cliente: string; status: string };
type ReportEvento = { liberacaoId: string; tipo: string; createdAt: string };

export interface LiberacaoIndicators {
  criadas: number;
  aprovadas: number;
  /** Rejection events in the period (one liberação can be rejected more than once). */
  reprovacoes: number;
  /** Approved in the period without ever being rejected. */
  aprovadasDePrimeira: number;
  /** Average hours from entering the PCP queue to the decision, for decisions in the period. */
  horasMediasNaFila: number | null;
  /** Current situation (not limited to the period). */
  naFilaAgora: number;
  emEdicaoAgora: number;
  /** Most rejected liberações in the period. */
  maisReprovadas: { numero: number; cliente: string; vezes: number }[];
}

/**
 * Liberação indicators from the event history (criada, reenviada, reprovada, aprovada).
 * Time in queue = from the last criada/reenviada before a decision to that decision.
 */
export function buildLiberacaoIndicators(
  liberacoes: ReportLiberacao[],
  eventos: ReportEvento[],
  period: ReportPeriod,
): LiberacaoIndicators {
  const inP = (iso: string) => inPeriod(localDateOf(iso), period);
  const sorted = [...eventos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const byLib = new Map<string, ReportEvento[]>();
  for (const e of sorted) byLib.set(e.liberacaoId, [...(byLib.get(e.liberacaoId) ?? []), e]);

  let criadas = 0;
  let aprovadas = 0;
  let reprovacoes = 0;
  let aprovadasDePrimeira = 0;
  const esperas: number[] = [];
  const reprovadasPorLib = new Map<string, number>();

  for (const [libId, evs] of byLib) {
    let entrouNaFila: string | null = null;
    let jaReprovada = false;
    for (const e of evs) {
      if (e.tipo === "criada" || e.tipo === "reenviada") {
        entrouNaFila = e.createdAt;
        if (e.tipo === "criada" && inP(e.createdAt)) criadas++;
        continue;
      }
      const decisaoNoPeriodo = inP(e.createdAt);
      if (decisaoNoPeriodo && entrouNaFila) {
        esperas.push((Date.parse(e.createdAt) - Date.parse(entrouNaFila)) / 3_600_000);
      }
      if (e.tipo === "reprovada") {
        if (decisaoNoPeriodo) {
          reprovacoes++;
          reprovadasPorLib.set(libId, (reprovadasPorLib.get(libId) ?? 0) + 1);
        }
        jaReprovada = true;
      } else if (e.tipo === "aprovada" && decisaoNoPeriodo) {
        aprovadas++;
        if (!jaReprovada) aprovadasDePrimeira++;
      }
      entrouNaFila = null;
    }
  }

  const libById = new Map(liberacoes.map((l) => [l.id, l]));
  const maisReprovadas = [...reprovadasPorLib.entries()]
    .map(([id, vezes]) => ({
      numero: libById.get(id)?.numero ?? 0,
      cliente: libById.get(id)?.cliente ?? "—",
      vezes,
    }))
    .sort((a, b) => b.vezes - a.vezes || a.numero - b.numero)
    .slice(0, 5);

  return {
    criadas,
    aprovadas,
    reprovacoes,
    aprovadasDePrimeira,
    horasMediasNaFila: esperas.length ? esperas.reduce((a, b) => a + b, 0) / esperas.length : null,
    naFilaAgora: liberacoes.filter((l) => l.status === "aguardando").length,
    emEdicaoAgora: liberacoes.filter((l) => l.status === "reprovada").length,
    maisReprovadas,
  };
}

/** "3 h", "1 dia e 4 h", "—". */
export function formatHoras(horas: number | null): string {
  if (horas === null) return "—";
  const total = Math.round(horas);
  if (total < 24) return `${Math.max(total, horas > 0 ? 1 : 0)} h`;
  const dias = Math.floor(total / 24);
  const resto = total % 24;
  const d = `${dias} ${dias === 1 ? "dia" : "dias"}`;
  return resto ? `${d} e ${resto} h` : d;
}

type ReportBriefing = {
  destino: "criacao" | "projetos_especiais";
  status: "novo" | "em_andamento" | "concluido";
  createdAt: string;
  concluidoEm: string | null;
  responsavelNome: string;
};

export interface BriefingIndicators {
  criados: number;
  concluidos: number;
  /** Average hours from creation to conclusion, for briefings concluded in the period. */
  horasMediasAteConcluir: number | null;
  /** Current situation (not limited to the period). */
  novosAgora: number;
  emAndamentoAgora: number;
  /** Concluded in the period, per person. */
  porResponsavel: { name: string; count: number }[];
}

/** Briefing indicators, separately for Criação and Projetos especiais. */
export function buildBriefingIndicators(
  briefings: ReportBriefing[],
  period: ReportPeriod,
): Record<ReportBriefing["destino"], BriefingIndicators> {
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  const calc = (lista: ReportBriefing[]): BriefingIndicators => {
    const concluidos = lista.filter(
      (b) => b.concluidoEm && inPeriod(localDateOf(b.concluidoEm), period),
    );
    const horas = concluidos.map(
      (b) => (Date.parse(b.concluidoEm as string) - Date.parse(b.createdAt)) / 3_600_000,
    );
    const porPessoa = new Map<string, number>();
    for (const b of concluidos) {
      const n = b.responsavelNome || "Sem responsável";
      porPessoa.set(n, (porPessoa.get(n) ?? 0) + 1);
    }
    return {
      criados: lista.filter((b) => inPeriod(localDateOf(b.createdAt), period)).length,
      concluidos: concluidos.length,
      horasMediasAteConcluir: horas.length ? horas.reduce((a, b) => a + b, 0) / horas.length : null,
      novosAgora: lista.filter((b) => b.status === "novo").length,
      emAndamentoAgora: lista.filter((b) => b.status === "em_andamento").length,
      porResponsavel: [...porPessoa.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name)),
    };
  };
  return {
    criacao: calc(briefings.filter((b) => b.destino === "criacao")),
    projetos_especiais: calc(briefings.filter((b) => b.destino === "projetos_especiais")),
  };
}
