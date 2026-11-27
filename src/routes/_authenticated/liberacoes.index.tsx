import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, FileDown, FileCheck2, ListChecks, Plus, Search, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { IconAction } from "@/components/app/icon-action";
import { useCurrentUser, useLiberacoes } from "@/hooks/use-data";
import {
  canAprovarLiberacoes,
  canEditLiberacoes,
  filaPcp,
  LIBERACAO_MODELO_LABEL,
  liberacaoItemCount,
  type Liberacao,
  type LiberacaoModelo,
} from "@/lib/data";
import { LiberacaoStatusBadge } from "@/components/app/liberacao-status";
import { formatDateOnly } from "@/lib/format";
import { downloadLiberacaoPdf } from "@/lib/liberacao-pdf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/liberacoes/")({
  // ?modelo=projeto|midia opens the list already filtered (menu: Liberação - Mídias…).
  validateSearch: (search: Record<string, unknown>): { modelo?: LiberacaoModelo } =>
    search["modelo"] === "projeto" || search["modelo"] === "midia"
      ? { modelo: search["modelo"] }
      : {},
  head: () => ({
    meta: [
      { title: "Liberações — Patty One" },
      { name: "description", content: "Liberações de projetos e mídia da Patty." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LiberacoesPage,
});

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function NovaLiberacaoButton() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-10">
          <Plus />
          Nova liberação
          <ChevronDown className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["projeto", "midia"] as const).map((m) => (
          <DropdownMenuItem key={m} asChild>
            <Link to="/liberacoes/nova" search={{ modelo: m }}>
              Modelo {LIBERACAO_MODELO_LABEL[m]}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Aba = "fila" | "edicao" | "aprovadas" | "todas";

const ABAS: { value: Aba; label: string }[] = [
  { value: "fila", label: "Fila do PCP" },
  { value: "edicao", label: "Em edição" },
  { value: "aprovadas", label: "Aprovadas" },
  { value: "todas", label: "Todas" },
];

function LiberacoesPage() {
  const { data: liberacoes, isPending, error } = useLiberacoes();
  const { data: me } = useCurrentUser();
  const canEdit = canEditLiberacoes(me);
  const canAprovar = canAprovarLiberacoes(me);
  const [query, setQuery] = useState("");
  const search = Route.useSearch();
  const [modelo, setModelo] = useState<"todos" | LiberacaoModelo>(search.modelo ?? "todos");
  // Picking another menu item on the same page updates the filter.
  useEffect(() => setModelo(search.modelo ?? "todos"), [search.modelo]);
  const [aba, setAba] = useState<Aba | null>(null);

  const fila = useMemo(() => filaPcp(liberacoes ?? []), [liberacoes]);
  const posicao = useMemo(() => new Map(fila.map((l, i) => [l.id, i + 1])), [fila]);
  const porAba = useMemo(() => {
    const all = liberacoes ?? [];
    return {
      fila,
      edicao: all.filter((l) => l.status === "reprovada"),
      aprovadas: all.filter((l) => l.status === "aprovada"),
      todas: all,
    } satisfies Record<Aba, Liberacao[]>;
  }, [liberacoes, fila]);

  // Comercial lands on what needs fixing; PCP/direção on the queue.
  const abaAtual: Aba =
    aba ?? (canEdit && !canAprovar && porAba.edicao.length > 0 ? "edicao" : "fila");

  const visible = useMemo(() => {
    const q = fold(query.trim());
    return porAba[abaAtual].filter(
      (l) =>
        (modelo === "todos" || l.modelo === modelo) &&
        (!q ||
          fold(l.cliente).includes(q) ||
          String(l.numero).includes(q) ||
          fold(l.vendedor).includes(q) ||
          fold(l.projetista).includes(q) ||
          l.itens.some((i) => fold(i.referencia).includes(q) || fold(i.servico).includes(q))),
    );
  }, [porAba, abaAtual, query, modelo]);

  const pdf = async (l: Liberacao) => {
    try {
      await downloadLiberacaoPdf(l, "/patty-logo.png");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o PDF.");
    }
  };

  const vazio: Record<Aba, string> = {
    fila: "Nenhuma liberação aguardando o PCP.",
    edicao: "Nenhuma liberação em edição.",
    aprovadas: "Nenhuma liberação aprovada ainda.",
    todas: "Nenhuma liberação encontrada.",
  };

  return (
    <>
      <PageHeader
        title="Liberações"
        description="Comercial cria → PCP ou Direção aprova (vira projeto) ou reprova (volta para edição e, ao reenviar, entra no fim da fila)."
        action={
          canEdit || me?.isGestor ? (
            <div className="flex flex-wrap items-center gap-2">
              {me?.isGestor && (
                <Button variant="outline" asChild className="h-10">
                  <Link to="/listas">
                    <ListChecks />
                    Editar listas
                  </Link>
                </Button>
              )}
              {canEdit && <NovaLiberacaoButton />}
            </div>
          ) : undefined
        }
      />

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState icon={SearchX} title="Não foi possível carregar" description={error.message} />
      ) : !liberacoes || liberacoes.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="Nenhuma liberação ainda"
          description={
            canEdit
              ? "Crie a primeira escolhendo o modelo Projetos ou Mídia."
              : "Quando o comercial criar liberações, elas aparecem aqui."
          }
          action={canEdit ? <NovaLiberacaoButton /> : undefined}
        />
      ) : (
        <>
          <Tabs value={abaAtual} onValueChange={(v) => setAba(v as Aba)} className="mb-3">
            <TabsList className="h-auto flex-wrap">
              {ABAS.map((a) => (
                <TabsTrigger key={a.value} value={a.value} className="gap-1.5">
                  {a.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      a.value === "edicao" && porAba.edicao.length > 0
                        ? "bg-destructive/10 text-destructive"
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
                placeholder="Buscar por cliente, número, vendedor, painel, serviço…"
                aria-label="Buscar liberação"
                className="h-9 pl-9"
              />
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              value={modelo}
              onValueChange={(v) => v && setModelo(v as typeof modelo)}
              aria-label="Modelo"
            >
              <ToggleGroupItem value="todos" className="h-9 px-3">
                Todos
              </ToggleGroupItem>
              <ToggleGroupItem value="projeto" className="h-9 px-3">
                Projetos
              </ToggleGroupItem>
              <ToggleGroupItem value="midia" className="h-9 px-3">
                Mídia
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={query || modelo !== "todos" ? "Nenhuma liberação encontrada" : vazio[abaAtual]}
              description={query || modelo !== "todos" ? "Ajuste a busca ou o modelo." : ""}
            />
          ) : (
            <div className="surface-card overflow-hidden">
              <div className="hidden grid-cols-[4.5rem_5.5rem_minmax(0,1fr)_8rem_6.5rem_10rem_3rem] gap-4 border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                <span>Nº</span>
                <span>Modelo</span>
                <span>Cliente</span>
                <span>Vendedor</span>
                <span>Entrega</span>
                <span>Situação</span>
                <span className="sr-only">PDF</span>
              </div>
              <ul className="divide-y divide-border">
                {visible.map((l) => {
                  const total = liberacaoItemCount(l.itens);
                  return (
                    <li
                      key={l.id}
                      className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/30 md:grid-cols-[4.5rem_5.5rem_minmax(0,1fr)_8rem_6.5rem_10rem_3rem]"
                    >
                      <span className="text-sm font-semibold tabular-nums">
                        <span className="md:hidden">Nº </span>
                        {l.numero}
                      </span>
                      <span
                        className={cn(
                          "w-fit rounded-full px-2 py-0.5 text-xs font-semibold",
                          l.modelo === "projeto"
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-status-idle text-status-idle-foreground",
                        )}
                      >
                        {LIBERACAO_MODELO_LABEL[l.modelo]}
                      </span>
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <Link
                          to="/liberacoes/$liberacaoId"
                          params={{ liberacaoId: l.id }}
                          className="block truncate text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none"
                        >
                          {l.cliente}
                        </Link>
                        <span className="block truncate text-xs text-muted-foreground">
                          {l.status === "reprovada" && l.motivoReprovacao
                            ? `Motivo: ${l.motivoReprovacao}`
                            : `${total} ${total === 1 ? "item" : "itens"}`}
                        </span>
                      </div>
                      <span className="truncate text-xs text-muted-foreground md:text-sm">
                        {l.vendedor || "—"}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {l.dataEntrega ? formatDateOnly(l.dataEntrega) : "Sem entrega"}
                      </span>
                      <LiberacaoStatusBadge status={l.status} posicao={posicao.get(l.id)} />
                      <div className="relative z-10 justify-self-end">
                        <IconAction icon={FileDown} label="Baixar PDF" onClick={() => pdf(l)} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
