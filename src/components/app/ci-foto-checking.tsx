import { useState } from "react";
import { Camera, CheckCheck, Clock, LogOut, X } from "lucide-react";
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
import {
  canFazerChecking,
  canPedirFoto,
  ciRepository,
  fotoPendente,
  type Ci,
  type CiFotoEtapa,
} from "@/lib/data";
import { formatDateOnly, formatDateTime } from "@/lib/format";
import { AnexosPanel } from "./anexos-panel";
import { StatusPill } from "./status-pill";

const FOTO_ACCEPT = "image/*,video/*,.jpg,.jpeg,.png,.heic,.mp4,.mov";
const fotoPermitida = (nome: string, mime: string) =>
  mime.startsWith("image/") ||
  mime.startsWith("video/") ||
  /\.(jpe?g|png|heic|heif|webp|mp4|mov)$/i.test(nome);

const TEXTOS: Record<
  CiFotoEtapa,
  {
    titulo: string;
    explica: string;
    botao: string;
    pedido: string;
    enviado: string;
    dialogo: (ci: Ci) => string;
    placeholder: string;
    pasta: string;
    okPedido: string;
    icone: typeof Camera;
  }
> = {
  checking: {
    titulo: "Foto da veiculação (checking)",
    explica:
      "O checking fotográfico fotografa a vinheta rodando nos painéis, para comprovar ao cliente.",
    botao: "Solicitar foto",
    pedido: "Foto solicitada",
    enviado: "Fotos enviadas",
    dialogo: (ci) =>
      `O checking fotográfico recebe o aviso para fotografar ${ci.cliente} nos painéis em que a vinheta entrou.`,
    placeholder: "Opcional. Ex.: foto à noite, com o painel inteiro aparecendo",
    pasta: "Fotos do checking",
    okPedido: "Foto solicitada. O checking foi avisado.",
    icone: Camera,
  },
  checkout: {
    titulo: "Fim da veiculação (checkout)",
    explica:
      "No fim da CI, o checking fotográfico fotografa os painéis quando a vinheta sai, para fechar a campanha com o cliente.",
    botao: "Solicitar checkout",
    pedido: "Checkout solicitado",
    enviado: "Fotos do checkout enviadas",
    dialogo: (ci) =>
      `O checking fotográfico recebe o aviso para fotografar os painéis de ${ci.cliente} no fim da veiculação.`,
    placeholder: "Opcional. Ex.: foto no último dia, ou já com a próxima vinheta no lugar",
    pasta: "Fotos do checkout",
    okPedido: "Checkout solicitado. O checking foi avisado.",
    icone: LogOut,
  },
};

/**
 * Photo requests of a CI. Checking: photos of the vinheta running on the panels. Checkout: photos
 * at the end of the run. Who follows the CI asks; the checking team uploads the photos (to the
 * CI's Drive folder) and closes the request.
 */
export function CiFotoChecking({ ci, etapa = "checking" }: { ci: Ci; etapa?: CiFotoEtapa }) {
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const [pedindo, setPedindo] = useState(false);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const t = TEXTOS[etapa];
  const Icone = t.icone;
  const idTitulo = `ci-${etapa}-titulo`;

  const pendente = fotoPendente(ci, etapa);
  const pedidos = ci.fotoPedidos.filter((f) => f.etapa === etapa);
  const ultimo = pedidos[0] ?? null;
  const entrou = ci.paineis.some((p) => p.status === "aprovada");
  const podePedir = canPedirFoto(me) && entrou && !pendente;
  const fazChecking = canFazerChecking(me);
  const podeCancelar = Boolean(pendente && me && (me.isGestor || pendente.pedidoPorId === me.id));

  return (
    <section className="surface-card mt-4 p-5" aria-labelledby={idTitulo}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={idTitulo} className="flex items-center gap-2 text-sm font-semibold">
            <Icone className="h-4 w-4 text-muted-foreground" />
            {t.titulo}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t.explica}
            {etapa === "checkout" && ci.fim ? ` Fim previsto: ${formatDateOnly(ci.fim)}.` : ""}
          </p>
        </div>
        {podePedir && (
          <Button size="sm" onClick={() => setPedindo(true)}>
            <Icone />
            {t.botao}
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-2 text-sm">
        {pendente ? (
          <div className="rounded-lg border border-status-progress-foreground/30 bg-status-progress/30 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="progress" icon={Clock}>
                {t.pedido}
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
                    run(() => ciRepository.cancelarFoto(pendente.id), "Pedido cancelado.")
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
              {t.enviado}
            </StatusPill>
            <span className="text-xs text-muted-foreground">
              por {ultimo.atendidoPorNome || "alguém"}
              {ultimo.atendidoEm ? ` em ${formatDateTime(ultimo.atendidoEm)}` : ""}
            </span>
          </div>
        ) : !entrou ? (
          <p className="text-xs text-muted-foreground">
            Dá para pedir depois que a vinheta entrar em algum painel.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum pedido ainda.</p>
        )}
      </div>

      {(pedidos.length > 0 || fazChecking) && (
        <AnexosPanel
          entidade={etapa === "checkout" ? "ci_checkout" : "ci_foto"}
          entidadeId={ci.id}
          titulo="Fotos"
          aviso={`Ficam no Google Drive da empresa, na pasta desta CI › ${t.pasta}.`}
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
            <DialogTitle>
              {t.botao} · CI {ci.rotulo}
            </DialogTitle>
            <DialogDescription>{t.dialogo(ci)}</DialogDescription>
          </DialogHeader>
          <Textarea
            id={`ci-${etapa}-obs`}
            aria-label="Observação para o checking"
            rows={3}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder={t.placeholder}
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
                  () =>
                    (etapa === "checkout"
                      ? ciRepository.solicitarCheckout(ci.id, obs)
                      : ciRepository.solicitarFoto(ci.id, obs)
                    ).then(() => true),
                  t.okPedido,
                );
                setBusy(false);
                if (ok) {
                  setPedindo(false);
                  setObs("");
                }
              }}
            >
              <Icone />
              {t.botao}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
