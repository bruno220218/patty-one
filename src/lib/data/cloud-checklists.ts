import { supabase } from "@/integrations/supabase/client";
import type { ChecklistRepository } from "./repositories";
import type { Checklist } from "./types";
import { dbError, unwrap } from "./db-errors";
import { moveItem, requireText } from "./rules";

const NAME_REQUIRED = "O nome do checklist é obrigatório.";
const TASK_REQUIRED = "O título da tarefa é obrigatório.";
const SELECT =
  "id, name, description, fixed_params, created_at, updated_at, checklist_tasks(id, title, position, created_at)";

interface Row {
  id: string;
  name: string;
  description: string;
  fixed_params: boolean;
  created_at: string;
  updated_at: string;
  checklist_tasks: { id: string; title: string; position: number; created_at: string }[];
}

function toChecklist(row: Row): Checklist {
  const tasks = [...(row.checklist_tasks ?? [])].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    fixedParams: row.fixed_params,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchOne(id: string): Promise<Checklist> {
  const row = unwrap(await supabase.from("checklists").select(SELECT).eq("id", id).maybeSingle());
  return toChecklist(row as unknown as Row);
}

export const cloudChecklistRepository: ChecklistRepository = {
  async list() {
    const { data, error } = await supabase
      .from("checklists")
      .select(SELECT)
      .order("created_at", { ascending: false });
    if (error) throw dbError(error);
    return ((data ?? []) as unknown as Row[]).map(toChecklist);
  },
  async get(id) {
    const { data, error } = await supabase.from("checklists").select(SELECT).eq("id", id).maybeSingle();
    if (error) throw dbError(error);
    return data ? toChecklist(data as unknown as Row) : null;
  },
  async create(input) {
    const row = unwrap(
      await supabase
        .from("checklists")
        .insert({
          name: requireText(input.name, NAME_REQUIRED),
          description: input.description.trim(),
          fixed_params: input.fixedParams,
        })
        .select("id")
        .single(),
    );
    return fetchOne(row.id);
  },
  async update(id, input) {
    const { error } = await supabase
      .from("checklists")
      .update({
        name: requireText(input.name, NAME_REQUIRED),
        description: input.description.trim(),
        fixed_params: input.fixedParams,
      })
      .eq("id", id);
    if (error) throw dbError(error);
    return fetchOne(id);
  },
  async duplicate(id) {
    const source = await fetchOne(id);
    const copy = unwrap(
      await supabase
        .from("checklists")
        .insert({
          name: `${source.name} (cópia)`,
          description: source.description,
          fixed_params: source.fixedParams,
        })
        .select("id")
        .single(),
    );
    if (source.tasks.length > 0) {
      const { error } = await supabase.from("checklist_tasks").insert(
        source.tasks.map((t, i) => ({ checklist_id: copy.id, title: t.title, position: i + 1 })),
      );
      if (error) throw dbError(error);
    }
    return fetchOne(copy.id);
  },
  async remove(id) {
    const { error } = await supabase.from("checklists").delete().eq("id", id);
    if (error) throw dbError(error);
  },
  async addTask(checklistId, title) {
    const clean = requireText(title, TASK_REQUIRED);
    const current = await fetchOne(checklistId);
    const { error } = await supabase
      .from("checklist_tasks")
      .insert({ checklist_id: checklistId, title: clean, position: current.tasks.length + 1 });
    if (error) throw dbError(error);
    return fetchOne(checklistId);
  },
  async updateTask(checklistId, taskId, title) {
    const { error } = await supabase
      .from("checklist_tasks")
      .update({ title: requireText(title, TASK_REQUIRED) })
      .eq("id", taskId);
    if (error) throw dbError(error);
    return fetchOne(checklistId);
  },
  async removeTask(checklistId, taskId) {
    const { error } = await supabase.from("checklist_tasks").delete().eq("id", taskId);
    if (error) throw dbError(error);
    return fetchOne(checklistId);
  },
  async moveTask(checklistId, taskId, direction) {
    const current = await fetchOne(checklistId);
    const index = current.tasks.findIndex((t) => t.id === taskId);
    const next = moveItem(current.tasks, index, direction);
    for (const [i, task] of next.entries()) {
      const { error } = await supabase
        .from("checklist_tasks")
        .update({ position: i + 1 })
        .eq("id", task.id);
      if (error) throw dbError(error);
    }
    return fetchOne(checklistId);
  },
};
