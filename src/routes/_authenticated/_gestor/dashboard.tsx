import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Info } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { useCurrentUser } from "@/hooks/use-data";
import { secoesVisiveis, type Indicador } from "@/lib/data/dashboard";
import { cn } from "@/lib/utils";

/**
 * Dashboard: pre-configured layout with the proposed indicators (src/lib/data/dashboard.ts).
 * The numbers are still being defined (docs/dashboard-indicadores.md), so every card shows
 * "a definir" with what it will measure.
 */
export const Route = createFileRoute("/_authenticated/_gestor/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardPage,
});

function CartaoIndicador({ indicador }: { indicador: Indicador }) {
  return (
    <div
      className={cn(
        "surface-card flex flex-col p-4",
        indicador.destaque && "border-sidebar-border bg-sidebar text-sidebar-accent",
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold",
          indicador.destaque ? "text-sidebar-foreground" : "text-muted-foreground",
        )}
      >
        {indicador.titulo}
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums opacity-40">—</p>
      <p
        className={cn(
          "mt-2 text-xs leading-snug",
          indicador.destaque ? "text-sidebar-foreground" : "text-muted-foreground",
        )}
      >
        {indicador.descricao}
      </p>
      <span
        className={cn(
          "mt-3 w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
          indicador.destaque
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "bg-status-idle text-status-idle-foreground",
        )}
      >
        A definir
      </span>
    </div>
  );
}

function DashboardPage() {
  const { data: me } = useCurrentUser();
  const secoes = secoesVisiveis(me?.funcoes ?? [], me?.isGestor ?? false);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Dashboard"
        description="Resumo da operação da Patty. Os números estão em definição."
      />

      <div className="surface-card mb-8 flex items-start gap-3 p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Esta é a versão pré-configurada. Cada cartão mostra o que vai medir; os números entram
          conforme forem definidos.
        </p>
      </div>

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
                <CartaoIndicador key={i.id} indicador={i} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
