import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Camera,
  Search,
  SearchX,
  UsersRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { ProjectProgressBar } from "@/components/app/project-progress";
import { OrdemStatusBadge } from "@/components/app/operacao-ui";
import { useCurrentUser, useLiberacoes, useProjects, useStatusServicos } from "@/hooks/use-data";
import {
  abreviarNome,
  alertaPrazo,
  colunaDaOrdem,
  colunaDoProjeto,
  COLUNAS_SERVICO,
  dataBR,
  dobrar,
  situacaoDaOrdem,
  textoAlertaPrazo,
  type ColunaServico,
  type ServicoOrdem,
  etapaAtual,
  isOverdue,
  localToday,
  projectProgress,
  projectStatus,
  type Liberacao,
  type Project,
} from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Status Serviços (fluxo de produção, etapa 8): read-only, for Comercial to follow each job and
 * answer the client. It reads the production orders (step, deadline, date in Programação, team,
 * photos); the old projects (liberações approved before the orders) show until they finish.
 */
export const Route = createFileRoute("/_authenticated/status-servicos")({
  head: () => ({
    meta: [{ title: "Status Serviços — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: StatusServicosPage,
});

type Cartao =
  | { tipo: "ordem"; id: string; prazo: string | null; ordem: ServicoOrdem }
  | {
      tipo: "projeto";
      id: string;
      prazo: string | null;
      project: Project;
      lib: Liberacao | undefined;
    };

function CartaoOrdem({ o, today }: { o: ServicoOrdem; today: string }) {
  const alerta = alertaPrazo(o.dataPrevista, o.status, today);
  const pct = o.totalEtapas ? Math.round((o.etapasConcluidas / o.totalEtapas) * 100) : 0;
  const p = o.programacao;
  return (
    <li className="surface-card relative p-4 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-sm font-semibold">
          <Link
            to="/producao/$ordemId"
            params={{ ordemId: o.id }}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
          >
            Ordem nº {o.numero} · {o.descricao}
          </Link>
        </h3>
        <OrdemStatusBadge status={o.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {[
          o.cliente,
          o.vendedor && `vendedor ${o.vendedor}`,
          o.pedidoNumero
            ? `pedido ${o.pedidoNumero}`
            : o.motivoSemPedido && `sem pedido (${o.motivoSemPedido})`,
          o.liberacaoNumero && `liberação nº ${o.liberacaoNumero}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {o.totalEtapas > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-2 text-xs font-medium">
        {situacaoDaOrdem(o.status, o.etapaAtual, o.totalEtapas)}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {o.etapasConcluidas}/{o.totalEtapas} {o.totalEtapas === 1 ? "etapa" : "etapas"}
        </span>
        <span className={cn(alerta?.tipo === "atrasada" && "font-semibold text-destructive")}>
          {o.dataPrevista
            ? `${alerta ? `${textoAlertaPrazo(alerta)} · ` : ""}prazo ${dataBR(o.dataPrevista)}`
            : "Sem prazo"}
        </span>
      </div>
      {p && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="mt-px size-3.5 shrink-0" />
          <span>
            {p.proxima ? "Programado para" : "Última programação:"} {dataBR(p.data)}
            {p.equipe ? ` · ${p.equipe}` : ""}
            {!p.proxima ? ` (${p.status})` : ""}
          </span>
        </p>
      )}
      {o.equipe.length > 0 && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
          <UsersRound className="mt-px size-3.5 shrink-0" />
          <span>{o.equipe.map(abreviarNome).join(", ")}</span>
        </p>
      )}
      {o.fotos.length > 0 && (
        <p className="relative z-10 mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <Camera className="size-3.5 shrink-0 text-muted-foreground" />
          {o.fotos.slice(0, 3).map((f, i) => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
              title={f.nome}
            >
              foto {i + 1}
            </a>
          ))}
          {o.fotos.length > 3 && (
            <span className="text-muted-foreground">+{o.fotos.length - 3}</span>
          )}
        </p>
      )}
    </li>
  );
}

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
        <span className="text-muted-foreground">Projeto (caminho antigo) · </span>
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
  const ordens = useStatusServicos();
  const { data: projects, isPending: projetosCarregando } = useProjects(false);
  const { data: liberacoes } = useLiberacoes();
  const { data: me } = useCurrentUser();
  const [query, setQuery] = useState("");
  const [soMeus, setSoMeus] = useState(false);
  const today = localToday();

  // The liberação that produced each old project (approval links it), for client and vendedor.
  const libPorProjeto = useMemo(
    () =>
      new Map(
        (liberacoes ?? [])
          .filter((l) => l.projectId)
          .map((l) => [l.projectId as string, l] as const),
      ),
    [liberacoes],
  );

  const meuNome = dobrar(me?.name ?? "").split(" ")[0] ?? "";
  const porColuna = useMemo(() => {
    const q = dobrar(query.trim());
    const meu = (vendedor: string) => Boolean(meuNome) && dobrar(vendedor).includes(meuNome);
    const grupos = Object.fromEntries(COLUNAS_SERVICO.map((c) => [c.id, [] as Cartao[]])) as Record<
      ColunaServico,
      Cartao[]
    >;
    for (const o of ordens.data ?? []) {
      const coluna = colunaDaOrdem(o.status);
      if (!coluna || (soMeus && !meu(o.vendedor))) continue;
      const texto = `${o.numero} ${o.descricao} ${o.cliente} ${o.vendedor} ${o.pedidoNumero ?? ""} ${o.liberacaoNumero ?? ""}`;
      if (q && !dobrar(texto).includes(q)) continue;
      grupos[coluna].push({ tipo: "ordem", id: o.id, prazo: o.dataPrevista, ordem: o });
    }
    for (const p of projects ?? []) {
      const coluna = colunaDoProjeto(projectStatus(p.tasks));
      const lib = libPorProjeto.get(p.id);
      if (!coluna || (soMeus && !meu(lib?.vendedor ?? ""))) continue;
      const texto = `${p.name} ${p.clientInfo.serviceType} ${lib?.cliente ?? ""} ${lib?.vendedor ?? ""} ${lib?.numero ?? ""}`;
      if (q && !dobrar(texto).includes(q)) continue;
      grupos[coluna].push({ tipo: "projeto", id: p.id, prazo: p.dueDate, project: p, lib });
    }
    for (const c of COLUNAS_SERVICO) {
      grupos[c.id].sort((a, b) =>
        c.id === "concluido"
          ? (b.prazo ?? "").localeCompare(a.prazo ?? "")
          : (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"),
      );
    }
    return grupos;
  }, [ordens.data, projects, libPorProjeto, query, soMeus, meuNome]);

  const total = COLUNAS_SERVICO.reduce((n, c) => n + porColuna[c.id].length, 0);
  const vazio =
    !(ordens.data ?? []).length &&
    !(projects ?? []).some((p) => colunaDoProjeto(projectStatus(p.tasks)));

  return (
    <>
      <PageHeader
        title="Status Serviços"
        description="Onde está cada serviço: etapa, prazo, data na Programação, equipe e fotos, direto das ordens de produção. Só leitura."
      />

      {ordens.isPending || projetosCarregando ? (
        <CardGridSkeleton />
      ) : ordens.error ? (
        <EmptyState
          icon={SearchX}
          title="Não foi possível carregar"
          description={ordens.error.message}
        />
      ) : vazio ? (
        <EmptyState
          icon={Activity}
          title="Nenhum serviço em andamento"
          description="Quando uma liberação ligada a um pedido for criada, as ordens dela aparecem aqui."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por serviço, cliente, vendedor, nº da ordem, do pedido ou da liberação…"
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

          {total === 0 ? (
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {COLUNAS_SERVICO.map((c) => (
                <section key={c.id} aria-labelledby={`col-${c.id}`} className="min-w-0">
                  <h2
                    id={`col-${c.id}`}
                    className="mb-2 flex items-center gap-2 text-sm font-semibold"
                  >
                    {c.titulo}
                    <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                      {porColuna[c.id].length}
                    </span>
                  </h2>
                  {porColuna[c.id].length === 0 ? (
                    <p className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                      Nenhum serviço
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {porColuna[c.id].map((x) =>
                        x.tipo === "ordem" ? (
                          <CartaoOrdem key={x.id} o={x.ordem} today={today} />
                        ) : (
                          <CartaoServico key={x.id} project={x.project} lib={x.lib} today={today} />
                        ),
                      )}
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
