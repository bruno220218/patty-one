import type {
  Liberacao,
  LiberacaoInput,
  Checklist,
  ChecklistInput,
  MoveDirection,
  NewProjectInput,
  Project,
  ProjectBlocker,
  ProjectInput,
} from "./types";

/** Contract for checklist persistence. The UI depends only on this interface. */
export interface ChecklistRepository {
  list(): Promise<Checklist[]>;
  get(id: string): Promise<Checklist | null>;
  create(input: ChecklistInput): Promise<Checklist>;
  update(id: string, input: ChecklistInput): Promise<Checklist>;
  duplicate(id: string): Promise<Checklist>;
  remove(id: string): Promise<void>;
  addTask(checklistId: string, title: string): Promise<Checklist>;
  updateTask(checklistId: string, taskId: string, title: string): Promise<Checklist>;
  removeTask(checklistId: string, taskId: string): Promise<Checklist>;
  moveTask(checklistId: string, taskId: string, direction: MoveDirection): Promise<Checklist>;
}

/** Contract for project persistence. The UI depends only on this interface. */
export interface ProjectRepository {
  list(options: { archived: boolean }): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  create(input: NewProjectInput): Promise<Project>;
  update(id: string, input: ProjectInput): Promise<Project>;
  duplicate(id: string): Promise<Project>;
  setArchived(id: string, archived: boolean): Promise<Project>;
  remove(id: string): Promise<void>;
  addTask(projectId: string, title: string): Promise<Project>;
  updateTask(projectId: string, taskId: string, title: string): Promise<Project>;
  removeTask(projectId: string, taskId: string): Promise<Project>;
  moveTask(projectId: string, taskId: string, direction: MoveDirection): Promise<Project>;
  toggleTask(projectId: string, taskId: string, done: boolean): Promise<Project>;
  addBlocker(projectId: string, description: string): Promise<ProjectBlocker>;
  setBlockerSuggestion(projectId: string, blockerId: string, suggestion: string): Promise<Project>;
  setBlockerResolved(projectId: string, blockerId: string, resolved: boolean): Promise<Project>;
  removeBlocker(projectId: string, blockerId: string): Promise<Project>;
}

/** Contract for liberação persistence (models Projetos and Mídia). */
export interface LiberacaoRepository {
  list(): Promise<Liberacao[]>;
  get(id: string): Promise<Liberacao | null>;
  /** Suggested number for a new liberação (last + 1). */
  nextNumero(): Promise<number>;
  create(input: LiberacaoInput): Promise<Liberacao>;
  update(id: string, input: LiberacaoInput): Promise<Liberacao>;
  remove(id: string): Promise<void>;
}
