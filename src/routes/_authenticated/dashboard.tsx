import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, Info, SearchX } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { currentUserQuery, useCurrentUser, useDashboard } from "@/hooks/use-data";
import {
  brl,
  secoesVisiveis,
  valorDoIndicador,
  type DashboardResumo,
  type Indicador,
  type PropostaVencendo,
} from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Dashboard: the numbers decided in docs/dashboard-indicadores.md, read in one call to
 * dashboard_resumo() (migration 0037). Each function sees only its own sections; gestão sees all.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(currentUserQuery());
    if (!me || secoesVisiveis(me.funcoes, me.isGestor).length === 0) {
      throw redirect({ to: "/projetos" });
    }
  },
  head: () => ({
    meta: [{ title: "Dashboard — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardPage,
});

function CartaoIndicador({
  indicador,
  resumo,
  onAbrir,
}: {
  indicador: Indicador;
  resumo: DashboardResumo;
  /** Makes the card a button (opens the list behind the number). */
  onAbrir?: (() => void) | undefined;
}) {
  const valor = valorDoIndicador(indicador.id, resumo);
  const destaque = indicador.destaque;
  const suave = destaque ? "text-sidebar-foreground" : "text-muted-foreground";
  const conteudo = (
    <>
      <p className={cn("text-xs font-semibold", suave)}>{indicador.titulo}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-3xl font-bold tracking-tight tabular-nums">{valor?.principal ?? "—"}</p>
        {valor?.variacao && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
              destaque
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "bg-status-idle text-status-idle-foreground",
            )}
            title="Comparado com o mesmo trecho do mês anterior"
          >
            {valor.variacao.texto}
          </span>
        )}
      </div>
      {valor?.detalhe && (
        <p className={cn("mt-1 text-sm font-medium tabular-nums", suave)}>{valor.detalhe}</p>
      )}
      <p className={cn("mt-2 text-xs leading-snug", suave)}>{indicador.descricao}</p>
      {onAbrir && <p className={cn("mt-2 text-xs font-semibold underline", suave)}>Ver lista</p>}
    </>
  );
  const classes = cn(
    "surface-card flex flex-col p-4 text-left",
    destaque && "border-sidebar-border bg-sidebar text-sidebar-accent",
  );
  return onAbrir ? (
    <button type="button" onClick={onAbrir} className={cn(classes, "hover:ring-2 hover:ring-ring")}>
      {conteudo}
    </button>
  ) : (
    <div className={classes}>{conteudo}</div>
  );
}

function ListaVencendo({
  lista,
  open,
  onOpenChange,
}: {
  lista: PropostaVencendo[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propostas vencendo</DialogTitle>
          <DialogDescription>Em aberto, com validade nos próximos 7 dias.</DialogDescription>
        </DialogHeader>
        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma proposta vencendo.</p>
        ) : (
          <ul className="divide-y">
            {lista.map((p) => (
              <li key={p.id}>
                <Link
                  to="/comercial/$vendaId"
                  params={{ vendaId: p.id }}
                  className="flex items-center justify-between gap-3 py-2 text-sm hover:underline"
                >
                  <span className="min-w-0">
                    <span className="font-semibold">Proposta {p.numero}</span>
                    <span className="block truncate text-muted-foreground">
                      {p.cliente ?? "Sem cliente"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block">vence {formatDateOnly(p.validade)}</span>
                    <span className="block text-muted-foreground">{brl(p.valor)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DashboardPage() {
  const { data: me } = useCurrentUser();
  const { data: resumo, isPending, error } = useDashboard();
  const [vencendoAberta, setVencendoAberta] = useState(false);
  const secoes = secoesVisiveis(me?.funcoes ?? [], me?.isGestor ?? false).filter(
    // Without permission the database sends no financeiro numbers.
    (s) => s.id !== "financeiro" || resumo?.financeiro,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Dashboard"
        description={
          resumo
            ? `Resumo da operação da Patty em ${formatDateOnly(resumo.hoje)}. O mês vai do dia 1º até hoje.`
            : "Resumo da operação da Patty."
        }
      />

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState icon={SearchX} title="Não foi possível carregar" description={error.message} />
      ) : !resumo ? (
        <div className="surface-card flex items-start gap-3 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Os números do Dashboard ainda não estão ligados: falta rodar a migração 0037 no banco.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {secoes.map((secao) => (
            <section key={secao.id} aria-labelledby={`secao-${secao.id}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id={`secao-${secao.id}`} className="text-base font-semibold">
                  {secao.titulo}
                </h2>
                <Link
                  to={secao.link as never}
                  className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Abrir <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {secao.indicadores.map((i) => (
                  <CartaoIndicador
                    key={i.id}
                    indicador={i}
                    resumo={resumo}
                    onAbrir={
                      i.id === "propostas-vencendo" ? () => setVencendoAberta(true) : undefined
                    }
                  />
                ))}
              </div>
            </section>
          ))}
          <ListaVencendo
            lista={resumo.comercial.propostas_vencendo.lista}
            open={vencendoAberta}
            onOpenChange={setVencendoAberta}
          />
        </div>
      )}
    </div>
  );
}
