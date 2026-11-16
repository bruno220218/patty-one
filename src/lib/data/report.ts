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
