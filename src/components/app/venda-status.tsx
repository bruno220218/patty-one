import { TOM } from "@/components/app/operacao-ui";
import { cn } from "@/lib/utils";

const TOM_VENDA: Record<string, string> = {
  Rascunho: TOM.neutro,
  Enviada: TOM.primario,
  Aprovada: TOM.sucesso,
  Recusada: TOM.perigo,
  Aberto: TOM.primario,
  "Em andamento": TOM.aviso,
  Concluído: TOM.sucesso,
  Cancelado: TOM.perigo,
};

/** Situation of a proposta or pedido. */
export function VendaStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TOM_VENDA[status] ?? TOM.neutro,
      )}
    >
      {status}
    </span>
  );
}
