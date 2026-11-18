import { useState } from "react";
import { Check, CheckCheck, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useDataAction } from "@/hooks/use-data";
import { ciRepository, ciSituacao, type Ci, type CiPainel } from "@/lib/data";
import { StatusPill } from "./status-pill";

/** Where one panel of a CI stands: aguardando, no espaço X, recusada. */
export function CiPainelPill({ cp }: { cp: CiPainel }) {
  if (cp.status === "pendente") {
    return (
      <StatusPill tone="progress" icon={Clock}>
        Aguardando entrada
      </StatusPill>
    );
  }
  if (cp.status === "aprovada") {
    return (
      <StatusPill tone="done" icon={Check}>
        {cp.renovacao ? "Renovada" : "Entrou"}
        {cp.posicao ? ` · espaço ${cp.posicao}` : ""}
      </StatusPill>
    );
  }
  return (
    <StatusPill tone="danger" icon={X}>
      Recusada
    </StatusPill>
  );
}

export function CiSituacaoPill({ ci }: { ci: Ci }) {
  const s = ciSituacao(ci);
  const pend = ci.paineis.filter((p) => p.status === "pendente").length;
  if (s === "concluida") {
    return (
      <StatusPill tone="done" icon={CheckCheck}>
        Concluída
      </StatusPill>
    );
  }
  return (
    <StatusPill tone="progress" icon={Clock}>
      {s === "aguardando"
        ? "Aguardando entrada"
        : `Falta ${pend} ${pend === 1 ? "painel" : "painéis"}`}
    </StatusPill>
  );
}

/** Criação: put the vinheta on one panel, or refuse with a reason. */
export function EntradaAcoes({
  cp,
  painelCodigo,
  compact = false,
}: {
  cp: CiPainel;
  painelCodigo: string;
  compact?: boolean;
}) {
  const run = useDataAction();
  const [recusar, setRecusar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  const aprovar = async () => {
    setBusy(true);
    const pos = await run(() => ciRepository.aprovar(cp.id));
    setBusy(false);
    if (pos !== undefined) toast.success(`Entrou no ${painelCodigo}, espaço ${pos}.`);
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button size="sm" className="h-8" disabled={busy} onClick={aprovar}>
          <Check />
          {compact ? "Entrada" : "Dar entrada"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-muted-foreground"
          onClick={() => setRecusar(true)}
          aria-label={`Recusar entrada no ${painelCodigo}`}
        >
          <X />
          {!compact && "Recusar"}
        </Button>
      </div>
      <Dialog open={recusar} onOpenChange={setRecusar}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar entrada no {painelCodigo}?</DialogTitle>
            <DialogDescription>
              Quem criou a CI recebe o aviso com o motivo. Os outros painéis da CI não mudam.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            id={`motivo-${cp.id}`}
            aria-label="Motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: painel sem vaga até dezembro"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRecusar(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!motivo.trim()}
              onClick={async () => {
                const ok = await run(
                  () => ciRepository.recusar(cp.id, motivo).then(() => true),
                  "Entrada recusada.",
                );
                if (ok) setRecusar(false);
              }}
            >
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
