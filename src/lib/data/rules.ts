import type { MoveDirection, ProjectClientInfo, ProjectStatus } from "./types";

type TaskLike = { completedAt: string | null };

export function projectProgress(tasks: TaskLike[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completedAt !== null).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, percent };
}

export function projectStatus(tasks: TaskLike[]): ProjectStatus {
  const { total, done } = projectProgress(tasks);
  if (total === 0 || done === 0) return "not_started";
  if (done === total) return "done";
  return "in_progress";
}

/** Returns a new array with the item at `index` moved one step. Out-of-range moves are no-ops. */
export function moveItem<T>(items: T[], index: number, direction: MoveDirection): T[] {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  const item = next[index] as T;
  next[index] = next[target] as T;
  next[target] = item;
  return next;
}

export function requireText(value: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

/** A completed task can only be unchecked by someone with management permission. */
export function canToggleTask(task: TaskLike, isGestor: boolean): boolean {
  return task.completedAt === null || isGestor;
}

export const EMPTY_CLIENT_INFO: ProjectClientInfo = {
  serviceType: "",
  ledColor: "",
  paintColors: "",
  adhesiveType: "",
  lamination: null,
};

/** Trims text fields so blanks are stored as empty strings. */
export function normalizeClientInfo(info: ProjectClientInfo): ProjectClientInfo {
  return {
    serviceType: info.serviceType.trim(),
    ledColor: info.ledColor.trim(),
    paintColors: info.paintColors.trim(),
    adhesiveType: info.adhesiveType.trim(),
    lamination: info.lamination,
  };
}

export type TeamRole = "pendente" | "gestor" | "membro";

type TeamLike = { name: string; isMember: boolean; isGestor: boolean };

/** Role shown in Equipe: people awaiting approval first (they need action), then gestores, then membros. */
export function teamRole(person: Omit<TeamLike, "name">): TeamRole {
  if (!person.isMember) return "pendente";
  return person.isGestor ? "gestor" : "membro";
}

const TEAM_ROLE_ORDER: TeamRole[] = ["pendente", "gestor", "membro"];

/** Groups people by role (in display order), each group sorted alphabetically (pt-BR, accent/case-insensitive). Empty groups are omitted. */
export function groupTeamByRole<T extends TeamLike>(
  people: T[],
): { role: TeamRole; people: T[] }[] {
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  return TEAM_ROLE_ORDER.map((role) => ({
    role,
    people: people
      .filter((p) => teamRole(p) === role)
      .sort((a, b) => collator.compare(a.name.trim(), b.name.trim())),
  })).filter((g) => g.people.length > 0);
}

export type DueFilter = "todos" | "atrasados" | "7dias" | "30dias" | "sem_prazo";
export type ProgressFilter = "todos" | "0-25" | "25-50" | "50-75" | "75-99" | "100";
export type ProjectSort =
  "prazo_asc" | "prazo_desc" | "nome_asc" | "nome_desc" | "producao_asc" | "producao_desc";

export interface ProjectFilters {
  query: string;
  /** Text of an open (not completed) task the project must have, e.g. "instalação". */
  openTask: string;
  due: DueFilter;
  progress: ProgressFilter;
  sort: ProjectSort;
}

export const DEFAULT_PROJECT_FILTERS: ProjectFilters = {
  query: "",
  openTask: "",
  due: "todos",
  progress: "todos",
  sort: "prazo_asc",
};

type ProjectLike = {
  name: string;
  dueDate: string | null;
  tasks: (TaskLike & { title?: string })[];
  clientInfo?: { serviceType?: string };
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/**
 * Titles of the project's open (not completed) tasks whose title contains `text`
 * (accent/case-insensitive). Empty `text` returns [].
 */
export function matchingOpenTasks(
  project: { tasks: (TaskLike & { title?: string })[] },
  text: string,
): string[] {
  const q = fold(text);
  if (!q) return [];
  return project.tasks
    .filter((t) => t.completedAt === null && fold(t.title ?? "").includes(q))
    .map((t) => t.title ?? "");
}

/** Whole days from `today` to `date` (both YYYY-MM-DD); negative when in the past. */
function daysUntil(date: string, today: string): number {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}

function matchesDue(p: ProjectLike, due: DueFilter, today: string): boolean {
  if (due === "todos") return true;
  if (due === "sem_prazo") return p.dueDate === null;
  if (p.dueDate === null) return false;
  const days = daysUntil(p.dueDate, today);
  if (due === "atrasados") return days < 0 && projectStatus(p.tasks) !== "done";
  if (due === "7dias") return days >= 0 && days <= 7;
  return days >= 0 && days <= 30;
}

function matchesProgress(percent: number, progress: ProgressFilter): boolean {
  switch (progress) {
    case "todos":
      return true;
    case "0-25":
      return percent < 25;
    case "25-50":
      return percent >= 25 && percent < 50;
    case "50-75":
      return percent >= 50 && percent < 75;
    case "75-99":
      return percent >= 75 && percent < 100;
    case "100":
      return percent === 100;
  }
}

/** True when a project is late: due date passed and not all tasks done. */
export function isOverdue(p: ProjectLike, today: string): boolean {
  return matchesDue(p, "atrasados", today);
}

/**
 * Filters projects by name (accent/case-insensitive; also matches the service type),
 * due date window, production % and an open task (by title), then sorts. `today` is the local date as YYYY-MM-DD.
 * Projects without a due date always go last when sorting by prazo.
 */
export function filterAndSortProjects<T extends ProjectLike>(
  projects: T[],
  filters: ProjectFilters,
  today: string,
): T[] {
  const q = fold(filters.query);
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  const byName = (a: T, b: T) => collator.compare(a.name.trim(), b.name.trim());
  const withPercent = projects.map((p) => ({ p, percent: projectProgress(p.tasks).percent }));

  const filtered = withPercent.filter(
    ({ p, percent }) =>
      (!q || fold(p.name).includes(q) || fold(p.clientInfo?.serviceType ?? "").includes(q)) &&
      matchesDue(p, filters.due, today) &&
      matchesProgress(percent, filters.progress) &&
      (!fold(filters.openTask) || matchingOpenTasks(p, filters.openTask).length > 0),
  );

  const [key, dir] = filters.sort.split("_") as ["prazo" | "nome" | "producao", "asc" | "desc"];
  const sign = dir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    if (key === "prazo") {
      if (a.p.dueDate === b.p.dueDate) return byName(a.p, b.p);
      if (a.p.dueDate === null) return 1;
      if (b.p.dueDate === null) return -1;
      return sign * a.p.dueDate.localeCompare(b.p.dueDate);
    }
    if (key === "producao") return sign * (a.percent - b.percent) || byName(a.p, b.p);
    return sign * byName(a.p, b.p);
  });
  return filtered.map(({ p }) => p);
}

/** Today's local date as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}
