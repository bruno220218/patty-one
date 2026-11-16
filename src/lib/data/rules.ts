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
