import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderOpen, Plus, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ProjectCard } from "@/components/app/project-card";
import { ProjectFormDialog } from "@/components/app/project-form-dialog";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ProjectFiltersBar, type ProjectView } from "@/components/app/project-filters-bar";
import { ProjectList } from "@/components/app/project-list";
import { useChecklists, useDataAction, useProjects } from "@/hooks/use-data";
import {
  DEFAULT_PROJECT_FILTERS,
  filterAndSortProjects,
  localToday,
  projectRepository,
  type Project,
  type ProjectFilters,
  type ProjectSort,
} from "@/lib/data";

const VIEW_KEY = "patty.projetos.view";
const SORT_KEY = "patty.projetos.sort";

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode etc.): the choice just isn't remembered.
  }
}

export const Route = createFileRoute("/_authenticated/projetos/")({
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
  const [view, setView] = useState<ProjectView>("kanban");
  const [filters, setFilters] = useState<ProjectFilters>(DEFAULT_PROJECT_FILTERS);
  const today = localToday();

  // Remember the chosen view and sort on this browser.
  useEffect(() => {
    const v = readStored(VIEW_KEY);
    if (v === "kanban" || v === "lista") setView(v);
    const sort = readStored(SORT_KEY);
    if (sort) setFilters((f) => ({ ...f, sort: sort as ProjectSort }));
  }, []);

  const visible = useMemo(
    () => filterAndSortProjects(projects ?? [], filters, today),
    [projects, filters, today],
  );

  const actions = {
    onEdit: (p: Project) => setEditing(p),
    onDuplicate: (p: Project) => run(() => projectRepository.duplicate(p.id), "Projeto duplicado."),
    onArchive: (p: Project) =>
      run(() => projectRepository.setArchived(p.id, true), "Projeto arquivado."),
    onDelete: (p: Project) => setDeleting(p),
  };

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
        <>
          <ProjectFiltersBar
            filters={filters}
            onChange={(next) => {
              setFilters(next);
              if (next.sort !== filters.sort) store(SORT_KEY, next.sort);
            }}
            view={view}
            onViewChange={(v) => {
              setView(v);
              store(VIEW_KEY, v);
            }}
            shown={visible.length}
            total={projects.length}
          />
          {visible.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nenhum projeto encontrado"
              description="Ajuste a busca ou os filtros para ver outros projetos."
              action={
                <Button
                  variant="outline"
                  onClick={() => setFilters({ ...DEFAULT_PROJECT_FILTERS, sort: filters.sort })}
                >
                  Limpar filtros
                </Button>
              }
            />
          ) : view === "lista" ? (
            <ProjectList projects={visible} today={today} {...actions} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onEdit={() => actions.onEdit(p)}
                  onDuplicate={() => actions.onDuplicate(p)}
                  onArchive={() => actions.onArchive(p)}
                  onDelete={() => actions.onDelete(p)}
                />
              ))}
            </div>
          )}
        </>
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
