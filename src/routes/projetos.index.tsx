import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ProjectCard } from "@/components/app/project-card";
import { ProjectFormDialog } from "@/components/app/project-form-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useChecklists, useDataAction, useProjects } from "@/hooks/use-data";
import { projectRepository, type Project } from "@/lib/data";

export const Route = createFileRoute("/projetos/")({
  head: () => ({
    meta: [
      { title: "Projetos — Patty One" },
      {
        name: "description",
        content: "Acompanhe o status e o progresso dos seus projetos na Patty One.",
      },
      { property: "og:title", content: "Projetos — Patty One" },
      {
        property: "og:description",
        content: "Acompanhe o status e o progresso dos seus projetos na Patty One.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data: projects, isPending } = useProjects(false);
  const { data: checklists } = useChecklists();
  const run = useDataAction();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  return (
    <>
      <PageHeader
        title="Projetos"
        description="Acompanhe o andamento de cada projeto."
        action={
          <Button onClick={() => setCreateOpen(true)} className="h-10">
            <Plus />
            Novo projeto
          </Button>
        }
      />

      {isPending ? (
        <CardGridSkeleton />
      ) : !projects || projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Nenhum projeto ativo"
          description="Crie um projeto a partir de um checklist ou comece um projeto vazio."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Novo projeto
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onEdit={() => setEditing(p)}
              onDuplicate={() => run(() => projectRepository.duplicate(p.id), "Projeto duplicado.")}
              onArchive={() =>
                run(() => projectRepository.setArchived(p.id, true), "Projeto arquivado.")
              }
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      )}

      <ProjectFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        checklists={checklists ?? []}
        onSubmit={async (input) => {
          const created = await run(() => projectRepository.create(input), "Projeto criado.");
          if (created) navigate({ to: "/projetos/$projectId", params: { projectId: created.id } });
          return created;
        }}
      />

      {editing && (
        <ProjectFormDialog
          mode="edit"
          open
          onOpenChange={(open) => !open && setEditing(null)}
          project={editing}
          onSubmit={(input) =>
            run(() => projectRepository.update(editing.id, input), "Projeto salvo.")
          }
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Excluir projeto?"
        description={`"${deleting?.name ?? ""}" e suas tarefas serão excluídos permanentemente.`}
        onConfirm={() => {
          if (deleting) run(() => projectRepository.remove(deleting.id), "Projeto excluído.");
          setDeleting(null);
        }}
      />
    </>
  );
}
