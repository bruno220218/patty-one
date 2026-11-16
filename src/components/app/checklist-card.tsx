import { Link } from "@tanstack/react-router";
import { Copy, Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Checklist } from "@/lib/data";
import { pluralTasks } from "@/lib/format";
import { FixedParamsBadge } from "./status-badge";
import { IconAction } from "./icon-action";

export function ChecklistCard({
  checklist,
  onCreateProject,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  checklist: Checklist;
  onCreateProject: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="surface-card relative flex flex-col p-5 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 break-words text-base font-semibold">
          <Link
            to="/checklists/$checklistId"
            params={{ checklistId: checklist.id }}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
          >
            {checklist.name}
          </Link>
        </h2>
        {checklist.fixedParams && <FixedParamsBadge />}
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
        {checklist.description || "Sem descrição"}
      </p>
      <p className="mt-3 text-xs font-medium text-muted-foreground">
        {pluralTasks(checklist.tasks.length)}
      </p>
      <div className="mt-4 flex items-center gap-1 pt-1">
        <Button size="sm" className="relative z-10 mr-auto h-9 px-3.5" onClick={onCreateProject}>
          <Play className="!h-3.5 !w-3.5" />
          Criar projeto
        </Button>
        <IconAction icon={Pencil} label="Editar" onClick={onEdit} />
        <IconAction icon={Copy} label="Duplicar" onClick={onDuplicate} />
        <IconAction icon={Trash2} label="Excluir" onClick={onDelete} danger />
      </div>
    </article>
  );
}
