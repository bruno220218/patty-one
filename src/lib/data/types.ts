/** Domain types. These describe the records; storage details live in the repositories. */

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string;
  /** Approved by a gestor to see team data (gestores are always members). */
  isMember: boolean;
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
  /** Null when the person was removed from the team; the name is kept. */
  id: string | null;
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

/** Client/job details of a project (comunicação visual). Empty strings mean "not filled". */
export interface ProjectClientInfo {
  serviceType: string;
  ledColor: string;
  paintColors: string;
  adhesiveType: string;
  /** Haverá laminação? null = não informado. */
  lamination: boolean | null;
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
  clientInfo: ProjectClientInfo;
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
  clientInfo: ProjectClientInfo;
}

export interface NewProjectInput extends ProjectInput {
  /** null = empty project */
  checklistId: string | null;
}

export type MoveDirection = "up" | "down";

export type ProjectStatus = "not_started" | "in_progress" | "done";

/** In-app notification (today: a team member completed a project task). */
export interface AppNotification {
  id: string;
  /** Null when the project was deleted; the snapshot names are kept. */
  projectId: string | null;
  actorName: string;
  projectName: string;
  taskTitle: string;
  createdAt: string;
  readAt: string | null;
}
