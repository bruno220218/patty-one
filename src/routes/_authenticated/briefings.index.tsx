import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lightbulb, Plus, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { BriefingStatusBadge } from "@/components/app/briefing-status";
import { useBriefings, useCurrentUser } from "@/hooks/use-data";
import {
  BRIEFING_DESTINO_LABEL,
  canAtenderBriefing,
  canCriarBriefing,
  type Briefing,
  type BriefingDestino,
  type BriefingStatus,
} from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/briefings/")({
  head: () => ({
    meta: [{ title: "Briefings — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: BriefingsPage,
});

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

type Aba = BriefingStatus | "todos";
const ABAS: { value: Aba; label: string }[] = [
  { value: "novo", label: "Novos" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluídos" },
  { value: "todos", label: "Todos" },
];

function NovoBriefingButton() {
  return (
    <Button asChild className="h-10">
      <Link to="/briefings/novo">
        <Plus />
        Novo briefing
      </Link>
    </Button>
  );
}

function BriefingsPage() {
  const { data: briefings, isPending, error } = useBriefings();
  const { data: me } = useCurrentUser();
  const podeCriar = canCriarBriefing(me);
  const atende = canAtenderBriefing(me);
  const [aba, setAba] = useState<Aba>("novo");
  const [destino, setDestino] = useState<"todos" | BriefingDestino>("todos");
  const [query, setQuery] = useState("");

  // Who handles only one area starts filtered on it.
  const meuDestino: BriefingDestino | null =
    me && !me.isGestor
      ? me.funcoes.includes("projetos_especiais") && !me.funcoes.includes("criacao")
        ? "projetos_especiais"
        : me.funcoes.includes("criacao") && !me.funcoes.includes("projetos_especiais")
          ? "criacao"
          : null
      : null;
  const [destinoTocado, setDestinoTocado] = useState(false);
  const destinoAtual = destinoTocado ? destino : (meuDestino ?? "todos");

  const porAba = useMemo(() => {
    const all = (briefings ?? []).filter(
      (b) => destinoAtual === "todos" || b.destino === destinoAtual,
    );
    return {
      novo: all.filter((b) => b.status === "novo"),
      em_andamento: all.filter((b) => b.status === "em_andamento"),
      concluido: all.filter((b) => b.status === "concluido"),
      todos: all,
    } satisfies Record<Aba, Briefing[]>;
  }, [briefings, destinoAtual]);

  const visiveis = useMemo(() => {
    const q = fold(query.trim());
    return porAba[aba].filter(
      (b) =>
        !q ||
        String(b.numero).includes(q) ||
        fold(`${b.titulo} ${b.cliente} ${b.responsavelNome} ${b.createdByNome}`).includes(q),
    );
  }, [porAba, aba, query]);

  return (
    <>
      <PageHeader
        title="Briefings"
        description="Comercial descreve o pedido → Criação ou Projetos especiais assumem e entregam."
        action={podeCriar ? <NovoBriefingButton /> : undefined}
      />

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState icon={SearchX} title="Não foi possível carregar" description={error.message} />
      ) : briefings === null ? (
        <EmptyState
          icon={Lightbulb}
          title="Briefings ainda não ativados"
          description="Falta rodar a atualização do banco."
        />
      ) : !briefings || briefings.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Nenhum briefing ainda"
          description={
            podeCriar
              ? "Crie o primeiro: diga o que o cliente precisa e para quem vai."
              : "Quando o comercial criar briefings, eles aparecem aqui."
          }
          action={podeCriar ? <NovoBriefingButton /> : undefined}
        />
      ) : (
        <>
          <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="mb-3">
            <TabsList className="h-auto flex-wrap">
              {ABAS.map((a) => (
                <TabsTrigger key={a.value} value={a.value} className="gap-1.5">
                  {a.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      a.value === "novo" && atende && porAba.novo.length > 0
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

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título, cliente, número, responsável…"
                aria-label="Buscar briefing"
                className="h-9 pl-9"
              />
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              value={destinoAtual}
              onValueChange={(v) => {
                if (!v) return;
                setDestinoTocado(true);
                setDestino(v as typeof destino);
              }}
              aria-label="Área"
            >
              <ToggleGroupItem value="todos" className="h-9 px-3">
                Todos
              </ToggleGroupItem>
              <ToggleGroupItem value="criacao" className="h-9 px-3">
                Criação
              </ToggleGroupItem>
              <ToggleGroupItem value="projetos_especiais" className="h-9 px-3">
                Proj. especiais
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {visiveis.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nada por aqui"
              description={query ? "Ajuste a busca." : "Nenhum briefing nesta aba."}
            />
          ) : (
            <ul className="surface-card divide-y divide-border overflow-hidden">
              {visiveis.map((b) => (
                <li key={b.id} className="relative px-4 py-3 transition-colors hover:bg-muted/30">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold tabular-nums">Nº {b.numero}</span>
                    <Link
                      to="/briefings/$briefingId"
                      params={{ briefingId: b.id }}
                      className="min-w-0 flex-1 truncate font-medium after:absolute after:inset-0"
                    >
                      {b.titulo}
                    </Link>
                    <BriefingStatusBadge status={b.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      BRIEFING_DESTINO_LABEL[b.destino],
                      b.cliente,
                      b.responsavelNome ? `com ${b.responsavelNome}` : "",
                      `por ${b.createdByNome || "alguém"}`,
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
