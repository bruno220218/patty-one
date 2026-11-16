import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ArrowLeft, Copy, Lock, Pencil, SearchX, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskList } from "@/components/app/task-list";
import { ProjectFormDialog } from "@/components/app/project-form-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ProjectProgressBar } from "@/components/app/project-progress";
import { BlockerPanel } from "@/components/app/blocker-panel";
import { useDataAction, useProject } from "@/hooks/use-data";
import { projectProgress, projectRepository, projectStatus } from "@/lib/data";
import { formatDate, formatDateOnly } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projetos/$projectId")({
  head: () => ({
    meta: [
      { title: "Projeto — Patty One" },
      { name: "description", content: "Acompanhe as tarefas e o progresso do projeto." },
      { property: "og:title", content: "Projeto — Patty One" },
      { property: "og:description", content: "Acompanhe as tarefas e o progresso do projeto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { data: project, isPending } = useProject(projectId);
  const run = useDataAction();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const back = (
    <Button variant="outline" asChild className="mb-6">
      <Link to="/projetos">
        <ArrowLeft />
        Projetos
      </Link>
    </Button>
  );

  if (isPending) return <DetailSkeleton />;
  if (!project) {
    return (
      <>
        {back}
        <EmptyState
          icon={SearchX}
          title="Projeto não encontrado"
          description="Ele pode ter sido excluído."
        />
      </>
    );
  }

  const { done, total, percent } = projectProgress(project.tasks);
  const id = project.id;

  return (
    <div className="max-w-3xl">
      {back}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-[1.75rem]">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.description || "Sem descrição"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project.archived && (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              Arquivado
            </span>
          )}
          <StatusBadge status={projectStatus(project.tasks)} />
        </div>
      </div>

      <section className="surface-card mt-6 p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-3xl font-bold tracking-tight">{percent}%</p>
          <p className="text-right text-sm text-muted-foreground">
            {done} de {total} {total === 1 ? "tarefa concluída" : "tarefas concluídas"}
          </p>
        </div>
        <div className="mt-4">
          <ProjectProgressBar tasks={project.tasks} />
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>Criado em {formatDate(project.createdAt)}</span>
          <span>{project.dueDate ? `Prazo ${formatDateOnly(project.dueDate)}` : "Sem prazo"}</span>
        </div>
      </section>

      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Tarefas</h2>
        {project.locked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-locked px-2.5 py-0.5 text-xs font-semibold text-locked-foreground">
            <Lock className="h-3 w-3" />
            Parâmetros fixos — apenas marque o que foi feito
          </span>
        )}
      </div>

      <TaskList
        tasks={project.tasks}
        checkable
        locked={project.locked}
        emptyText={
          project.locked ? "Este projeto não tem tarefas." : "Nenhuma tarefa ainda. Adicione abaixo."
        }
        onToggle={(taskId, isDone) => run(() => projectRepository.toggleTask(id, taskId, isDone))}
        onAdd={(title) => run(() => projectRepository.addTask(id, title))}
        onRename={(taskId, title) => run(() => projectRepository.updateTask(id, taskId, title))}
        onRemove={(taskId) => run(() => projectRepository.removeTask(id, taskId))}
        onMove={(taskId, dir) => run(() => projectRepository.moveTask(id, taskId, dir))}
      />

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil />
          Editar
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const copy = await run(() => projectRepository.duplicate(id), "Projeto duplicado.");
            if (copy) navigate({ to: "/projetos/$projectId", params: { projectId: copy.id } });
          }}
        >
          <Copy />
          Duplicar
        </Button>
        {project.archived ? (
          <Button
            variant="outline"
            onClick={() => run(() => projectRepository.setArchived(id, false), "Projeto restaurado.")}
          >
            <ArchiveRestore />
            Restaurar
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await run(
                () => projectRepository.setArchived(id, true),
                "Projeto arquivado.",
              );
              if (ok) navigate({ to: "/projetos" });
            }}
          >
            <Archive />
            Arquivar
          </Button>
        )}
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 />
          Excluir
        </Button>
      </div>

      <BlockerPanel project={project} />

      <ProjectFormDialog
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        onSubmit={(input) => run(() => projectRepository.update(id, input), "Projeto salvo.")}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Excluir projeto?"
        description={`"${project.name}" e suas tarefas serão excluídos permanentemente.`}
        onConfirm={async () => {
          setDeleteOpen(false);
          await navigate({ to: project.archived ? "/arquivados" : "/projetos" });
          run(() => projectRepository.remove(id), "Projeto excluído.");
        }}
      />
    </div>
  );
}
