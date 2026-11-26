import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ChecklistCard } from "@/components/app/checklist-card";
import { ChecklistFormDialog } from "@/components/app/checklist-form-dialog";
import { ChecklistPadraoOrdens } from "@/components/app/checklist-padrao-ordens";
import { ProjectFormDialog } from "@/components/app/project-form-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { currentUserQuery, useChecklists, useDataAction } from "@/hooks/use-data";
import {
  canGerirChecklists,
  checklistRepository,
  projectRepository,
  type Checklist,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/checklists/")({
  // Gestão and PCP only (the database applies the same rule).
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(currentUserQuery());
    if (!canGerirChecklists(me)) throw redirect({ to: "/projetos" });
  },
  head: () => ({
    meta: [
      { title: "Checklists — Patty One" },
      {
        name: "description",
        content: "Crie e organize checklists reutilizáveis para iniciar seus projetos.",
      },
      { property: "og:title", content: "Checklists — Patty One" },
      {
        property: "og:description",
        content: "Crie e organize checklists reutilizáveis para iniciar seus projetos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChecklistsPage,
});

function ChecklistsPage() {
  const { data: checklists, isPending } = useChecklists();
  const run = useDataAction();
  const navigate = useNavigate();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Checklist | null>(null);
  const [deleting, setDeleting] = useState<Checklist | null>(null);
  const [projectFrom, setProjectFrom] = useState<Checklist | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Checklists"
        description="Modelos reutilizáveis para criar projetos."
        action={
          <Button onClick={openCreate} className="h-10">
            <Plus />
            Novo checklist
          </Button>
        }
      />

      {checklists && checklists.length > 0 && <ChecklistPadraoOrdens checklists={checklists} />}

      {isPending ? (
        <CardGridSkeleton />
      ) : !checklists || checklists.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nenhum checklist ainda"
          description="Crie seu primeiro checklist com as tarefas que se repetem nos seus projetos."
          action={
            <Button onClick={openCreate}>
              <Plus />
              Criar checklist
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {checklists.map((c) => (
            <ChecklistCard
              key={c.id}
              checklist={c}
              onCreateProject={() => setProjectFrom(c)}
              onEdit={() => {
                setEditing(c);
                setFormOpen(true);
              }}
              onDuplicate={() =>
                run(() => checklistRepository.duplicate(c.id), "Checklist duplicado.")
              }
              onDelete={() => setDeleting(c)}
            />
          ))}
        </div>
      )}

      <ChecklistFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        checklist={editing}
        onSubmit={async (input) => {
          if (editing) {
            return run(() => checklistRepository.update(editing.id, input), "Checklist salvo.");
          }
          const created = await run(() => checklistRepository.create(input), "Checklist criado.");
          if (created) {
            navigate({ to: "/checklists/$checklistId", params: { checklistId: created.id } });
          }
          return created;
        }}
      />

      <ProjectFormDialog
        mode="create"
        open={projectFrom !== null}
        onOpenChange={(open) => !open && setProjectFrom(null)}
        checklists={checklists ?? []}
        defaultChecklistId={projectFrom?.id ?? null}
        onSubmit={async (input) => {
          const created = await run(() => projectRepository.create(input), "Projeto criado.");
          if (created) navigate({ to: "/projetos/$projectId", params: { projectId: created.id } });
          return created;
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Excluir checklist?"
        description={`"${deleting?.name ?? ""}" vai para a Lixeira, onde fica 30 dias. Projetos já criados a partir dele não serão afetados.`}
        onConfirm={() => {
          if (deleting) run(() => checklistRepository.remove(deleting.id), "Checklist excluído.");
          setDeleting(null);
        }}
      />
    </>
  );
}
