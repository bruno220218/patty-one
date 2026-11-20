import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, FileText, LogOut, Plus, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { CiSituacaoPill } from "@/components/app/ci-entrada";
import { StatusPill } from "@/components/app/status-pill";
import { useCis, useCurrentUser, usePaineis } from "@/hooks/use-data";
import {
  canCriarCi,
  ciSituacao,
  fotoPendente,
  dobrar,
  VINHETA_TIPO_LABEL,
  type Ci,
} from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cis/")({
  // ?aba=fotos / ?aba=checkout open on the photo requests (menu: Checking / Checkout Fotográfico).
  validateSearch: (search: Record<string, unknown>): { aba?: "fotos" | "checkout" } =>
    search["aba"] === "fotos" || search["aba"] === "checkout" ? { aba: search["aba"] } : {},
  head: () => ({
    meta: [{ title: "CI — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: CisPage,
});

type Aba = "aguardando" | "fotos" | "checkout" | "todas";

const periodo = (ci: Ci) =>
  ci.inicio || ci.fim
    ? `${ci.inicio ? formatDateOnly(ci.inicio).slice(0, 5) : "…"} a ${ci.fim ? formatDateOnly(ci.fim) : "sem fim"}`
    : "sem período";

function NovaCiButton() {
  return (
    <Button asChild className="h-10">
      <Link to="/cis/nova">
        <Plus />
        Nova CI
      </Link>
    </Button>
  );
}

function CisPage() {
  const { data: cis, isPending, error } = useCis();
  const { data: snap } = usePaineis();
  const { data: me } = useCurrentUser();
  const podeCriar = canCriarCi(me);
  const search = Route.useSearch();
  const [aba, setAba] = useState<Aba>(search.aba ?? "aguardando");
  useEffect(() => {
    if (search.aba) setAba(search.aba);
  }, [search.aba]);
  const [query, setQuery] = useState("");

  const codigo = useMemo(
    () => new Map((snap?.paineis ?? []).map((p) => [p.id, p] as const)),
    [snap],
  );

  const aguardando = useMemo(() => (cis ?? []).filter((c) => ciSituacao(c) !== "concluida"), [cis]);
  const fotos = useMemo(() => (cis ?? []).filter((c) => fotoPendente(c)), [cis]);
  const checkouts = useMemo(() => (cis ?? []).filter((c) => fotoPendente(c, "checkout")), [cis]);
  const visiveis = useMemo(() => {
    const q = dobrar(query.trim());
    const lista =
      aba === "aguardando"
        ? aguardando
        : aba === "fotos"
          ? fotos
          : aba === "checkout"
            ? checkouts
            : (cis ?? []);
    return lista.filter(
      (c) =>
        !q || dobrar(`${c.rotulo} ${c.cliente} ${c.titulo} ${c.representanteNome}`).includes(q),
    );
  }, [aba, aguardando, fotos, checkouts, cis, query]);

  return (
    <>
      <PageHeader
        title="CI"
        description="Comercial cria a CI e marca os painéis → a Criação dá entrada e a vinheta ocupa o espaço vago."
        action={podeCriar ? <NovaCiButton /> : undefined}
      />

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState icon={SearchX} title="Não foi possível carregar" description={error.message} />
      ) : cis === null ? (
        <EmptyState
          icon={FileText}
          title="CIs ainda não ativadas"
          description="Falta rodar a atualização do banco (migração 0013)."
        />
      ) : !cis || cis.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhuma CI ainda"
          description={
            podeCriar
              ? "Crie a primeira: cliente, período e em quais painéis a vinheta vai rodar."
              : "Quando o comercial criar CIs, elas aparecem aqui."
          }
          action={podeCriar ? <NovaCiButton /> : undefined}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
              <TabsList>
                <TabsTrigger value="aguardando" className="gap-1.5">
                  Aguardando entrada
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      aguardando.length > 0
                        ? "bg-status-progress text-status-progress-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {aguardando.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="fotos" className="gap-1.5">
                  Fotos pendentes
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      fotos.length > 0
                        ? "bg-status-progress text-status-progress-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {fotos.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="checkout" className="gap-1.5">
                  Checkout pendente
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      checkouts.length > 0
                        ? "bg-status-progress text-status-progress-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {checkouts.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="todas">Todas</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nº, cliente ou representante…"
                aria-label="Buscar CI"
                className="h-9 pl-9"
              />
            </div>
          </div>

          {visiveis.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nada por aqui"
              description={
                query
                  ? "Ajuste a busca."
                  : aba === "fotos"
                    ? "Nenhuma foto pendente."
                    : aba === "checkout"
                      ? "Nenhum checkout pendente."
                      : "Nenhuma CI aguardando entrada."
              }
            />
          ) : (
            <ul className="surface-card divide-y divide-border overflow-hidden">
              {visiveis.map((ci) => (
                <li
                  key={ci.id}
                  className="relative px-4 py-2.5 transition-colors hover:bg-muted/30"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="w-14 shrink-0 text-sm font-semibold tabular-nums">
                      {ci.rotulo}
                    </span>
                    <Link
                      to="/cis/$ciId"
                      params={{ ciId: ci.id }}
                      className="min-w-0 flex-1 truncate font-medium after:absolute after:inset-0"
                    >
                      {ci.cliente}
                      {ci.titulo && ci.titulo !== ci.cliente && (
                        <span className="font-normal text-muted-foreground"> · {ci.titulo}</span>
                      )}
                    </Link>
                    {fotoPendente(ci) && (
                      <StatusPill tone="progress" icon={Camera}>
                        Foto pedida
                      </StatusPill>
                    )}
                    {fotoPendente(ci, "checkout") && (
                      <StatusPill tone="progress" icon={LogOut}>
                        Checkout pedido
                      </StatusPill>
                    )}
                    <CiSituacaoPill ci={ci} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0 sm:pl-[4.25rem]">
                    <span className="flex flex-wrap gap-1">
                      {ci.paineis
                        .map((cp) => ({ cp, p: codigo.get(cp.painelId) }))
                        .sort((a, b) => (a.p?.ordem ?? 0) - (b.p?.ordem ?? 0))
                        .map(({ cp, p }) => (
                          <span
                            key={cp.id}
                            title={
                              cp.status === "pendente"
                                ? "Aguardando entrada"
                                : cp.status === "aprovada"
                                  ? `Entrou no espaço ${cp.posicao}`
                                  : `Recusada: ${cp.motivo}`
                            }
                            className={cn(
                              "rounded px-1.5 py-px text-[11px] font-semibold",
                              cp.status === "pendente" &&
                                "bg-status-progress text-status-progress-foreground",
                              cp.status === "aprovada" &&
                                "bg-status-done text-status-done-foreground",
                              cp.status === "recusada" &&
                                "bg-destructive/10 text-destructive line-through",
                            )}
                          >
                            {p?.codigo ?? "?"}
                          </span>
                        ))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[periodo(ci), VINHETA_TIPO_LABEL[ci.tipo], ci.representanteNome]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
