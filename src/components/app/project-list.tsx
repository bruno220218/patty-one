import { Link } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Copy, Lock, Pencil, Trash2 } from "lucide-react";
import { isOverdue, projectProgress, projectStatus, type Project } from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "./status-badge";
import { IconAction } from "./icon-action";

export interface ProjectRowActions {
  onEdit?: (p: Project) => void;
  onDuplicate: (p: Project) => void;
  onArchive?: (p: Project) => void;
  onRestore?: (p: Project) => void;
  onDelete: (p: Project) => void;
}

/** Compact table view of projects (alternative to the card "kanban" grid). */
export function ProjectList({
  projects,
  today,
  ...actions
}: { projects: Project[]; today: string } & ProjectRowActions) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1fr)_8rem_10rem_7rem_9.5rem] gap-4 border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
        <span>Projeto</span>
        <span>Status</span>
        <span>Produção</span>
        <span>Prazo</span>
        <span className="sr-only">Ações</span>
      </div>
      <ul className="divide-y divide-border">
        {projects.map((p) => {
          const { done, total, percent } = projectProgress(p.tasks);
          const late = isOverdue(p, today);
          return (
            <li
              key={p.id}
              className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_8rem_10rem_7rem_9.5rem]"
            >
              <div className="min-w-0">
                <Link
                  to="/projetos/$projectId"
                  params={{ projectId: p.id }}
                  className="block truncate text-sm font-semibold after:absolute after:inset-0 focus-visible:outline-none"
                >
                  {p.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {p.description || "Sem descrição"}
                </p>
              </div>

              <div className="justify-self-end md:justify-self-start">
                <StatusBadge status={projectStatus(p.tasks)} />
              </div>

              <div className="col-span-2 flex items-center gap-2 md:col-span-1">
                <Progress
                  value={percent}
                  aria-label={`Progresso ${percent}%`}
                  className="h-2 flex-1"
                />
                <span className="flex w-16 items-center justify-end gap-1 text-xs tabular-nums text-muted-foreground">
                  {p.locked && <Lock className="h-3 w-3" aria-label="Parâmetros fixos" />}
                  {percent}%
                </span>
                <span className="text-xs text-muted-foreground md:hidden">
                  · {done}/{total}
                </span>
              </div>

              <span
                className={cn(
                  "text-xs tabular-nums text-muted-foreground",
                  late && "font-semibold text-destructive",
                )}
              >
                {p.dueDate ? formatDateOnly(p.dueDate) : "Sem prazo"}
                {late && <span className="ml-1">· atrasado</span>}
              </span>

              <div className="flex items-center justify-end gap-0.5">
                {actions.onEdit && (
                  <IconAction icon={Pencil} label="Editar" onClick={() => actions.onEdit?.(p)} />
                )}
                {actions.onRestore && (
                  <IconAction
                    icon={ArchiveRestore}
                    label="Restaurar"
                    onClick={() => actions.onRestore?.(p)}
                  />
                )}
                <IconAction icon={Copy} label="Duplicar" onClick={() => actions.onDuplicate(p)} />
                {actions.onArchive && (
                  <IconAction
                    icon={Archive}
                    label="Arquivar"
                    onClick={() => actions.onArchive?.(p)}
                  />
                )}
                <IconAction
                  icon={Trash2}
                  label="Excluir"
                  onClick={() => actions.onDelete(p)}
                  danger
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
