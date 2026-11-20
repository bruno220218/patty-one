import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Plus, Ruler, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { VisitaStatusBadge } from "@/components/app/visita-status";
import { useCurrentUser, useVisitas } from "@/hooks/use-data";
import { canSolicitarVisita, type Visita } from "@/lib/data";
import { formatDateOnly, formatDateTime } from "@/lib/format";

/**
 * Medidas: the measurements taken in technical visits, for Criação, Projetos Especiais and
 * Comercial to look up. Read-only — the visit itself (form + photos) is edited in Visitas técnicas.
 */
export const Route = createFileRoute("/_authenticated/medidas")({
  head: () => ({
    meta: [{ title: "Medidas — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: MedidasPage,
});

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

type Aba = "feitas" | "aguardando";

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  if (!valor.trim()) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{rotulo}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm">{valor}</dd>
    </div>
  );
}

function CartaoMedida({ v }: { v: Visita }) {
  const vi = v.vistoria;
  return (
    <li className="surface-card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm font-semibold tabular-nums">Nº {v.numero}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{v.cliente}</span>
        <VisitaStatusBadge status={v.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {[
          v.endereco,
          v.status === "realizada" && v.realizadaEm
            ? `medido em ${formatDateTime(v.realizadaEm)} por ${v.realizadaPorNome || "alguém"}`
            : v.status === "agendada" && v.agendadaPara
              ? `agendada para ${formatDateTime(v.agendadaPara)} com ${v.responsavelNome}`
              : v.dataSugerida
                ? `sugerida ${formatDateOnly(v.dataSugerida)}`
                : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Medidas a serem realizadas" valor={v.descricao} />
        <Campo rotulo="Local da medida" valor={vi.localMedida.join(", ")} />
        <Campo rotulo="Avaliação da obra" valor={vi.avaliacaoObra} />
        <Campo rotulo="Superfícies" valor={vi.superficies.join(", ")} />
        <Campo rotulo="Dificuldades" valor={vi.dificuldades} />
      </dl>
      <div className="mt-3 flex justify-end">
        <Button asChild variant="outline" className="h-9">
          <Link to="/visitas/$visitaId" params={{ visitaId: v.id }}>
            Formulário e fotos
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </li>
  );
}

function MedidasPage() {
  const { data: visitas, isPending, error } = useVisitas();
  const { data: me } = useCurrentUser();
  const [aba, setAba] = useState<Aba>("feitas");
  const [query, setQuery] = useState("");

  const porAba = useMemo(() => {
    const all = visitas ?? [];
    return {
      feitas: all
        .filter((v) => v.status === "realizada")
        .sort((a, b) => (b.realizadaEm ?? "").localeCompare(a.realizadaEm ?? "")),
      aguardando: all.filter((v) => v.status === "solicitada" || v.status === "agendada"),
    } satisfies Record<Aba, Visita[]>;
  }, [visitas]);

  const visiveis = useMemo(() => {
    const q = fold(query.trim());
    return porAba[aba].filter(
      (v) =>
        !q ||
        String(v.numero).includes(q) ||
        fold(`${v.cliente} ${v.endereco} ${v.descricao} ${v.realizadaPorNome}`).includes(q),
    );
  }, [porAba, aba, query]);

  return (
    <>
      <PageHeader
        title="Medidas"
        description="As medidas tiradas nas visitas técnicas. Para pedir uma nova medida, solicite uma visita técnica."
        action={
          canSolicitarVisita(me) ? (
            <Button asChild className="h-10">
              <Link to="/visitas/nova">
                <Plus />
                Solicitar visita técnica
              </Link>
            </Button>
          ) : undefined
        }
      />

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState icon={SearchX} title="Não foi possível carregar" description={error.message} />
      ) : !visitas || visitas.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title="Nenhuma medida ainda"
          description="Quando a montagem fizer as visitas técnicas, as medidas aparecem aqui."
        />
      ) : (
        <>
          <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="mb-3">
            <TabsList>
              <TabsTrigger value="feitas" className="gap-1.5">
                Medidas feitas
                <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {porAba.feitas.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="aguardando" className="gap-1.5">
                Aguardando visita
                <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {porAba.aguardando.length}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por cliente, endereço, número, medida…"
              aria-label="Buscar medida"
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
            <ul className="space-y-3">
              {visiveis.map((v) => (
                <CartaoMedida key={v.id} v={v} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
