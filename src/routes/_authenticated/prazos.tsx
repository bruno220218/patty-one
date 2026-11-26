import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { usePrazosAbertos } from "@/hooks/use-data";
import { formatDateOnly, formatRelative } from "@/lib/format";

/**
 * Prazos a definir (menu PCP): the "Solicitar prazo" requests waiting for the PCP, oldest first.
 * The date is set on the pedido itself (section "Prazo de entrega").
 */
export const Route = createFileRoute("/_authenticated/prazos")({
  head: () => ({
    meta: [{ title: "Prazos a definir — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: PrazosPage,
});

function PrazosPage() {
  const prazos = usePrazosAbertos();

  return (
    <>
      <PageHeader
        title="Prazos a definir"
        description="Pedidos em que o comercial pediu o prazo de entrega. Abra o pedido para informar a data: quem pediu é avisado e a liberação já vem com ela."
      />
      {prazos.isPending ? (
        <CardGridSkeleton />
      ) : prazos.isError ? (
        <p className="text-sm text-destructive">{prazos.error.message}</p>
      ) : prazos.data.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="Nenhum prazo esperando"
          description="Quando o comercial pedir um prazo, ele aparece aqui."
        />
      ) : (
        <ul className="space-y-3">
          {prazos.data.map((p) => (
            <li key={p.id}>
              <Link
                to="/comercial/$vendaId"
                params={{ vendaId: p.vendaId }}
                className="surface-card flex items-center gap-4 p-4 transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold tabular-nums">
                      Pedido nº {p.pedidoNumero}
                    </span>
                    <span className="min-w-0 truncate font-medium">{p.clienteNome}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.solicitadoPorNome || "Comercial"} pediu {formatRelative(p.solicitadoEm)}
                    {p.dataDesejada && ` · cliente deseja ${formatDateOnly(p.dataDesejada)}`}
                  </p>
                  {p.observacao && (
                    <p className="break-words text-sm text-muted-foreground">“{p.observacao}”</p>
                  )}
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
