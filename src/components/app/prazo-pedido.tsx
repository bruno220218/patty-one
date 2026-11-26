import { useState } from "react";
import { CalendarClock, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser, useDataAction, usePrazosDoPedido } from "@/hooks/use-data";
import {
  canGerirOperacao,
  canVender,
  localToday,
  prazoRepository,
  type PrazoPedido,
} from "@/lib/data";
import { formatDateOnly, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * "Solicitar prazo" on a pedido: the comercial asks after the client's acceptance, the PCP sets
 * the date (the PCP always decides), and the liberação then comes with that date.
 */
export function PrazoPedidoSection({
  vendaId,
  cancelado,
}: {
  vendaId: string;
  /** Cancelled pedidos don't ask for a deadline. */
  cancelado: boolean;
}) {
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const prazos = usePrazosDoPedido(vendaId);
  const lista = prazos.data ?? [];
  const aberto = lista.find((p) => p.status === "aguardando");
  const podePedir = canVender(me) && !cancelado && !aberto;
  const podeResponder = canGerirOperacao(me);

  const [pedindo, setPedindo] = useState(false);
  const [desejada, setDesejada] = useState("");
  const [obs, setObs] = useState("");
  const [prazo, setPrazo] = useState("");
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function solicitar() {
    setEnviando(true);
    const ok = await run(async () => {
      await prazoRepository.solicitar(vendaId, desejada || null, obs);
      return true;
    }, "Prazo pedido. O PCP foi avisado.");
    setEnviando(false);
    if (ok) {
      setPedindo(false);
      setDesejada("");
      setObs("");
    }
  }

  async function responder(p: PrazoPedido) {
    setEnviando(true);
    const ok = await run(async () => {
      await prazoRepository.responder(p.id, prazo, resposta);
      return true;
    }, "Prazo definido. Quem pediu foi avisado.");
    setEnviando(false);
    if (ok) {
      setPrazo("");
      setResposta("");
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarClock className="size-4" />
          Prazo de entrega
        </h2>
        {podePedir && !pedindo && (
          <Button size="sm" variant="outline" onClick={() => setPedindo(true)}>
            <CalendarClock />
            {lista.some((p) => p.status === "respondido") ? "Pedir novo prazo" : "Solicitar prazo"}
          </Button>
        )}
      </div>

      {prazos.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : prazos.isError ? (
        <p className="text-sm text-destructive">{prazos.error.message}</p>
      ) : lista.length === 0 && !pedindo ? (
        <p className="text-sm text-muted-foreground">
          {cancelado
            ? "Pedido cancelado."
            : "Nenhum prazo pedido. Depois do aceite do cliente, peça o prazo ao PCP antes de liberar."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {[...lista].reverse().map((p) => (
            <li key={p.id} className="space-y-2 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{p.solicitadoPorNome || "Comercial"}</span> pediu em{" "}
                  {formatDateTime(p.solicitadoEm)}
                  {p.dataDesejada && <> · desejado {formatDateOnly(p.dataDesejada)}</>}
                </span>
                <PrazoSituacao p={p} />
              </div>
              {p.observacao && <p className="text-muted-foreground">“{p.observacao}”</p>}
              {p.status === "respondido" && (p.resposta || p.respondidoPorNome) && (
                <p className="text-muted-foreground">
                  {p.respondidoPorNome && (
                    <span className="font-medium">{p.respondidoPorNome}</span>
                  )}
                  {p.respondidoEm && <> em {formatDateTime(p.respondidoEm)}</>}
                  {p.resposta && <>: “{p.resposta}”</>}
                </p>
              )}
              {p.status === "aguardando" && podeResponder && (
                <div className="grid gap-2 rounded-lg bg-secondary/50 p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label htmlFor={`prazo-${p.id}`}>Prazo *</Label>
                    <Input
                      id={`prazo-${p.id}`}
                      type="date"
                      min={localToday()}
                      value={prazo}
                      onChange={(e) => setPrazo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`resposta-${p.id}`}>Observação (opcional)</Label>
                    <Input
                      id={`resposta-${p.id}`}
                      value={resposta}
                      placeholder="Ex.: fila cheia na impressão"
                      onChange={(e) => setResposta(e.target.value)}
                    />
                  </div>
                  <Button disabled={enviando || !prazo} onClick={() => void responder(p)}>
                    {enviando && <Loader2 className="animate-spin" />}
                    Definir prazo
                  </Button>
                </div>
              )}
              {p.status === "aguardando" && (me?.isGestor || p.solicitadoPor === me?.id) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={enviando}
                  onClick={() =>
                    void run(async () => {
                      await prazoRepository.cancelar(p.id);
                      return true;
                    }, "Pedido de prazo cancelado.")
                  }
                >
                  <X />
                  Cancelar pedido de prazo
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {pedindo && (
        <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[10rem_1fr]">
          <div className="space-y-1">
            <Label htmlFor="prazo-desejado">Data desejada</Label>
            <Input
              id="prazo-desejado"
              type="date"
              min={localToday()}
              value={desejada}
              onChange={(e) => setDesejada(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="prazo-obs">Observação para o PCP</Label>
            <Textarea
              id="prazo-obs"
              rows={2}
              value={obs}
              placeholder="Ex.: cliente precisa antes da inauguração"
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2 sm:justify-end">
            <Button variant="ghost" onClick={() => setPedindo(false)} disabled={enviando}>
              Voltar
            </Button>
            <Button onClick={() => void solicitar()} disabled={enviando}>
              {enviando && <Loader2 className="animate-spin" />}
              Pedir prazo ao PCP
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function PrazoSituacao({ p }: { p: PrazoPedido }) {
  const [texto, cor] =
    p.status === "respondido" && p.prazo
      ? [`Prazo: ${formatDateOnly(p.prazo)}`, "bg-status-done text-status-done-foreground"]
      : p.status === "cancelado"
        ? ["Cancelado", "bg-muted text-muted-foreground"]
        : ["Aguardando o PCP", "bg-status-progress text-status-progress-foreground"];
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", cor)}>{texto}</span>
  );
}
