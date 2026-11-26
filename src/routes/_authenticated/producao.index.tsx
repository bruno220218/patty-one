import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  PlayCircle,
  Plus,
  Printer,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { Kpi, OrdemStatusBadge, TOM, selectClass } from "@/components/app/operacao-ui";
import { SkillPcpButton } from "@/components/app/skill-pcp-dialog";
import { useCurrentUser, useOrdens } from "@/hooks/use-data";
import {
  alertaPrazo,
  canGerirOperacao,
  dataBR,
  progressoOrdem,
  STATUS_ORDEM,
  textoAlertaPrazo,
  TIPOS_ORDEM,
  type StatusOrdem,
  type TipoOrdem,
} from "@/lib/data";
import { cn } from "@/lib/utils";

type Busca = { tipo: "" | TipoOrdem; status: "" | StatusOrdem; busca: string; pagina: number };
const POR_PAGINA = 50;

export const Route = createFileRoute("/_authenticated/producao/")({
  validateSearch: (s: Record<string, unknown>): Busca => ({
    tipo: TIPOS_ORDEM.includes(s["tipo"] as TipoOrdem) ? (s["tipo"] as TipoOrdem) : "",
    status: STATUS_ORDEM.includes(s["status"] as StatusOrdem) ? (s["status"] as StatusOrdem) : "",
    busca: typeof s["busca"] === "string" ? s["busca"] : "",
    pagina: Math.max(1, Math.floor(Number(s["pagina"]) || 1)),
  }),
  head: () => ({
    meta: [{ title: "Ordens de produção — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: OrdensPage,
});

function OrdensPage() {
  const { pagina, ...filtros } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: me } = useCurrentUser();
  const { data, isPending, error } = useOrdens(filtros);
  const podeGerir = canGerirOperacao(me);
  const hoje = new Date().toISOString().slice(0, 10);

  const [busca, setBusca] = useState(filtros.busca);
  useEffect(() => setBusca(filtros.busca), [filtros.busca]);
  useEffect(() => {
    if (busca === filtros.busca) return;
    const t = setTimeout(() => set({ busca }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function set(p: Partial<Busca>) {
    void navigate({ search: (a) => ({ ...a, pagina: 1, ...p }) });
  }

  const ordens = data?.ordens ?? [];
  const paginas = Math.max(1, Math.ceil(ordens.length / POR_PAGINA));
  const visiveis = ordens.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const alertas = (data?.alertas ?? []).filter((o) => !filtros.tipo || o.tipo === filtros.tipo);

  return (
    <>
      <PageHeader
        title="Ordens de produção"
        description="Ordens de instalação e impressão, com etapas, equipe e alertas de prazo."
        action={
          podeGerir && (
            <div className="flex flex-wrap gap-2">
              <SkillPcpButton />
              <Button asChild className="h-10">
                <Link to="/producao/$ordemId" params={{ ordemId: "nova" }}>
                  <Plus />
                  Nova ordem
                </Link>
              </Button>
            </div>
          )
        }
      />

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState
          icon={ClipboardList}
          title="Não foi possível abrir as ordens"
          description={error.message}
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Clock3} label="Aguardando" value={data.resumo.aguardando} tom="neutro" />
            <Kpi icon={PlayCircle} label="Em andamento" value={data.resumo.andamento} tom="aviso" />
            <Kpi
              icon={AlertTriangle}
              label="Atrasadas"
              value={data.resumo.atrasadas}
              tom="perigo"
            />
            <Kpi
              icon={CheckCircle2}
              label="Concluídas"
              value={data.resumo.concluidas}
              tom="sucesso"
            />
          </div>

          {alertas.length > 0 && (
            <section
              aria-labelledby="alertas-prazo"
              className={cn("rounded-2xl border p-5", TOM.aviso, "text-foreground")}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full border",
                      TOM.aviso,
                    )}
                  >
                    <BellRing className="size-5" />
                  </span>
                  <div>
                    <h2 id="alertas-prazo" className="font-semibold">
                      Alertas de prazo
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Ordens ativas atrasadas ou que vencem em até 3 dias
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-card">
                  {alertas.length} {alertas.length === 1 ? "alerta" : "alertas"}
                </Badge>
              </div>
              <div className="grid max-h-96 gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                {alertas.map((o) => (
                  <Link
                    key={o.id}
                    to="/producao/$ordemId"
                    params={{ ordemId: o.id }}
                    className={cn(
                      "group rounded-xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                      o.alerta.tipo === "atrasada"
                        ? "border-destructive/40"
                        : "border-amber-400/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span>Ordem nº {o.numero}</span>
                        <Badge variant="outline">{o.tipo}</Badge>
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm font-medium">{o.descricao}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {o.clienteNome || "Sem cliente"}
                    </p>
                    <p
                      className={cn(
                        "mt-3 flex items-center gap-1.5 text-xs font-semibold",
                        o.alerta.tipo === "atrasada"
                          ? "text-destructive"
                          : "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      <AlertTriangle className="size-3.5" />
                      {textoAlertaPrazo(o.alerta)}
                      <span className="font-normal text-muted-foreground">
                        · {dataBR(o.dataPrevista)}
                      </span>
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="inline-flex rounded-lg border bg-card p-1">
            <button
              type="button"
              onClick={() => set({ tipo: "" })}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition",
                !filtros.tipo
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Todas
            </button>
            {TIPOS_ORDEM.map((tipo) => (
              <button
                type="button"
                key={tipo}
                onClick={() => set({ tipo })}
                className={cn(
                  "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition",
                  filtros.tipo === tipo
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tipo === "Instalação" ? (
                  <Wrench className="size-4" />
                ) : (
                  <Printer className="size-4" />
                )}
                {tipo}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              aria-label="Buscar ordens"
              placeholder="Buscar por número, descrição, cliente ou serviço…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-10 sm:col-span-2"
            />
            <select
              aria-label="Filtrar situação"
              className={selectClass}
              value={filtros.status}
              onChange={(e) => set({ status: e.target.value as Busca["status"] })}
            >
              <option value="">Todas as situações</option>
              {STATUS_ORDEM.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <p className="text-sm text-muted-foreground">
            {ordens.length.toLocaleString("pt-BR")} {ordens.length === 1 ? "ordem" : "ordens"}
          </p>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  {["Nº", "Tipo", "Ordem / cliente", "Previsão", "Progresso", "Situação"].map(
                    (h) => (
                      <th key={h} className="p-3 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((o) => {
                  const progresso = progressoOrdem(o.etapas);
                  const alerta = alertaPrazo(o.dataPrevista, o.status, hoje);
                  return (
                    <tr key={o.id} className="border-t hover:bg-muted/40">
                      <td className="p-3 font-medium">
                        <Link
                          to="/producao/$ordemId"
                          params={{ ordemId: o.id }}
                          className="text-primary hover:underline"
                        >
                          {o.numero}
                        </Link>
                        {o.prioridade === "Urgente" && (
                          <Badge variant="destructive" className="ml-2">
                            Urgente
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          {o.tipo === "Instalação" ? (
                            <Wrench className="size-4 text-muted-foreground" />
                          ) : (
                            <Printer className="size-4 text-muted-foreground" />
                          )}
                          {o.tipo}
                        </span>
                      </td>
                      <td className="max-w-80 p-3">
                        <Link
                          to="/producao/$ordemId"
                          params={{ ordemId: o.id }}
                          className="font-medium hover:underline"
                        >
                          {o.descricao}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {o.clienteNome || "Sem cliente"}
                        </p>
                      </td>
                      <td className="p-3">
                        {o.dataPrevista ? (
                          <span
                            className={
                              alerta
                                ? alerta.tipo === "atrasada"
                                  ? "text-destructive"
                                  : "text-amber-700 dark:text-amber-400"
                                : undefined
                            }
                          >
                            {dataBR(o.dataPrevista)}
                            {alerta && (
                              <span className="mt-0.5 block text-xs font-medium">
                                {textoAlertaPrazo(alerta)}
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="min-w-32 p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${progresso}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{progresso}%</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <OrdemStatusBadge status={o.status} />
                      </td>
                    </tr>
                  );
                })}
                {!visiveis.length && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-muted-foreground">
                      <ClipboardList className="mx-auto mb-2 size-8 opacity-50" />
                      Nenhuma ordem encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {paginas > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Página anterior"
                disabled={pagina <= 1}
                onClick={() => navigate({ search: (a) => ({ ...a, pagina: pagina - 1 }) })}
              >
                <ChevronLeft />
              </Button>
              <span className="text-sm">
                {pagina} de {paginas}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Próxima página"
                disabled={pagina >= paginas}
                onClick={() => navigate({ search: (a) => ({ ...a, pagina: pagina + 1 }) })}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
