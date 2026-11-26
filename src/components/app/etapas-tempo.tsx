import { useEffect, useState } from "react";
import { Check, Pause, Play, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDataAction } from "@/hooks/use-data";
import {
  abreviarNome,
  horasGastas,
  operacaoRepository,
  progressoEtapa,
  situacaoEtapa,
  TEXTO_BASE_ESTIMATIVA,
  textoHoras,
  type Colaborador,
  type EtapaOrdem,
  type SituacaoEtapa,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Common reasons first: they also tell the PCP (and the skill) why the step stopped. */
const MOTIVOS_PAUSA = [
  "Fim do expediente",
  "Falta de material",
  "Aguardando cliente",
  "Outra urgência",
  "Clima",
];

const COR_SITUACAO: Record<SituacaoEtapa, string> = {
  Pendente: "text-muted-foreground",
  "Em andamento": "text-primary",
  Pausada: "text-amber-600 dark:text-amber-400",
  Concluída: "text-emerald-600 dark:text-emerald-400",
};

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Steps of an existing order with Iniciar / Pausar / dar baixa and the learned estimate. */
export function EtapasComTempo({
  etapas,
  equipeOrdem,
  colaboradores,
  podeExecutar,
  fechada,
}: {
  etapas: EtapaOrdem[];
  equipeOrdem: Colaborador[];
  colaboradores: Colaborador[];
  podeExecutar: boolean;
  fechada: boolean;
}) {
  const run = useDataAction();
  const [ocupado, setOcupado] = useState(false);
  const [iniciando, setIniciando] = useState<EtapaOrdem | null>(null);
  const [pausando, setPausando] = useState<EtapaOrdem | null>(null);
  // Open stretches keep counting on screen.
  const [agora, setAgora] = useState(() => new Date());
  const algumAberto = etapas.some((e) => e.trechos.some((t) => !t.fim));
  useEffect(() => {
    if (!algumAberto) return;
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, [algumAberto]);

  async function acao(fn: () => Promise<unknown>, ok?: string) {
    setOcupado(true);
    await run(fn, ok);
    setOcupado(false);
  }

  const podeMexer = podeExecutar && !fechada;

  return (
    <>
      <div className="space-y-2">
        {etapas.map((e, i) => {
          const situacao = situacaoEtapa(e);
          const aberto = e.trechos.find((t) => !t.fim);
          const ultimaPausa = [...e.trechos].reverse().find((t) => t.fimTipo === "pausa");
          const gastas = horasGastas(e.trechos, agora);
          const progresso = progressoEtapa(e.concluido, gastas, e.estimativa?.horas ?? null);
          return (
            <div key={e.id} className="space-y-2 rounded-xl border p-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  aria-label={e.concluido ? `Reabrir ${e.nome}` : `Dar baixa em ${e.nome}`}
                  title={e.concluido ? "Reabrir a etapa" : "Dar baixa (etapa concluída)"}
                  className="size-4 cursor-pointer accent-primary disabled:cursor-default"
                  checked={e.concluido}
                  disabled={!podeMexer || ocupado}
                  onChange={(ev) =>
                    void acao(
                      () => operacaoRepository.marcarEtapa(e.id, ev.target.checked),
                      ev.target.checked ? "Baixa registrada" : "Etapa reaberta",
                    )
                  }
                />
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {e.concluido ? <Check className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={e.concluido ? "text-muted-foreground line-through" : ""}>
                    {e.nome}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    <span className={cn("font-medium", COR_SITUACAO[situacao])}>{situacao}</span>
                    {aberto &&
                      ` desde ${horaCurta(aberto.inicio)} · ${aberto.pessoas} ${aberto.pessoas === 1 ? "pessoa" : "pessoas"}`}
                    {situacao === "Pausada" && ultimaPausa?.motivoPausa
                      ? `: ${ultimaPausa.motivoPausa}`
                      : ""}
                    {e.concluido && e.concluidoPorNome
                      ? ` · ${abreviarNome(e.concluidoPorNome)}${e.concluidoEm ? ` · ${formatDateTime(e.concluidoEm)}` : ""}`
                      : ""}
                  </span>
                </span>
                {podeMexer && !e.concluido && (
                  <div className="flex shrink-0 gap-1">
                    {aberto ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupado}
                        onClick={() => setPausando(e)}
                      >
                        <Pause />
                        Pausar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupado}
                        onClick={() => setIniciando(e)}
                      >
                        <Play />
                        {e.trechos.length ? "Retomar" : "Iniciar"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <TempoDaEtapa
                gastas={gastas}
                progresso={progresso}
                estimativa={e.estimativa}
                concluido={e.concluido}
                medido={e.trechos.length > 0}
              />
            </div>
          );
        })}
      </div>

      <IniciarDialog
        etapa={iniciando}
        equipeOrdem={equipeOrdem}
        colaboradores={colaboradores}
        onClose={() => setIniciando(null)}
        onConfirm={(ids) => {
          const etapa = iniciando;
          setIniciando(null);
          if (etapa) {
            void acao(() => operacaoRepository.iniciarEtapa(etapa.id, ids), "Etapa iniciada");
          }
        }}
      />
      <PausarDialog
        etapa={pausando}
        onClose={() => setPausando(null)}
        onConfirm={(motivo) => {
          const etapa = pausando;
          setPausando(null);
          if (etapa) {
            void acao(() => operacaoRepository.pausarEtapa(etapa.id, motivo), "Etapa pausada");
          }
        }}
      />
    </>
  );
}

function TempoDaEtapa({
  gastas,
  progresso,
  estimativa,
  concluido,
  medido,
}: {
  gastas: number;
  progresso: number | null;
  estimativa: EtapaOrdem["estimativa"];
  concluido: boolean;
  medido: boolean;
}) {
  if (!medido && !estimativa) {
    return (
      <p className="pl-[3.25rem] text-xs text-muted-foreground">
        Sem histórico ainda: o tempo desta etapa começa a ser aprendido quando ela for medida.
      </p>
    );
  }
  const partes = [
    medido ? `${textoHoras(gastas)} ${concluido ? "gastas" : "até agora"}` : "",
    estimativa
      ? `estimativa ${textoHoras(estimativa.horas)} (${estimativa.amostras} ${estimativa.amostras === 1 ? "amostra" : "amostras"}, ${TEXTO_BASE_ESTIMATIVA[estimativa.base]})`
      : medido
        ? "sem estimativa ainda"
        : "",
  ].filter(Boolean);
  const passou = Boolean(estimativa && gastas > estimativa.horas * 1.2);
  return (
    <div className="space-y-1 pl-[3.25rem]">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Timer className="size-3.5 shrink-0" />
        <span>
          {partes.join(" · ")}
          {passou && (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {" "}
              · acima do previsto
            </span>
          )}
        </span>
      </p>
      {progresso !== null && !concluido && medido && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                passou ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${progresso}%` }}
            />
          </div>
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {progresso}%
          </span>
        </div>
      )}
    </div>
  );
}

function IniciarDialog({
  etapa,
  equipeOrdem,
  colaboradores,
  onClose,
  onConfirm,
}: {
  etapa: EtapaOrdem | null;
  equipeOrdem: Colaborador[];
  colaboradores: Colaborador[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (etapa) setIds(equipeOrdem.map((c) => c.id));
  }, [etapa, equipeOrdem]);
  const lista = colaboradores.filter((c) => c.ativo || ids.includes(c.id));
  return (
    <Dialog open={Boolean(etapa)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {etapa?.trechos.length ? "Retomar" : "Iniciar"} “{etapa?.nome}”
          </DialogTitle>
          <DialogDescription>
            Quem trabalha nesta etapa agora? O tempo conta para cada pessoa marcada. A equipe da
            ordem já vem marcada.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-72 gap-1 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2">
          {lista.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={ids.includes(c.id)}
                onChange={(e) =>
                  setIds(e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))
                }
              />
              <span title={c.nome}>{abreviarNome(c.nome)}</span>
            </label>
          ))}
          {!lista.length && (
            <p className="col-span-full p-3 text-center text-sm text-muted-foreground">
              Nenhum colaborador cadastrado: conta 1 pessoa.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(ids)}>
            <Play />
            {ids.length > 1 ? `Iniciar com ${ids.length} pessoas` : "Iniciar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PausarDialog({
  etapa,
  onClose,
  onConfirm,
}: {
  etapa: EtapaOrdem | null;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  useEffect(() => {
    if (etapa) setMotivo("");
  }, [etapa]);
  return (
    <Dialog open={Boolean(etapa)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pausar “{etapa?.nome}”</DialogTitle>
          <DialogDescription>
            O tempo para de contar. O motivo fica no histórico e ajuda o PCP a reprogramar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {MOTIVOS_PAUSA.map((m) => (
            <Button
              key={m}
              type="button"
              size="sm"
              variant={motivo === m ? "default" : "outline"}
              onClick={() => setMotivo(m)}
            >
              {m}
            </Button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="motivo-pausa">Motivo</Label>
          <Textarea
            id="motivo-pausa"
            rows={3}
            placeholder="Ex.: faltou 1 chapa preta fosca, chega amanhã às 08h"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!motivo.trim()} onClick={() => onConfirm(motivo.trim())}>
            <Pause />
            Pausar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
