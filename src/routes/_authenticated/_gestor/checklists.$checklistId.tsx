import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Copy, Pencil, Play, SearchX, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskList } from "@/components/app/task-list";
import { ChecklistFormDialog } from "@/components/app/checklist-form-dialog";
import { ProjectFormDialog } from "@/components/app/project-form-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { FixedParamsBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { useChecklist, useChecklists, useDataAction } from "@/hooks/use-data";
import { checklistRepository, projectRepository } from "@/lib/data";
import { pluralTasks } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_gestor/checklists/$checklistId")({
  head: () => ({
    meta: [
      { title: "Checklist — Patty One" },
      { name: "description", content: "Edite as tarefas do seu checklist na Patty One." },
      { property: "og:title", content: "Checklist — Patty One" },
      { property: "og:description", content: "Edite as tarefas do seu checklist na Patty One." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChecklistDetailPage,
});

function ChecklistDetailPage() {
  const { checklistId } = Route.useParams();
  const { data: checklist, isPending } = useChecklist(checklistId);
  const { data: allChecklists } = useChecklists();
  const run = useDataAction();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);

  const back = (
    <Button variant="outline" asChild className="mb-6">
      <Link to="/checklists">
        <ArrowLeft />
        Checklists
      </Link>
    </Button>
  );

  if (isPending) return <DetailSkeleton />;
  if (!checklist) {
    return (
      <>
        {back}
        <EmptyState
          icon={SearchX}
          title="Checklist não encontrado"
          description="Ele pode ter sido excluído."
        />
      </>
    );
  }

  return (
    <div className="max-w-3xl">
      {back}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-[1.75rem]">
            {checklist.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {checklist.description || "Sem descrição"}
          </p>
        </div>
        {checklist.fixedParams && <FixedParamsBadge />}
      </div>

      <div className="mt-8 mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Tarefas</h2>
        <span className="text-xs text-muted-foreground">{pluralTasks(checklist.tasks.length)}</span>
      </div>

      <TaskList
        tasks={checklist.tasks}
        emptyText="Nenhuma tarefa ainda. Adicione a primeira abaixo."
        onAdd={(title) => run(() => checklistRepository.addTask(checklist.id, title))}
        onRename={(taskId, title) =>
          run(() => checklistRepository.updateTask(checklist.id, taskId, title))
        }
        onRemove={(taskId) => run(() => checklistRepository.removeTask(checklist.id, taskId))}
        onMove={(taskId, dir) => run(() => checklistRepository.moveTask(checklist.id, taskId, dir))}
      />

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => setProjectOpen(true)}>
          <Play />
          Criar projeto
        </Button>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil />
          Editar
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const copy = await run(
              () => checklistRepository.duplicate(checklist.id),
              "Checklist duplicado.",
            );
            if (copy) navigate({ to: "/checklists/$checklistId", params: { checklistId: copy.id } });
          }}
        >
          <Copy />
          Duplicar
        </Button>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 />
          Excluir
        </Button>
      </div>

      <ChecklistFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        checklist={checklist}
        onSubmit={(input) =>
          run(() => checklistRepository.update(checklist.id, input), "Checklist salvo.")
        }
      />

      <ProjectFormDialog
        mode="create"
        open={projectOpen}
        onOpenChange={setProjectOpen}
        checklists={allChecklists ?? [checklist]}
        defaultChecklistId={checklist.id}
        onSubmit={async (input) => {
          const created = await run(() => projectRepository.create(input), "Projeto criado.");
          if (created) navigate({ to: "/projetos/$projectId", params: { projectId: created.id } });
          return created;
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Excluir checklist?"
        description={`"${checklist.name}" vai para a Lixeira, onde fica 30 dias. Projetos já criados a partir dele não serão afetados.`}
        onConfirm={async () => {
          setDeleteOpen(false);
          await navigate({ to: "/checklists" });
          run(() => checklistRepository.remove(checklist.id), "Checklist excluído.");
        }}
      />
    </div>
  );
}
