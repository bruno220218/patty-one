import type {
  MoveDirection,
  NewProjectInput,
  Project,
  ProjectBlocker,
  ProjectInput,
} from "./types";
import type { ChecklistRepository } from "./checklist-repository";
import { generateId } from "./ids";
import { readCollection, writeCollection } from "./local-store";
import { copyTasksForProject, moveItem, requireText } from "./rules";

/** Contract for project persistence. Swap the implementation to move to a database. */
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

const COLLECTION = "projects";
const NAME_REQUIRED = "O nome do projeto é obrigatório.";
const TASK_REQUIRED = "O título da tarefa é obrigatório.";
const BLOCKER_REQUIRED = "Descreva o bloqueio.";
const LOCKED = "Este projeto tem parâmetros fixos: as tarefas não podem ser alteradas.";

function normalizeDueDate(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function createLocalProjectRepository(checklists: ChecklistRepository): ProjectRepository {
  function load(): Project[] {
    return readCollection<Project>(COLLECTION).map((p) => ({
      ...p,
      locked: Boolean(p.locked),
      tasks: p.tasks ?? [],
      blockers: p.blockers ?? [],
    }));
  }
  function save(items: Project[]) {
    writeCollection(COLLECTION, items);
  }
  function mutate(id: string, fn: (p: Project) => Project): Project {
    const items = load();
    const index = items.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Projeto não encontrado.");
    const updated = { ...fn(items[index]!), updatedAt: new Date().toISOString() };
    items[index] = updated;
    save(items);
    return structuredClone(updated);
  }
  function mutateTasks(id: string, fn: (p: Project) => Project): Project {
    return mutate(id, (p) => {
      if (p.locked) throw new Error(LOCKED);
      return fn(p);
    });
  }

  return {
    async list({ archived }) {
      return load()
        .filter((p) => p.archived === archived)
        .sort((a, b) =>
          archived
            ? (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")
            : b.createdAt.localeCompare(a.createdAt),
        );
    },
    async get(id) {
      return load().find((p) => p.id === id) ?? null;
    },
    async create(input) {
      const name = requireText(input.name, NAME_REQUIRED);
      let tasks: Project["tasks"] = [];
      let locked = false;
      if (input.checklistId) {
        const source = await checklists.get(input.checklistId);
        if (!source) throw new Error("Checklist não encontrado.");
        tasks = copyTasksForProject(source.tasks);
        locked = source.fixedParams;
      }
      const now = new Date().toISOString();
      const project: Project = {
        id: generateId(),
        name,
        description: input.description.trim(),
        dueDate: normalizeDueDate(input.dueDate),
        sourceChecklistId: input.checklistId,
        locked,
        archived: false,
        archivedAt: null,
        tasks,
        blockers: [],
        createdAt: now,
        updatedAt: now,
      };
      save([...load(), project]);
      return project;
    },
    async update(id, input) {
      const name = requireText(input.name, NAME_REQUIRED);
      return mutate(id, (p) => ({
        ...p,
        name,
        description: input.description.trim(),
        dueDate: normalizeDueDate(input.dueDate),
      }));
    },
    async duplicate(id) {
      const items = load();
      const source = items.find((p) => p.id === id);
      if (!source) throw new Error("Projeto não encontrado.");
      const now = new Date().toISOString();
      const copy: Project = {
        ...source,
        id: generateId(),
        name: `${source.name} (cópia)`,
        archived: false,
        archivedAt: null,
        tasks: source.tasks.map((t) => ({ ...t, id: generateId() })),
        blockers: [],
        createdAt: now,
        updatedAt: now,
      };
      save([...items, copy]);
      return copy;
    },
    async setArchived(id, archived) {
      return mutate(id, (p) => ({
        ...p,
        archived,
        archivedAt: archived ? new Date().toISOString() : null,
      }));
    },
    async remove(id) {
      save(load().filter((p) => p.id !== id));
    },
    async addTask(projectId, title) {
      const clean = requireText(title, TASK_REQUIRED);
      return mutateTasks(projectId, (p) => ({
        ...p,
        tasks: [...p.tasks, { id: generateId(), title: clean, completedAt: null }],
      }));
    },
    async updateTask(projectId, taskId, title) {
      const clean = requireText(title, TASK_REQUIRED);
      return mutateTasks(projectId, (p) => ({
        ...p,
        tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, title: clean } : t)),
      }));
    },
    async removeTask(projectId, taskId) {
      return mutateTasks(projectId, (p) => ({
        ...p,
        tasks: p.tasks.filter((t) => t.id !== taskId),
      }));
    },
    async moveTask(projectId, taskId, direction) {
      return mutateTasks(projectId, (p) => ({
        ...p,
        tasks: moveItem(
          p.tasks,
          p.tasks.findIndex((t) => t.id === taskId),
          direction,
        ),
      }));
    },
    async toggleTask(projectId, taskId, done) {
      // Checking is always allowed, even when the project is locked.
      return mutate(projectId, (p) => ({
        ...p,
        tasks: p.tasks.map((t) =>
          t.id === taskId ? { ...t, completedAt: done ? new Date().toISOString() : null } : t,
        ),
      }));
    },
    async addBlocker(projectId, description) {
      const blocker: ProjectBlocker = {
        id: generateId(),
        description: requireText(description, BLOCKER_REQUIRED),
        suggestion: null,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      };
      mutate(projectId, (p) => ({ ...p, blockers: [blocker, ...p.blockers] }));
      return blocker;
    },
    async setBlockerSuggestion(projectId, blockerId, suggestion) {
      return mutate(projectId, (p) => ({
        ...p,
        blockers: p.blockers.map((b) => (b.id === blockerId ? { ...b, suggestion } : b)),
      }));
    },
    async setBlockerResolved(projectId, blockerId, resolved) {
      return mutate(projectId, (p) => ({
        ...p,
        blockers: p.blockers.map((b) =>
          b.id === blockerId
            ? { ...b, resolvedAt: resolved ? new Date().toISOString() : null }
            : b,
        ),
      }));
    },
    async removeBlocker(projectId, blockerId) {
      return mutate(projectId, (p) => ({
        ...p,
        blockers: p.blockers.filter((b) => b.id !== blockerId),
      }));
    },
  };
}
