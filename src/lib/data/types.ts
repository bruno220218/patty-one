/** Domain types. These describe the records; storage details live in the repositories. */

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string;
  isGestor: boolean;
}

export interface ChecklistTask {
  id: string;
  title: string;
}

export interface Checklist {
  id: string;
  name: string;
  description: string;
  /** When true, projects created from this checklist get their tasks locked. */
  fixedParams: boolean;
  tasks: ChecklistTask[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonRef {
  id: string;
  name: string;
}

export interface ProjectTask {
  id: string;
  title: string;
  /** ISO timestamp of completion, or null when not done (set by the server). */
  completedAt: string | null;
  /** Who completed the task (set by the server), or null. */
  completedBy: PersonRef | null;
}

export interface ProjectBlocker {
  id: string;
  description: string;
  /** AI-suggested next steps, or null when not generated yet / failed. */
  suggestion: string | null;
  createdByName: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  /** Due date as YYYY-MM-DD, or null. */
  dueDate: string | null;
  /** Checklist this project was created from (informational only, never synced). */
  sourceChecklistId: string | null;
  /** Inherited from the checklist's "Parâmetros fixos" at creation time. */
  locked: boolean;
  archived: boolean;
  archivedAt: string | null;
  tasks: ProjectTask[];
  blockers: ProjectBlocker[];
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistInput {
  name: string;
  description: string;
  fixedParams: boolean;
}

export interface ProjectInput {
  name: string;
  description: string;
  dueDate: string | null;
}

export interface NewProjectInput extends ProjectInput {
  /** null = empty project */
  checklistId: string | null;
}

export type MoveDirection = "up" | "down";

export type ProjectStatus = "not_started" | "in_progress" | "done";
