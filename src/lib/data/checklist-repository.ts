import type { Checklist, ChecklistInput, MoveDirection } from "./types";
import { generateId } from "./ids";
import { readCollection, writeCollection } from "./local-store";
import { moveItem, requireText } from "./rules";

/** Contract for checklist persistence. Swap the implementation to move to a database. */
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

const COLLECTION = "checklists";
const NAME_REQUIRED = "O nome do checklist é obrigatório.";
const TASK_REQUIRED = "O título da tarefa é obrigatório.";

function load(): Checklist[] {
  return readCollection<Checklist>(COLLECTION).map((c) => ({
    ...c,
    fixedParams: Boolean(c.fixedParams),
    tasks: c.tasks ?? [],
  }));
}

function save(items: Checklist[]) {
  writeCollection(COLLECTION, items);
}

function mutate(id: string, fn: (c: Checklist) => Checklist): Checklist {
  const items = load();
  const index = items.findIndex((c) => c.id === id);
  if (index === -1) throw new Error("Checklist não encontrado.");
  const updated = { ...fn(items[index]), updatedAt: new Date().toISOString() };
  items[index] = updated;
  save(items);
  return structuredClone(updated);
}

export const localChecklistRepository: ChecklistRepository = {
  async list() {
    return load().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async get(id) {
    return load().find((c) => c.id === id) ?? null;
  },
  async create(input) {
    const now = new Date().toISOString();
    const checklist: Checklist = {
      id: generateId(),
      name: requireText(input.name, NAME_REQUIRED),
      description: input.description.trim(),
      fixedParams: input.fixedParams,
      tasks: [],
      createdAt: now,
      updatedAt: now,
    };
    save([...load(), checklist]);
    return checklist;
  },
  async update(id, input) {
    const name = requireText(input.name, NAME_REQUIRED);
    return mutate(id, (c) => ({
      ...c,
      name,
      description: input.description.trim(),
      fixedParams: input.fixedParams,
    }));
  },
  async duplicate(id) {
    const items = load();
    const source = items.find((c) => c.id === id);
    if (!source) throw new Error("Checklist não encontrado.");
    const now = new Date().toISOString();
    const copy: Checklist = {
      ...source,
      id: generateId(),
      name: `${source.name} (cópia)`,
      tasks: source.tasks.map((t) => ({ id: generateId(), title: t.title })),
      createdAt: now,
      updatedAt: now,
    };
    save([...items, copy]);
    return copy;
  },
  async remove(id) {
    save(load().filter((c) => c.id !== id));
  },
  async addTask(checklistId, title) {
    const clean = requireText(title, TASK_REQUIRED);
    return mutate(checklistId, (c) => ({
      ...c,
      tasks: [...c.tasks, { id: generateId(), title: clean }],
    }));
  },
  async updateTask(checklistId, taskId, title) {
    const clean = requireText(title, TASK_REQUIRED);
    return mutate(checklistId, (c) => ({
      ...c,
      tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, title: clean } : t)),
    }));
  },
  async removeTask(checklistId, taskId) {
    return mutate(checklistId, (c) => ({ ...c, tasks: c.tasks.filter((t) => t.id !== taskId) }));
  },
  async moveTask(checklistId, taskId, direction) {
    return mutate(checklistId, (c) => ({
      ...c,
      tasks: moveItem(
        c.tasks,
        c.tasks.findIndex((t) => t.id === taskId),
        direction,
      ),
    }));
  },
};
