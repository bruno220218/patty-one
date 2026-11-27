import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, Plus, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { VisitaStatusBadge } from "@/components/app/visita-status";
import { useCurrentUser, useVisitas } from "@/hooks/use-data";
import { canAgendarVisita, canSolicitarVisita, type Visita, type VisitaStatus } from "@/lib/data";
import { formatDateOnly, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/visitas/")({
  head: () => ({
    meta: [{ title: "Visitas técnicas — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: VisitasPage,
});

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

type Aba = VisitaStatus | "minhas" | "todas";

function NovaVisitaButton() {
  return (
    <Button asChild className="h-10">
      <Link to="/visitas/nova">
        <Plus />
        Solicitar visita
      </Link>
    </Button>
  );
}

function VisitasPage() {
  const { data: visitas, isPending, error } = useVisitas();
  const { data: me } = useCurrentUser();
  const podeSolicitar = canSolicitarVisita(me);
  const agenda = canAgendarVisita(me);
  const [aba, setAba] = useState<Aba | null>(null);
  const [query, setQuery] = useState("");

  const porAba = useMemo(() => {
    const all = visitas ?? [];
    const proximas = (l: Visita[]) =>
      [...l].sort((a, b) => (a.agendadaPara ?? "").localeCompare(b.agendadaPara ?? ""));
    return {
      minhas: proximas(all.filter((v) => v.status === "agendada" && v.responsavelId === me?.id)),
      solicitada: [...all.filter((v) => v.status === "solicitada")].reverse(),
      agendada: proximas(all.filter((v) => v.status === "agendada")),
      realizada: all.filter((v) => v.status === "realizada"),
      cancelada: all.filter((v) => v.status === "cancelada"),
      todas: all,
    } satisfies Record<Aba, Visita[]>;
  }, [visitas, me?.id]);

  const abaAtual: Aba =
    aba ?? (porAba.minhas.length > 0 ? "minhas" : agenda ? "solicitada" : "agendada");

  const abas: { value: Aba; label: string }[] = [
    ...(porAba.minhas.length > 0 || abaAtual === "minhas"
      ? [{ value: "minhas" as const, label: "Minhas visitas" }]
      : []),
    { value: "solicitada", label: "Aguardando agenda" },
    { value: "agendada", label: "Agendadas" },
    { value: "realizada", label: "Realizadas" },
    { value: "cancelada", label: "Canceladas" },
    { value: "todas", label: "Todas" },
  ];

  const visiveis = useMemo(() => {
    const q = fold(query.trim());
    return porAba[abaAtual].filter(
      (v) =>
        !q ||
        String(v.numero).includes(q) ||
        fold(`${v.cliente} ${v.endereco} ${v.vendedor} ${v.responsavelNome}`).includes(q),
    );
  }, [porAba, abaAtual, query]);

  return (
    <>
      <PageHeader
        title="Visitas técnicas"
        description="Comercial solicita → PCP agenda (data e quem vai) → Montagem faz a visita, preenche o formulário e anexa as fotos."
        action={podeSolicitar ? <NovaVisitaButton /> : undefined}
      />

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState icon={SearchX} title="Não foi possível carregar" description={error.message} />
      ) : visitas === null ? (
        <EmptyState
          icon={MapPin}
          title="Visitas ainda não ativadas"
          description="Falta rodar a atualização do banco."
        />
      ) : !visitas || visitas.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Nenhuma visita ainda"
          description={
            podeSolicitar
              ? "Solicite a primeira visita técnica."
              : "Quando o comercial solicitar visitas, elas aparecem aqui."
          }
          action={podeSolicitar ? <NovaVisitaButton /> : undefined}
        />
      ) : (
        <>
          <Tabs value={abaAtual} onValueChange={(v) => setAba(v as Aba)} className="mb-3">
            <TabsList className="h-auto flex-wrap">
              {abas.map((a) => (
                <TabsTrigger key={a.value} value={a.value} className="gap-1.5">
                  {a.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      (a.value === "solicitada" && agenda && porAba.solicitada.length > 0) ||
                        (a.value === "minhas" && porAba.minhas.length > 0)
                        ? "bg-status-progress text-status-progress-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {porAba[a.value].length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por cliente, endereço, número, vendedor, montador…"
              aria-label="Buscar visita"
              className="h-9 pl-9"
            />
          </div>

          {visiveis.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nada por aqui"
              description={query ? "Ajuste a busca." : "Nenhuma visita nesta aba."}
            />
          ) : (
            <ul className="surface-card divide-y divide-border overflow-hidden">
              {visiveis.map((v) => (
                <li key={v.id} className="relative px-4 py-3 transition-colors hover:bg-muted/30">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold tabular-nums">Nº {v.numero}</span>
                    <Link
                      to="/visitas/$visitaId"
                      params={{ visitaId: v.id }}
                      className="min-w-0 flex-1 truncate font-medium after:absolute after:inset-0"
                    >
                      {v.cliente}
                    </Link>
                    <VisitaStatusBadge status={v.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      v.endereco,
                      v.status === "agendada" && v.agendadaPara
                        ? `${formatDateTime(v.agendadaPara)} com ${v.responsavelNome}`
                        : v.status === "solicitada" && v.dataSugerida
                          ? `sugerida ${formatDateOnly(v.dataSugerida)}`
                          : v.status === "realizada" && v.realizadaEm
                            ? `feita em ${formatDateTime(v.realizadaEm)} por ${v.realizadaPorNome}`
                            : "",
                      `pedido por ${v.createdByNome || "alguém"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
