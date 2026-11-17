import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { NotificationRepository } from "./repositories";
import type { AppNotification } from "./types";
import { dbError } from "./db-errors";

// Notifications are created by a database trigger; the client only reads them and marks them read.
// The notifications table is newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

const SELECT_BASE =
  "id, tipo, project_id, actor_name, project_name, task_title, liberacao_id, liberacao_numero, detalhe, created_at, read_at";
// link/ref_numero come with the briefings/visitas migration.
const SELECT = `${SELECT_BASE}, link, ref_numero`;

interface Row {
  id: string;
  tipo: AppNotification["tipo"] | null;
  project_id: string | null;
  liberacao_id: string | null;
  liberacao_numero: number | null;
  detalhe: string | null;
  link?: string | null;
  ref_numero?: number | null;
  actor_name: string;
  project_name: string;
  task_title: string;
  created_at: string;
  read_at: string | null;
}

function toNotification(row: Row): AppNotification {
  return {
    id: row.id,
    tipo: row.tipo ?? "tarefa_concluida",
    projectId: row.project_id,
    liberacaoId: row.liberacao_id,
    liberacaoNumero: row.liberacao_numero,
    detalhe: row.detalhe ?? "",
    link: row.link ?? "",
    refNumero: row.ref_numero ?? null,
    actorName: row.actor_name || "Alguém da equipe",
    projectName: row.project_name,
    taskTitle: row.task_title,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export const cloudNotificationRepository: NotificationRepository = {
  async list(limit = 50) {
    const query = (cols: string) =>
      db.from("notifications").select(cols).order("created_at", { ascending: false }).limit(limit);
    let { data, error } = await query(SELECT);
    if (error?.code === "42703") ({ data, error } = await query(SELECT_BASE));
    if (error) throw dbError(error);
    return ((data ?? []) as unknown as Row[]).map(toNotification);
  },
  async markRead(id) {
    const { error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);
    if (error) throw dbError(error);
  },
  async markAllRead() {
    // RLS limits the update to the signed-in person's own notifications.
    const { error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) throw dbError(error);
  },
  subscribe(userId, onChange) {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => onChange(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
