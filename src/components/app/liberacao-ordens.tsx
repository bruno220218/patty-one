import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { OrdemStatusBadge, selectClass } from "@/components/app/operacao-ui";
import { useChecklists, useDataAction, useOrdensDaLiberacao } from "@/hooks/use-data";
import { operacaoRepository } from "@/lib/data";

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
  const { data: checklists } = useChecklists();
  const run = useDataAction();
  const [saving, setSaving] = useState(false);
  // Checklist chosen per order ("" = the type's default steps); starts with what each order has.
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open && ordens)
      setEscolhas(Object.fromEntries(ordens.map((o) => [o.id, o.checklistId ?? ""])));
  }, [open, ordens]);
  const total = ordens?.length ?? 0;
  const opcoes = (checklists ?? []).filter((c) => c.tasks.length > 0);

  /** Swaps the steps of the orders whose checklist changed, then approves. */
  async function aprovar() {
    for (const o of ordens ?? []) {
      const escolhido = escolhas[o.id] ?? "";
      if (escolhido === (o.checklistId ?? "")) continue;
      const ok = await run(() =>
        operacaoRepository.trocarChecklist(o.id, escolhido || null).then(() => true),
      );
      if (!ok) return false;
    }
    return onConfirm();
  }
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
        {Boolean(ordens?.length) && (
          <div className="max-h-72 space-y-3 overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              Confira o checklist das etapas de cada ordem (vem o padrão do tipo):
            </p>
            {ordens?.map((o) => (
              <div key={o.id} className="space-y-1.5">
                <Label htmlFor={`checklist-${o.id}`} className="truncate">
                  Ordem nº {o.numero} · {o.descricao}{" "}
                  <span className="font-normal text-muted-foreground">({o.tipo})</span>
                </Label>
                <select
                  id={`checklist-${o.id}`}
                  className={selectClass}
                  value={escolhas[o.id] ?? ""}
                  disabled={saving}
                  onChange={(e) => setEscolhas((a) => ({ ...a, [o.id]: e.target.value }))}
                >
                  <option value="">Etapas padrão do tipo</option>
                  {opcoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.fixedParams ? " (parâmetros fixos)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await aprovar();
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
