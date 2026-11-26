import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { linhaDaOrdem, ProgramacaoLista } from "@/components/app/programacao-formulario";
import {
  AgendamentosDoDia,
  Pendencias,
  ResumoDia,
  totalPendencias,
} from "@/components/app/programacao-paineis";
import { useCurrentUser, useProgramacao } from "@/hooks/use-data";
import { AssistentePcp } from "@/components/app/assistente-pcp";
import { assinatura } from "@/lib/ai/assistente-pcp-client";
import {
  adicionarDias,
  canExecutarOperacao,
  canGerirOperacao,
  hojeISO,
  tituloDoPeriodo,
  type LinhaProgramacao,
} from "@/lib/data";
import { cn } from "@/lib/utils";

type Aba = "lancamento" | "resumo" | "pendencias";
type Busca = { data: string; aba: Aba };

export const Route = createFileRoute("/_authenticated/planejamento/programacao")({
  validateSearch: (s: Record<string, unknown>): Busca => ({
    data:
      typeof s["data"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["data"])
        ? s["data"]
        : hojeISO(),
    aba: s["aba"] === "resumo" || s["aba"] === "pendencias" ? s["aba"] : "lancamento",
  }),
  head: () => ({
    meta: [{ title: "Programação Produção — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: ProgramacaoPage,
});

function ProgramacaoPage() {
  const search = Route.useSearch();
  const navegar = Route.useNavigate();
  const { data: me } = useCurrentUser();
  const { data: dados, isPending, error } = useProgramacao(search.data);
  const [novoInicial, setNovoInicial] = useState<LinhaProgramacao | null>(null);
  const irPara = (data: string) => void navegar({ search: (a) => ({ ...a, data }) });
  const abas: [Aba, string][] = [
    ["lancamento", "Programar"],
    ["resumo", "Resumo do dia"],
    ["pendencias", `Pendências${dados ? ` (${totalPendencias(dados)})` : ""}`],
  ];

  return (
    <>
      <PageHeader
        title="Programação Produção"
        description="Os serviços do dia por setor. A lista de setores fica em Produtos, serviços e colaboradores."
        action={
          <Button variant="outline" asChild>
            <Link to="/planejamento" search={{ visao: "diario", data: search.data }}>
              <CalendarDays />
              Cronograma
            </Link>
          </Button>
        }
      />
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border bg-muted p-1">
            {abas.map(([aba, label]) => (
              <button
                key={aba}
                type="button"
                aria-pressed={search.aba === aba}
                onClick={() => void navegar({ search: (a) => ({ ...a, aba }) })}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition",
                  search.aba === aba
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Dia anterior"
              onClick={() => irPara(adicionarDias(search.data, -1))}
            >
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => irPara(hojeISO())}>
              Hoje
            </Button>
            <Input
              aria-label="Data da programação"
              type="date"
              className="h-9 w-40"
              value={search.data}
              onChange={(e) => e.target.value && irPara(e.target.value)}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Próximo dia"
              onClick={() => irPara(adicionarDias(search.data, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <h2 className="text-lg font-semibold">{tituloDoPeriodo(search.data, "diario")}</h2>
        {/* Assistente do PCP: conflicts, what to prioritize and the pending items of the day. */}
        {dados && canGerirOperacao(me) && (
          <AssistentePcp
            pedido={{ momento: "programacao", data: search.data }}
            versao={assinatura(dados.itens.map((i) => `${i.id}:${i.status}`).join(","))}
          />
        )}
        {dados && dados.semBaixa.length > 0 && search.aba !== "pendencias" && (
          <button
            type="button"
            onClick={() => void navegar({ search: (a) => ({ ...a, aba: "pendencias" }) })}
            className="flex w-full items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-sm text-destructive"
          >
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              <b>{dados.semBaixa.length}</b> serviço(s) de dias anteriores ainda sem baixa. Toque
              aqui para dizer se foram feitos.
            </span>
          </button>
        )}

        {isPending ? (
          <CardGridSkeleton />
        ) : error ? (
          <EmptyState
            icon={ListChecks}
            title="Não foi possível abrir a programação"
            description={error.message}
          />
        ) : (
          <>
            {search.aba === "lancamento" && (
              <>
                <AgendamentosDoDia dados={dados} data={search.data} />
                <ProgramacaoLista
                  key={search.data}
                  dados={dados}
                  data={search.data}
                  podeEditar={canGerirOperacao(me)}
                  novoInicial={novoInicial}
                  onNovoInicialUsado={() => setNovoInicial(null)}
                />
              </>
            )}
            {search.aba === "resumo" && (
              <ResumoDia
                dados={dados}
                data={search.data}
                podeMudarStatus={canExecutarOperacao(me)}
              />
            )}
            {search.aba === "pendencias" && (
              <Pendencias
                dados={dados}
                podeReagendar={canGerirOperacao(me)}
                podeMudarStatus={canExecutarOperacao(me)}
                onProgramarOrdem={(o) => {
                  setNovoInicial(linhaDaOrdem(o, search.data));
                  void navegar({ search: (a) => ({ ...a, aba: "lancamento" }) });
                }}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
