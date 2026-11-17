import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ProjectCard } from "@/components/app/project-card";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useDataAction, useProjects } from "@/hooks/use-data";
import { projectRepository, type Project } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/arquivados")({
  head: () => ({
    meta: [
      { title: "Arquivados — Patty One" },
      {
        name: "description",
        content: "Projetos arquivados na Patty One. Restaure quando precisar.",
      },
      { property: "og:title", content: "Arquivados — Patty One" },
      {
        property: "og:description",
        content: "Projetos arquivados na Patty One. Restaure quando precisar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArchivedPage,
});

function ArchivedPage() {
  const { data: projects, isPending } = useProjects(true);
  const run = useDataAction();
  const [deleting, setDeleting] = useState<Project | null>(null);

  return (
    <>
      <PageHeader
        title="Arquivados"
        description="Projetos guardados. Restaure quando precisar."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/lixeira">
              <Trash2 className="mr-1.5 h-4 w-4" />
              Lixeira
            </Link>
          </Button>
        }
      />

      {isPending ? (
        <CardGridSkeleton />
      ) : !projects || projects.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="Nada arquivado"
          description="Projetos que você arquivar aparecem aqui e podem ser restaurados a qualquer momento."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onRestore={() =>
                run(() => projectRepository.setArchived(p.id, false), "Projeto restaurado.")
              }
              onDuplicate={() => run(() => projectRepository.duplicate(p.id), "Projeto duplicado.")}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Excluir projeto?"
        description={`"${deleting?.name ?? ""}" e suas tarefas vão para a Lixeira, onde ficam 30 dias.`}
        onConfirm={() => {
          if (deleting) run(() => projectRepository.remove(deleting.id), "Projeto excluído.");
          setDeleting(null);
        }}
      />
    </>
  );
}
