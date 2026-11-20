import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarX, ChevronLeft, ChevronRight, FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { selectClass } from "@/components/app/operacao-ui";
import { COR_STATUS_OCUPACAO, OcupacaoGrid } from "@/components/app/ocupacao-grid";
import { useCalendarioBissemanas, useOcupacao, usePontosMidia } from "@/hooks/use-data";
import {
  alternarStatus,
  bissemanaAtual,
  bissemanasDoAno,
  contarPorStatus,
  criarMapaOcupacao,
  diaMes,
  filtrarPorOcupacao,
  hojeISO,
  rotuloBissemana,
  TODOS_STATUS_OCUPACAO,
  type StatusOcupacao,
} from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/midia-ooh/bissemanas")({
  head: () => ({
    meta: [{ title: "Datas de colagens — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: BissemanasPage,
});

function BissemanasPage() {
  const pontos = usePontosMidia();
  const calendario = useCalendarioBissemanas();
  if (pontos.isPending || calendario.isPending) return <CardGridSkeleton />;
  if (pontos.error || calendario.error) {
    return (
      <EmptyState
        icon={CalendarX}
        title="Não foi possível abrir as bi-semanas"
        description={(pontos.error ?? calendario.error)?.message ?? ""}
      />
    );
  }
  return <Painel pontos={pontos.data} calendario={calendario.data} />;
}

function Painel({
  pontos,
  calendario,
}: {
  pontos: NonNullable<ReturnType<typeof usePontosMidia>["data"]>;
  calendario: NonNullable<ReturnType<typeof useCalendarioBissemanas>["data"]>;
}) {
  const atual = bissemanaAtual(hojeISO(), calendario);
  const anos = [...new Set(calendario.map((b) => b.ano))].sort((a, b) => a - b);
  const [ano, setAno] = useState(atual.numero ? atual.ano : (anos[anos.length - 1] ?? atual.ano));
  const [busca, setBusca] = useState("");
  const [bis, setBis] = useState(atual.numero || 1);
  const [statuses, setStatuses] = useState<StatusOcupacao[]>([]);

  const dias = useMemo(() => bissemanasDoAno(ano, calendario), [ano, calendario]);
  const numero = Math.max(1, Math.min(bis, dias.length));
  const periodo = dias[numero - 1];
  const { data: ocupacao = [] } = useOcupacao(ano);
  const mapa = useMemo(() => criarMapaOcupacao(ocupacao), [ocupacao]);

  // Inactive points don't take new campaigns; they stay out of this view.
  const buscados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pontos.filter(
      (p) =>
        p.status !== "Inativo" &&
        (!q || [p.nome, p.codigo, p.cidade].some((v) => v.toLowerCase().includes(q))),
    );
  }, [pontos, busca]);
  const contagem = useMemo(() => contarPorStatus(buscados, mapa, numero), [buscados, mapa, numero]);
  const lista = useMemo(
    () => filtrarPorOcupacao(buscados, mapa, numero, statuses),
    [buscados, mapa, numero, statuses],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar aos pontos">
          <Link to="/midia-ooh" search={{ busca: "", tipo: "", status: "" }}>
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Datas de colagens</h1>
          <p className="text-sm text-muted-foreground">
            Ocupação de cada ponto por bi-semana (calendário oficial do SIGE).
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Ano anterior"
            disabled={!anos.includes(ano - 1)}
            onClick={() => setAno((a) => a - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="w-14 text-center font-semibold">{ano}</span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Próximo ano"
            disabled={!anos.includes(ano + 1)}
            onClick={() => setAno((a) => a + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {!periodo ? (
        <EmptyState
          icon={CalendarX}
          title={`Sem calendário para ${ano}`}
          description="Peça à gestão para gerar o ano."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              aria-label="Buscar pontos"
              placeholder="Buscar por nome, código ou cidade…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-10 max-w-md"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Bi-semana
              <select
                aria-label="Filtrar por bi-semana"
                className={cn(selectClass, "w-auto text-foreground")}
                value={numero}
                onChange={(e) => setBis(Number(e.target.value))}
              >
                {dias.map((b) => (
                  <option key={b.numero} value={b.numero}>
                    {rotuloBissemana(b)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
            <span className="text-sm text-muted-foreground">Situação na B{periodo.codigoSige}</span>
            <div
              role="group"
              aria-label="Filtrar por situação"
              className="flex flex-wrap items-center gap-2"
            >
              {TODOS_STATUS_OCUPACAO.map((s) => {
                const on = statuses.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setStatuses((v) => alternarStatus(v, s))}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
                      on
                        ? cn("border-transparent shadow-sm", COR_STATUS_OCUPACAO[s])
                        : "bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <span className={cn("size-2.5 rounded-full", COR_STATUS_OCUPACAO[s])} />
                    {s}
                    <span className="font-semibold tabular-nums">{contagem[s]}</span>
                  </button>
                );
              })}
            </div>
            {statuses.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setStatuses([])}>
                <FilterX />
                Limpar
              </Button>
            )}
            <span className="ml-auto text-sm text-muted-foreground">
              {lista.length} de {buscados.length} pontos · B{periodo.codigoSige} (
              {diaMes(periodo.inicio)}–{diaMes(periodo.fim)})
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Clique no cabeçalho de uma bi-semana para filtrar por ela. Pontos inativos não aparecem
            aqui.
          </p>
          <OcupacaoGrid
            pontos={lista.map((p) => ({ id: p.id, nome: p.nome, codigo: p.codigo }))}
            ano={ano}
            calendario={calendario}
            destacarBissemana={numero}
            onSelecionarBissemana={setBis}
          />
        </>
      )}
    </div>
  );
}
