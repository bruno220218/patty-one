import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ProjectRepository } from "./repositories";
import type { Project, ProjectClientInfo } from "./types";
import { dbError, unwrap } from "./db-errors";
import { moveItem, normalizeClientInfo, requireText } from "./rules";

// Client-info columns are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

const NAME_REQUIRED = "O nome do projeto é obrigatório.";
const TASK_REQUIRED = "O título da tarefa é obrigatório.";
const BLOCKER_REQUIRED = "Descreva o bloqueio.";
const LOCKED = "Este projeto tem parâmetros fixos: as tarefas não podem ser alteradas.";

const SELECT = `id, name, description, due_date, source_checklist_id, locked, archived, archived_at, created_at, updated_at,
  service_type, led_color, paint_colors, adhesive_type, lamination,
  project_tasks(id, title, position, completed_at, completed_by, completed_by_name, created_at,
    completer:profiles!project_tasks_completed_by_fkey(display_name)),
  project_blockers(id, description, suggestion, created_at, resolved_at, created_by_name,
    author:profiles!project_blockers_created_by_fkey(display_name))`;

interface Row {
  id: string;
  name: string;
  description: string;
  due_date: string | null;
  source_checklist_id: string | null;
  locked: boolean;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  service_type: string | null;
  led_color: string | null;
  paint_colors: string | null;
  adhesive_type: string | null;
  lamination: boolean | null;
  project_tasks: {
    id: string;
    title: string;
    position: number;
    completed_at: string | null;
    completed_by: string | null;
    completed_by_name: string | null;
    created_at: string;
    completer: { display_name: string } | null;
  }[];
  project_blockers: {
    id: string;
    description: string;
    suggestion: string | null;
    created_at: string;
    resolved_at: string | null;
    created_by_name: string | null;
    author: { display_name: string } | null;
  }[];
}

function toProject(row: Row): Project {
  const tasks = [...(row.project_tasks ?? [])].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  const blockers = [...(row.project_blockers ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    dueDate: row.due_date,
    sourceChecklistId: row.source_checklist_id,
    locked: row.locked,
    clientInfo: {
      serviceType: row.service_type ?? "",
      ledColor: row.led_color ?? "",
      paintColors: row.paint_colors ?? "",
      adhesiveType: row.adhesive_type ?? "",
      lamination: row.lamination ?? null,
    },
    archived: row.archived,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      completedAt: t.completed_at,
      completedBy:
        t.completed_by || t.completed_by_name
          ? {
              id: t.completed_by,
              name: t.completer?.display_name || t.completed_by_name || "Alguém da equipe",
            }
          : null,
    })),
    blockers: blockers.map((b) => ({
      id: b.id,
      description: b.description,
      suggestion: b.suggestion,
      createdByName: b.author?.display_name || b.created_by_name || null,
      createdAt: b.created_at,
      resolvedAt: b.resolved_at,
    })),
  };
}

async function fetchOne(id: string): Promise<Project> {
  const row = unwrap(await supabase.from("projects").select(SELECT).eq("id", id).maybeSingle());
  return toProject(row as unknown as Row);
}

async function assertUnlocked(projectId: string): Promise<Project> {
  const project = await fetchOne(projectId);
  if (project.locked) throw new Error(LOCKED);
  return project;
}

function clientInfoColumns(info: ProjectClientInfo) {
  const n = normalizeClientInfo(info);
  return {
    service_type: n.serviceType,
    led_color: n.ledColor,
    paint_colors: n.paintColors,
    adhesive_type: n.adhesiveType,
    lamination: n.lamination,
  };
}

async function saveClientInfo(id: string, info: ProjectClientInfo): Promise<void> {
  const { error } = await db.from("projects").update(clientInfoColumns(info)).eq("id", id);
  if (error) throw dbError(error);
}

function normalizeDueDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export const cloudProjectRepository: ProjectRepository = {
  async list({ archived }) {
    const { data, error } = await supabase
      .from("projects")
      .select(SELECT)
      .eq("archived", archived)
      .order(archived ? "archived_at" : "created_at", { ascending: false });
    if (error) throw dbError(error);
    return ((data ?? []) as unknown as Row[]).map(toProject);
  },
  async get(id) {
    const { data, error } = await supabase
      .from("projects")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw dbError(error);
    return data ? toProject(data as unknown as Row) : null;
  },
  async create(input) {
    const id = unwrap(
      await supabase.rpc("create_project", {
        _name: requireText(input.name, NAME_REQUIRED),
        _description: input.description.trim(),
        _due_date: normalizeDueDate(input.dueDate) as string,
        _checklist_id: input.checklistId as string,
      }),
    );
    // create_project only knows the base fields; client info is saved right after.
    await saveClientInfo(id, input.clientInfo);
    return fetchOne(id);
  },
  async update(id, input) {
    const { error } = await db
      .from("projects")
      .update({
        name: requireText(input.name, NAME_REQUIRED),
        description: input.description.trim(),
        due_date: normalizeDueDate(input.dueDate),
        ...clientInfoColumns(input.clientInfo),
      })
      .eq("id", id);
    if (error) throw dbError(error);
    return fetchOne(id);
  },
  async duplicate(id) {
    const source = await fetchOne(id);
    const newId = unwrap(await supabase.rpc("duplicate_project", { _project_id: id }));
    // duplicate_project copies the base fields and tasks; client info is copied here.
    await saveClientInfo(newId, source.clientInfo);
    return fetchOne(newId);
  },
  async setArchived(id, archived) {
    const { error } = await supabase
      .from("projects")
      .update({ archived, archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) throw dbError(error);
    return fetchOne(id);
  },
  async remove(id) {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw dbError(error);
  },
  async addTask(projectId, title) {
    const clean = requireText(title, TASK_REQUIRED);
    const current = await assertUnlocked(projectId);
    const { error } = await supabase
      .from("project_tasks")
      .insert({ project_id: projectId, title: clean, position: current.tasks.length + 1 });
    if (error) throw dbError(error);
    return fetchOne(projectId);
  },
  async updateTask(projectId, taskId, title) {
    const clean = requireText(title, TASK_REQUIRED);
    await assertUnlocked(projectId);
    const { error } = await supabase
      .from("project_tasks")
      .update({ title: clean })
      .eq("id", taskId);
    if (error) throw dbError(error);
    return fetchOne(projectId);
  },
  async removeTask(projectId, taskId) {
    await assertUnlocked(projectId);
    const { error } = await supabase.from("project_tasks").delete().eq("id", taskId);
    if (error) throw dbError(error);
    return fetchOne(projectId);
  },
  async moveTask(projectId, taskId, direction) {
    const current = await assertUnlocked(projectId);
    const index = current.tasks.findIndex((t) => t.id === taskId);
    const next = moveItem(current.tasks, index, direction);
    for (const [i, task] of next.entries()) {
      const { error } = await supabase
        .from("project_tasks")
        .update({ position: i + 1 })
        .eq("id", task.id);
      if (error) throw dbError(error);
    }
    return fetchOne(projectId);
  },
  async toggleTask(projectId, taskId, done) {
    // The server records who completed the task and when, and only lets gestores uncheck.
    const { error } = await supabase
      .from("project_tasks")
      .update({ completed_at: done ? new Date().toISOString() : null })
      .eq("id", taskId);
    if (error) throw dbError(error);
    return fetchOne(projectId);
  },
  async addBlocker(projectId, description) {
    const row = unwrap(
      await supabase
        .from("project_blockers")
        .insert({ project_id: projectId, description: requireText(description, BLOCKER_REQUIRED) })
        .select("id, description, suggestion, created_at, resolved_at")
        .single(),
    );
    return {
      id: row.id,
      description: row.description,
      suggestion: row.suggestion,
      createdByName: null,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    };
  },
  async setBlockerSuggestion(projectId, blockerId, suggestion) {
    const { error } = await supabase
      .from("project_blockers")
      .update({ suggestion })
      .eq("id", blockerId);
    if (error) throw dbError(error);
    return fetchOne(projectId);
  },
  async setBlockerResolved(projectId, blockerId, resolved) {
    const { error } = await supabase
      .from("project_blockers")
      .update({ resolved_at: resolved ? new Date().toISOString() : null })
      .eq("id", blockerId);
    if (error) throw dbError(error);
    return fetchOne(projectId);
  },
  async removeBlocker(projectId, blockerId) {
    const { error } = await supabase.from("project_blockers").delete().eq("id", blockerId);
    if (error) throw dbError(error);
    return fetchOne(projectId);
  },
};
