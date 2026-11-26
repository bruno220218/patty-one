import { useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TOM } from "@/components/app/operacao-ui";
import { useDataAction } from "@/hooks/use-data";
import {
  dataBR,
  hojeISO,
  operacaoRepository,
  STATUS_AGUARDANDO_CLIENTE,
  STATUS_AGUARDANDO_CONFERENCIA,
  type OrdemFicha,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * End of an order (0040): last step done → PCP checks (conferido / refazer) → comercial
 * records the client's confirmation → Concluída. Shows what was recorded afterwards.
 */
export function ConclusaoOrdemPanel({
  ordem,
  podeConferir,
  podeConfirmarCliente,
}: {
  ordem: OrdemFicha;
  /** Gestão/PCP. */
  podeConferir: boolean;
  /** Comercial/gestão. */
  podeConfirmarCliente: boolean;
}) {
  const run = useDataAction();
  const [busy, setBusy] = useState(false);
  const [refazendo, setRefazendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(hojeISO());
  const [quem, setQuem] = useState("");
  const [obs, setObs] = useState("");
  const c = ordem.conclusao;

  const conferindo = ordem.status === STATUS_AGUARDANDO_CONFERENCIA;
  const esperandoCliente = ordem.status === STATUS_AGUARDANDO_CLIENTE;
  if (!conferindo && !esperandoCliente && !c.conferidoEm && !c.clienteConfirmouEm) return null;

  async function conferir(ok: boolean) {
    setBusy(true);
    const r = await run(
      () => operacaoRepository.conferirOrdem(ordem.id, ok, ok ? "" : motivo),
      ok
        ? ordem.vendaId
          ? "Ordem conferida. O comercial foi avisado para confirmar com o cliente."
          : "Ordem conferida e concluída."
        : "Ordem devolvida para a equipe refazer.",
    );
    setBusy(false);
    if (r) {
      setRefazendo(false);
      setMotivo("");
    }
  }

  async function confirmarCliente() {
    setBusy(true);
    await run(
      () =>
        operacaoRepository
          .confirmarCliente(ordem.id, { data, quem, observacao: obs })
          .then(() => true),
      "Confirmação do cliente registrada. Ordem concluída.",
    );
    setBusy(false);
  }

  return (
    <section
      className={cn(
        "space-y-3 rounded-2xl border p-5 shadow-sm",
        conferindo || esperandoCliente ? TOM.primario : "bg-card",
      )}
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <CheckCircle2 className="size-5" />
        Conclusão
      </h2>

      {c.conferidoEm && (
        <p className="text-sm text-foreground">
          Conferida por {c.conferidoPorNome || "alguém do PCP"} em {formatDateTime(c.conferidoEm)}.
        </p>
      )}
      {c.clienteConfirmouEm && (
        <p className="text-sm text-foreground">
          Cliente confirmou em {dataBR(c.clienteConfirmouEm)} ({c.clienteConfirmouNome})
          {c.clienteRegistradoPorNome ? `, registrado por ${c.clienteRegistradoPorNome}` : ""}.
          {c.clienteObservacao && (
            <span className="block text-muted-foreground">“{c.clienteObservacao}”</span>
          )}
        </p>
      )}

      {conferindo &&
        (podeConferir ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Todas as etapas foram concluídas. Confira o serviço antes de liberar para o cliente.
            </p>
            {refazendo ? (
              <div className="space-y-2">
                <Label htmlFor="refazer-motivo">O que precisa ser refeito?</Label>
                <Textarea
                  id="refazer-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="A última etapa volta a ficar aberta para a equipe."
                />
                <div className="flex gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => setRefazendo(false)}>
                    Cancelar
                  </Button>
                  <Button disabled={busy || !motivo.trim()} onClick={() => void conferir(false)}>
                    {busy && <Loader2 className="animate-spin" />}
                    Devolver para refazer
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void conferir(true)}>
                  {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  Conferido
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setRefazendo(true)}>
                  <RotateCcw />
                  Refazer
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-foreground">
            Todas as etapas foram concluídas. Aguardando a conferência do PCP.
          </p>
        ))}

      {esperandoCliente &&
        (podeConfirmarCliente ? (
          <div className="grid gap-3 md:grid-cols-2">
            <p className="text-sm text-foreground md:col-span-2">
              O PCP conferiu. Avise o cliente e registre aqui a confirmação dele.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="cliente-data">Data da confirmação</Label>
              <Input
                id="cliente-data"
                type="date"
                max={hojeISO()}
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cliente-quem">Quem confirmou no cliente</Label>
              <Input
                id="cliente-quem"
                value={quem}
                onChange={(e) => setQuem(e.target.value)}
                placeholder="Nome do contato"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="cliente-obs">Observação (opcional)</Label>
              <Textarea id="cliente-obs" value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Button
                disabled={busy || !data || !quem.trim()}
                onClick={() => void confirmarCliente()}
              >
                {busy ? <Loader2 className="animate-spin" /> : <UserCheck />}
                Registrar confirmação do cliente
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground">
            Conferida pelo PCP. Aguardando o comercial registrar a confirmação do cliente.
          </p>
        ))}
    </section>
  );
}
