import type {
  AppNotification,
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

/** Contract for in-app notifications of the signed-in person. */
export interface NotificationRepository {
  list(limit?: number): Promise<AppNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  /** Calls `onChange` when the person's notifications change. Returns an unsubscribe function. */
  subscribe(userId: string, onChange: () => void): () => void;
}
