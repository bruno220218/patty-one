import { useState } from "react";
import { Camera, CheckCheck, Clock, X } from "lucide-react";
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
import { useCurrentUser, useDataAction } from "@/hooks/use-data";
import { canFazerChecking, canPedirFoto, ciRepository, fotoPendente, type Ci } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { AnexosPanel } from "./anexos-panel";
import { StatusPill } from "./status-pill";

const FOTO_ACCEPT = "image/*,video/*,.jpg,.jpeg,.png,.heic,.mp4,.mov";
const fotoPermitida = (nome: string, mime: string) =>
  mime.startsWith("image/") ||
  mime.startsWith("video/") ||
  /\.(jpe?g|png|heic|heif|webp|mp4|mov)$/i.test(nome);

/**
 * Checking fotográfico: who follows the CI asks for photos of the vinheta running on the
 * panels; the checking team uploads them (to the CI's Drive folder) and closes the request.
 */
export function CiFotoChecking({ ci }: { ci: Ci }) {
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const [pedindo, setPedindo] = useState(false);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  const pendente = fotoPendente(ci);
  const ultimo = ci.fotoPedidos[0] ?? null;
  const entrou = ci.paineis.some((p) => p.status === "aprovada");
  const podePedir = canPedirFoto(me) && entrou && !pendente;
  const fazChecking = canFazerChecking(me);
  const podeCancelar = Boolean(pendente && me && (me.isGestor || pendente.pedidoPorId === me.id));

  return (
    <section className="surface-card mt-4 p-5" aria-labelledby="ci-foto-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ci-foto-titulo" className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="h-4 w-4 text-muted-foreground" />
            Foto da veiculação
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            O checking fotográfico fotografa a vinheta rodando nos painéis, para comprovar ao
            cliente.
          </p>
        </div>
        {podePedir && (
          <Button size="sm" onClick={() => setPedindo(true)}>
            <Camera />
            Solicitar foto
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-2 text-sm">
        {pendente ? (
          <div className="rounded-lg border border-status-progress-foreground/30 bg-status-progress/30 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="progress" icon={Clock}>
                Foto solicitada
              </StatusPill>
              <span className="text-xs text-muted-foreground">
                por {pendente.pedidoPorNome || "alguém"} em {formatDateTime(pendente.pedidoEm)}
              </span>
            </div>
            {pendente.observacao && <p className="mt-1.5 text-sm">{pendente.observacao}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {fazChecking && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await run(
                      () => ciRepository.concluirFoto(pendente.id),
                      "Fotos enviadas. Quem pediu foi avisado.",
                    );
                    setBusy(false);
                  }}
                >
                  <CheckCheck />
                  Marcar fotos como enviadas
                </Button>
              )}
              {podeCancelar && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={busy}
                  onClick={() =>
                    run(() => ciRepository.cancelarFoto(pendente.id), "Pedido de foto cancelado.")
                  }
                >
                  <X />
                  Cancelar pedido
                </Button>
              )}
            </div>
          </div>
        ) : ultimo?.status === "enviada" ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="done" icon={CheckCheck}>
              Fotos enviadas
            </StatusPill>
            <span className="text-xs text-muted-foreground">
              por {ultimo.atendidoPorNome || "alguém"}
              {ultimo.atendidoEm ? ` em ${formatDateTime(ultimo.atendidoEm)}` : ""}
            </span>
          </div>
        ) : !entrou ? (
          <p className="text-xs text-muted-foreground">
            Dá para pedir a foto depois que a vinheta entrar em algum painel.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhuma foto pedida ainda.</p>
        )}
      </div>

      {(ci.fotoPedidos.length > 0 || fazChecking) && (
        <AnexosPanel
          entidade="ci_foto"
          entidadeId={ci.id}
          titulo="Fotos"
          aviso="Ficam no Google Drive da empresa, na pasta desta CI › Fotos do checking."
          canAdd={fazChecking}
          accept={FOTO_ACCEPT}
          permitido={fotoPermitida}
          formatos="fotos (JPG, PNG, HEIC) ou vídeo (MP4, MOV)"
          rotuloBotao="Enviar fotos"
          className="mt-4 border-0 p-0 shadow-none"
        />
      )}

      <Dialog open={pedindo} onOpenChange={setPedindo}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar foto · CI {ci.rotulo}</DialogTitle>
            <DialogDescription>
              O checking fotográfico recebe o aviso para fotografar {ci.cliente} nos painéis em que
              a vinheta entrou.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            id="ci-foto-obs"
            aria-label="Observação para o checking"
            rows={3}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Opcional. Ex.: foto à noite, com o painel inteiro aparecendo"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPedindo(false)}>
              Cancelar
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await run(
                  () => ciRepository.solicitarFoto(ci.id, obs).then(() => true),
                  "Foto solicitada. O checking foi avisado.",
                );
                setBusy(false);
                if (ok) {
                  setPedindo(false);
                  setObs("");
                }
              }}
            >
              <Camera />
              Solicitar foto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
