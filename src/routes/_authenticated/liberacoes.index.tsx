import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, FileDown, FileCheck2, Plus, Search, SearchX } from "lucide-react";
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
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { IconAction } from "@/components/app/icon-action";
import { useCurrentUser, useLiberacoes } from "@/hooks/use-data";
import {
  canEditLiberacoes,
  LIBERACAO_MODELO_LABEL,
  liberacaoProgress,
  type Liberacao,
  type LiberacaoModelo,
} from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { downloadLiberacaoPdf } from "@/lib/liberacao-pdf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/liberacoes/")({
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

function LiberacoesPage() {
  const { data: liberacoes, isPending, error } = useLiberacoes();
  const { data: me } = useCurrentUser();
  const canEdit = canEditLiberacoes(me);
  const [query, setQuery] = useState("");
  const [modelo, setModelo] = useState<"todos" | LiberacaoModelo>("todos");

  const visible = useMemo(() => {
    const q = fold(query.trim());
    return (liberacoes ?? []).filter(
      (l) =>
        (modelo === "todos" || l.modelo === modelo) &&
        (!q ||
          fold(l.cliente).includes(q) ||
          String(l.numero).includes(q) ||
          fold(l.vendedor).includes(q) ||
          fold(l.projetista).includes(q) ||
          fold(l.numeroPlaca).includes(q)),
    );
  }, [liberacoes, query, modelo]);

  const pdf = async (l: Liberacao) => {
    try {
      await downloadLiberacaoPdf(l, "/patty-logo.png");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o PDF.");
    }
  };

  return (
    <>
      <PageHeader
        title="Liberações"
        description={
          canEdit
            ? "Liberações de projetos e de mídia. Gestão e comercial podem criar e ajustar."
            : "Liberações de projetos e de mídia. Somente gestão e comercial podem ajustar."
        }
        action={canEdit ? <NovaLiberacaoButton /> : undefined}
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
              : "Quando a gestão ou o comercial criarem liberações, elas aparecem aqui."
          }
          action={canEdit ? <NovaLiberacaoButton /> : undefined}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por cliente, número, vendedor, placa…"
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
              title="Nenhuma liberação encontrada"
              description="Ajuste a busca ou o modelo."
            />
          ) : (
            <div className="surface-card overflow-hidden">
              <div className="hidden grid-cols-[5rem_6rem_minmax(0,1fr)_9rem_7rem_6rem_3rem] gap-4 border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                <span>Nº</span>
                <span>Modelo</span>
                <span>Cliente</span>
                <span>Vendedor</span>
                <span>Entrega</span>
                <span>Check</span>
                <span className="sr-only">PDF</span>
              </div>
              <ul className="divide-y divide-border">
                {visible.map((l) => {
                  const { done, total } = liberacaoProgress(l.itens);
                  return (
                    <li
                      key={l.id}
                      className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/30 md:grid-cols-[5rem_6rem_minmax(0,1fr)_9rem_7rem_6rem_3rem]"
                    >
                      <span className="text-sm font-semibold tabular-nums">
                        <span className="md:hidden">Nº </span>
                        {l.numero}
                      </span>
                      <span
                        className={cn(
                          "w-fit rounded-full px-2 py-0.5 text-xs font-semibold",
                          l.modelo === "projeto"
                            ? "bg-status-progress text-status-progress-foreground"
                            : "bg-status-idle text-status-idle-foreground",
                        )}
                      >
                        {LIBERACAO_MODELO_LABEL[l.modelo]}
                      </span>
                      <Link
                        to="/liberacoes/$liberacaoId"
                        params={{ liberacaoId: l.id }}
                        className="col-span-2 truncate text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none md:col-span-1"
                      >
                        {l.cliente}
                      </Link>
                      <span className="truncate text-xs text-muted-foreground md:text-sm">
                        {l.vendedor || "—"}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {l.dataEntrega ? formatDateOnly(l.dataEntrega) : "Sem entrega"}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {done}/{total}
                      </span>
                      <div className="justify-self-end">
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
