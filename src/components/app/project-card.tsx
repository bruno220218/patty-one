import { Link } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Copy, Lock, Pencil, Trash2 } from "lucide-react";
import { projectProgress, projectStatus, type Project } from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { StatusBadge } from "./status-badge";
import { IconAction } from "./icon-action";
import { ProjectProgressBar } from "./project-progress";
import { OpenTaskChips } from "./open-task-chips";

export function ProjectCard({
  project,
  onEdit,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
  openTasks = [],
}: {
  project: Project;
  /** Open tasks matching the "Tarefa em aberto" filter, shown as chips. */
  openTasks?: string[];
  onEdit?: () => void;
  onDuplicate: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete: () => void;
}) {
  const { done, total, percent } = projectProgress(project.tasks);
  return (
    <article className="surface-card relative flex flex-col p-5 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 break-words text-base font-semibold">
          <Link
            to="/projetos/$projectId"
            params={{ projectId: project.id }}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
          >
            {project.name}
          </Link>
        </h2>
        <StatusBadge status={projectStatus(project.tasks)} />
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
        {project.description || "Sem descrição"}
      </p>
      <div className="mt-4">
        <ProjectProgressBar tasks={project.tasks} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {project.locked && <Lock className="h-3 w-3" aria-label="Parâmetros fixos" />}
          {done}/{total} {total === 1 ? "tarefa" : "tarefas"} · {percent}%
        </span>
        <span>{project.dueDate ? `Prazo ${formatDateOnly(project.dueDate)}` : "Sem prazo"}</span>
      </div>
      <OpenTaskChips titles={openTasks} />
      <div className="mt-4 flex items-center justify-end gap-1">
        {onEdit && <IconAction icon={Pencil} label="Editar" onClick={onEdit} />}
        {onRestore && <IconAction icon={ArchiveRestore} label="Restaurar" onClick={onRestore} />}
        <IconAction icon={Copy} label="Duplicar" onClick={onDuplicate} />
        {onArchive && <IconAction icon={Archive} label="Arquivar" onClick={onArchive} />}
        <IconAction icon={Trash2} label="Excluir" onClick={onDelete} danger />
      </div>
    </article>
  );
}
