import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OrdemStatusBadge } from "@/components/app/operacao-ui";
import { useOrdensDaLiberacao } from "@/hooks/use-data";

/** Orders born from a liberação linked to a pedido (one per item, migration 0036). */
export function OrdensDaLiberacaoPanel({
  liberacaoId,
  className,
}: {
  liberacaoId: string;
  className?: string;
}) {
  const { data: ordens, isPending } = useOrdensDaLiberacao(liberacaoId);
  return (
    <section className={`space-y-3 rounded-2xl border bg-card p-5 shadow-sm ${className ?? ""}`}>
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <ClipboardList className="size-4" />
          Ordens de produção
        </h2>
        <p className="text-sm text-muted-foreground">
          Uma por item do pedido. Elas entram na produção quando o PCP aprova a liberação.
        </p>
      </div>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !ordens?.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma ordem ligada a esta liberação.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {ordens.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <Link
                to="/producao/$ordemId"
                params={{ ordemId: o.id }}
                className="min-w-0 truncate font-medium text-primary hover:underline"
              >
                Ordem nº {o.numero} · {o.descricao}
              </Link>
              <OrdemStatusBadge status={o.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Approving a liberação linked to a pedido: no Projeto; its orders go into production. */
export function AprovarComOrdensDialog({
  open,
  onOpenChange,
  liberacaoId,
  numero,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liberacaoId: string;
  numero: number;
  /** Resolves to a falsy value when it failed (dialog stays open). */
  onConfirm: () => Promise<unknown>;
}) {
  const { data: ordens } = useOrdensDaLiberacao(open ? liberacaoId : "");
  const [saving, setSaving] = useState(false);
  const total = ordens?.length ?? 0;
  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprovar a liberação nº {numero}?</DialogTitle>
          <DialogDescription>
            {total === 1
              ? "A ordem de produção deste pedido passa para Aguardando e entra na produção."
              : `As ${total} ordens de produção deste pedido passam para Aguardando e entram na produção.`}{" "}
            Nenhum projeto é criado: o acompanhamento é pelas ordens.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await onConfirm();
              setSaving(false);
              if (ok) onOpenChange(false);
            }}
          >
            {saving && <Loader2 className="animate-spin" />}
            Aprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
