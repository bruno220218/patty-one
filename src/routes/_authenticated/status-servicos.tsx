import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, AlertTriangle, Search, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { ProjectProgressBar } from "@/components/app/project-progress";
import { useCurrentUser, useLiberacoes, useProjects } from "@/hooks/use-data";
import {
  dobrar,
  etapaAtual,
  isOverdue,
  localToday,
  projectProgress,
  projectStatus,
  type Liberacao,
  type Project,
  type ProjectStatus,
} from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Status Serviços: a read-only view of the projects kanban that PCP keeps, for Comercial to
 * follow each job (and answer the client) without changing anything. Client and vendedor come
 * from the liberação that created the project.
 */
export const Route = createFileRoute("/_authenticated/status-servicos")({
  head: () => ({
    meta: [{ title: "Status Serviços — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: StatusServicosPage,
});

const COLUNAS: { status: ProjectStatus; titulo: string }[] = [
  { status: "not_started", titulo: "Não iniciados" },
  { status: "in_progress", titulo: "Em andamento" },
  { status: "done", titulo: "Concluídos" },
];

function CartaoServico({
  project,
  lib,
  today,
}: {
  project: Project;
  lib: Liberacao | undefined;
  today: string;
}) {
  const { done, total } = projectProgress(project.tasks);
  const etapa = etapaAtual(project.tasks);
  const bloqueios = project.blockers.filter((b) => !b.resolvedAt);
  const atrasado = isOverdue(project, today);
  return (
    <li className="surface-card relative p-4 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-sm font-semibold">
          <Link
            to="/projetos/$projectId"
            params={{ projectId: project.id }}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
          >
            {project.name}
          </Link>
        </h3>
        <StatusBadge status={projectStatus(project.tasks)} />
      </div>
      {(lib || project.clientInfo.serviceType) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {[
            lib?.cliente,
            lib?.vendedor && `vendedor ${lib.vendedor}`,
            lib && `liberação nº ${lib.numero}`,
            project.clientInfo.serviceType,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <div className="mt-3">
        <ProjectProgressBar tasks={project.tasks} />
      </div>
      <p className="mt-2 text-xs">
        {etapa ? (
          <>
            <span className="text-muted-foreground">Etapa atual: </span>
            <span className="font-medium">{etapa}</span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {total === 0 ? "PCP ainda não montou as etapas" : "Todas as etapas concluídas"}
          </span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {done}/{total} {total === 1 ? "etapa" : "etapas"}
        </span>
        <span className={cn(atrasado && "font-semibold text-destructive")}>
          {project.dueDate
            ? `${atrasado ? "Atrasado · prazo" : "Prazo"} ${formatDateOnly(project.dueDate)}`
            : "Sem prazo"}
        </span>
      </div>
      {bloqueios.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">
            {bloqueios.length === 1
              ? `Impedimento: ${bloqueios[0]?.description ?? ""}`
              : `${bloqueios.length} impedimentos em aberto`}
          </span>
        </p>
      )}
    </li>
  );
}

function StatusServicosPage() {
  const { data: projects, isPending, error } = useProjects(false);
  const { data: liberacoes } = useLiberacoes();
  const { data: me } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [soMeus, setSoMeus] = useState(false);
  const today = localToday();

  // The liberação that produced each project (approval links it), for client and vendedor.
  const libPorProjeto = useMemo(
    () =>
      new Map(
        (liberacoes ?? [])
          .filter((l) => l.projectId)
          .map((l) => [l.projectId as string, l] as const),
      ),
    [liberacoes],
  );

  const meuNome = dobrar(me?.name ?? "");
  const visiveis = useMemo(() => {
    const q = dobrar(query.trim());
    return (projects ?? []).filter((p) => {
      const lib = libPorProjeto.get(p.id);
      if (
        soMeus &&
        (!meuNome || !dobrar(lib?.vendedor ?? "").includes(meuNome.split(" ")[0] ?? ""))
      )
        return false;
      return (
        !q ||
        dobrar(
          `${p.name} ${p.clientInfo.serviceType} ${lib?.cliente ?? ""} ${lib?.vendedor ?? ""} ${lib?.numero ?? ""}`,
        ).includes(q)
      );
    });
  }, [projects, libPorProjeto, query, soMeus, meuNome]);

  const porColuna = useMemo(() => {
    const ordenar = (l: Project[]) =>
      [...l].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    return Object.fromEntries(
      COLUNAS.map((c) => [
        c.status,
        ordenar(visiveis.filter((p) => projectStatus(p.tasks) === c.status)),
      ]),
    ) as Record<ProjectStatus, Project[]>;
  }, [visiveis]);

  return (
    <>
      <PageHeader
        title="Status Serviços"
        description="O andamento de cada serviço, direto do kanban de projetos que o PCP preenche. Só leitura."
      />

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState icon={SearchX} title="Não foi possível carregar" description={error.message} />
      ) : !projects || projects.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Nenhum serviço em andamento"
          description="Quando o PCP aprovar uma liberação e montar o projeto, ele aparece aqui."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por serviço, cliente, vendedor ou nº da liberação…"
                aria-label="Buscar serviço"
                className="h-9 pl-9"
              />
            </div>
            {me && (
              <div className="flex items-center gap-2">
                <Switch id="so-meus" checked={soMeus} onCheckedChange={setSoMeus} />
                <Label htmlFor="so-meus" className="text-sm">
                  Só os meus clientes
                </Label>
              </div>
            )}
          </div>

          {visiveis.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nada por aqui"
              description={
                soMeus
                  ? "Nenhum serviço com você como vendedor. Desligue o filtro para ver todos."
                  : "Ajuste a busca."
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {COLUNAS.map((c) => (
                <section key={c.status} aria-labelledby={`col-${c.status}`} className="min-w-0">
                  <h2
                    id={`col-${c.status}`}
                    className="mb-2 flex items-center gap-2 text-sm font-semibold"
                  >
                    {c.titulo}
                    <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                      {porColuna[c.status].length}
                    </span>
                  </h2>
                  {porColuna[c.status].length === 0 ? (
                    <p className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                      Nenhum serviço
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {porColuna[c.status].map((p) => (
                        <CartaoServico
                          key={p.id}
                          project={p}
                          lib={libPorProjeto.get(p.id)}
                          today={today}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
