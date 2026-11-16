import type { ChecklistTask, MoveDirection, ProjectStatus, ProjectTask } from "./types";
import { generateId } from "./ids";

/** Copies checklist tasks into fresh project tasks: new IDs, all unchecked. */
export function copyTasksForProject(tasks: ChecklistTask[]): ProjectTask[] {
  return tasks.map((t) => ({ id: generateId(), title: t.title, completedAt: null }));
}

export function projectProgress(tasks: ProjectTask[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completedAt !== null).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, percent };
}

export function projectStatus(tasks: ProjectTask[]): ProjectStatus {
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
