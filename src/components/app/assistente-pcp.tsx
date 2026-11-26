import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarCheck, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { dataBR } from "@/lib/data";
import { cn } from "@/lib/utils";
import {
  AssistenteError,
  assistenteLigado,
  definirAssistenteLigado,
  pedirAssistente,
} from "@/lib/ai/assistente-pcp-client";
import {
  ROTULO_AVALIACAO,
  type AssistenteRequest,
  type AssistenteResposta,
  type CargaProducao,
  type MomentoAssistente,
} from "@/lib/ai/assistente-pcp-schema";

const TITULO: Record<MomentoAssistente, string> = {
  prazo: "Sugestão de prazo",
  liberacao: "Revisão da liberação",
  ordem: "Revisão da ordem",
  programacao: "Programação do dia",
};

/**
 * Assistente do PCP: a side panel that opens by itself at the PCP's moments (answering a
 * deadline request, approving a liberação, an order, the day's Programação), with the
 * workload and the AI's suggestions. It never saves anything: "Usar esta data" and "Aplicar"
 * only fill the form. Each person can turn off the automatic opening; the button stays.
 */
export function AssistentePcp({
  pedido: alvo,
  versao,
  onUsarData,
  onAplicarOrdem,
}: {
  pedido: AssistenteRequest;
  /** Changes when the record changes, so a new suggestion is asked. */
  versao: string;
  onUsarData?: (data: string) => void;
  /** Order page: fills complexity/priority in the form (the PCP still saves). */
  onAplicarOrdem?: (valores: { complexidade?: string; prioridade?: string }) => void;
}) {
  const momento = alvo.momento;
  // Stable across renders even when the caller passes a new object literal.
  const chaveAlvo = JSON.stringify(alvo);
  const [aberto, setAberto] = useState(false);
  const [ligado, setLigado] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<AssistenteResposta | null>(null);
  const pedido = useRef<AbortController | null>(null);

  const carregar = useCallback(
    async (novo = false) => {
      pedido.current?.abort();
      const ctrl = new AbortController();
      pedido.current = ctrl;
      setCarregando(true);
      setErro(null);
      try {
        setResposta(
          await pedirAssistente(JSON.parse(chaveAlvo) as AssistenteRequest, versao, {
            signal: ctrl.signal,
            novo,
          }),
        );
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setErro(e instanceof AssistenteError ? e.message : "O assistente não respondeu agora.");
      } finally {
        if (pedido.current === ctrl) setCarregando(false);
      }
    },
    [chaveAlvo, versao],
  );

  // Opens by itself once per record/version, unless turned off.
  useEffect(() => {
    const ok = assistenteLigado();
    setLigado(ok);
    setResposta(null);
    if (ok) {
      setAberto(true);
      void carregar();
    } else {
      setAberto(false);
    }
    return () => pedido.current?.abort();
  }, [carregar]);

  function abrir() {
    setAberto(true);
    if (!resposta && !carregando) void carregar();
  }

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="fixed right-4 bottom-4 z-40 shadow-md"
        onClick={abrir}
      >
        <Sparkles />
        Assistente do PCP
      </Button>
    );
  }

  return (
    <aside
      aria-label="Assistente do PCP"
      className="fixed right-4 bottom-4 z-40 flex max-h-[80vh] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-2xl border bg-card shadow-xl"
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" />
          Assistente do PCP · {TITULO[momento]}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Fechar o assistente"
          onClick={() => setAberto(false)}
        >
          <X />
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
        {carregando && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Olhando a carga e pensando numa sugestão…
          </p>
        )}
        {erro && !carregando && <p className="text-destructive">{erro}</p>}
        {resposta && !carregando && (
          <>
            {resposta.aviso && <p className="text-muted-foreground">{resposta.aviso}</p>}
            {resposta.momento === "prazo" && resposta.sugestao && (
              <div className="space-y-2">
                {resposta.sugestao.dataSugerida && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3">
                    <span>
                      Prazo sugerido:{" "}
                      <strong className="text-base">
                        {dataBR(resposta.sugestao.dataSugerida)}
                      </strong>
                    </span>
                    {onUsarData && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onUsarData(resposta.sugestao?.dataSugerida ?? "")}
                      >
                        <CalendarCheck />
                        Usar esta data
                      </Button>
                    )}
                  </div>
                )}
                {resposta.sugestao.resumo && <p>{resposta.sugestao.resumo}</p>}
                <Lista itens={resposta.sugestao.motivos} />
                <Alertas itens={resposta.sugestao.alertas} />
              </div>
            )}
            {resposta.momento === "liberacao" && resposta.sugestao && (
              <div className="space-y-3">
                {resposta.sugestao.resumo && <p>{resposta.sugestao.resumo}</p>}
                {resposta.sugestao.prazo && (
                  <p
                    className={cn(
                      "rounded-xl border p-2.5",
                      resposta.sugestao.prazo.avaliacao === "cabe"
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : resposta.sugestao.prazo.avaliacao === "sem_prazo"
                          ? "border-border bg-muted"
                          : "border-amber-400/50 bg-amber-400/15",
                    )}
                  >
                    <strong>{ROTULO_AVALIACAO[resposta.sugestao.prazo.avaliacao]}.</strong>{" "}
                    {resposta.sugestao.prazo.comentario}
                  </p>
                )}
                {resposta.sugestao.faltando.length > 0 && (
                  <div>
                    <p className="font-medium">O que falta</p>
                    <Lista itens={resposta.sugestao.faltando} />
                  </div>
                )}
                {resposta.sugestao.checklists.length > 0 && (
                  <div>
                    <p className="font-medium">Checklist sugerido</p>
                    <ul className="mt-1 space-y-1">
                      {resposta.sugestao.checklists.map((c) => (
                        <li key={c.ordem}>
                          Ordem nº {c.ordem}: <strong>{c.checklist}</strong>
                          {c.motivo && <span className="text-muted-foreground"> — {c.motivo}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Alertas itens={resposta.sugestao.alertas} />
              </div>
            )}
            {resposta.momento === "ordem" && resposta.sugestao && (
              <div className="space-y-3">
                {resposta.sugestao.resumo && <p>{resposta.sugestao.resumo}</p>}
                {(resposta.sugestao.complexidade || resposta.sugestao.prioridade) && (
                  <div className="space-y-1.5 rounded-xl border p-2.5">
                    {resposta.sugestao.complexidade && (
                      <p>
                        Complexidade: <strong>{resposta.sugestao.complexidade.valor}</strong>
                        {resposta.sugestao.complexidade.motivo && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {resposta.sugestao.complexidade.motivo}
                          </span>
                        )}
                      </p>
                    )}
                    {resposta.sugestao.prioridade && (
                      <p>
                        Prioridade: <strong>{resposta.sugestao.prioridade.valor}</strong>
                        {resposta.sugestao.prioridade.motivo && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {resposta.sugestao.prioridade.motivo}
                          </span>
                        )}
                      </p>
                    )}
                    {onAplicarOrdem && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          onAplicarOrdem({
                            ...(resposta.sugestao?.complexidade
                              ? { complexidade: resposta.sugestao.complexidade.valor }
                              : {}),
                            ...(resposta.sugestao?.prioridade
                              ? { prioridade: resposta.sugestao.prioridade.valor }
                              : {}),
                          })
                        }
                      >
                        <CalendarCheck />
                        Aplicar na ordem
                      </Button>
                    )}
                  </div>
                )}
                {resposta.sugestao.etapasParadas.length > 0 && (
                  <div>
                    <p className="font-medium">Etapas paradas</p>
                    <Lista itens={resposta.sugestao.etapasParadas} />
                  </div>
                )}
                {resposta.sugestao.conferir.length > 0 && (
                  <div>
                    <p className="font-medium">O que conferir</p>
                    <Lista itens={resposta.sugestao.conferir} />
                  </div>
                )}
                <Alertas itens={resposta.sugestao.alertas} />
              </div>
            )}
            {resposta.momento === "programacao" && resposta.sugestao && (
              <div className="space-y-3">
                {resposta.sugestao.resumo && <p>{resposta.sugestao.resumo}</p>}
                {resposta.sugestao.prioridades.length > 0 && (
                  <div>
                    <p className="font-medium">Priorizar</p>
                    <ul className="mt-1 space-y-1">
                      {resposta.sugestao.prioridades.map((p) => (
                        <li key={p.ordem}>
                          Ordem nº {p.ordem}
                          {p.motivo && <span className="text-muted-foreground"> — {p.motivo}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {resposta.sugestao.conflitos.length > 0 && (
                  <div>
                    <p className="font-medium">Conflitos</p>
                    <Alertas itens={resposta.sugestao.conflitos} />
                  </div>
                )}
                <Lista itens={resposta.sugestao.sugestoes} />
                <Alertas itens={resposta.sugestao.alertas} />
              </div>
            )}
            <Carga carga={resposta.carga} />
          </>
        )}
      </div>

      <footer className="space-y-2 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Só sugestão: quem decide é o PCP. Nada é gravado pelo assistente.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch
              id="assistente-ligado"
              checked={ligado}
              onCheckedChange={(v) => {
                setLigado(v);
                definirAssistenteLigado(v);
              }}
            />
            <Label htmlFor="assistente-ligado" className="text-xs">
              Abrir sozinho
            </Label>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={carregando}
            onClick={() => void carregar(true)}
          >
            <RefreshCw />
            Nova sugestão
          </Button>
        </div>
      </footer>
    </aside>
  );
}

function Lista({ itens }: { itens: string[] }) {
  if (!itens.length) return null;
  return (
    <ul className="list-disc space-y-1 pl-5">
      {itens.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function Alertas({ itens }: { itens: string[] }) {
  if (!itens.length) return null;
  return (
    <ul className="space-y-1">
      {itens.map((t, i) => (
        <li key={i} className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** The numbers the suggestion was based on (shown even without the AI). */
function Carga({ carga }: { carga: CargaProducao }) {
  return (
    <details className="rounded-xl border p-2.5" open={false}>
      <summary className="cursor-pointer text-xs font-medium">Carga das próximas semanas</summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {carga.atrasadas} {carga.atrasadas === 1 ? "ordem atrasada" : "ordens atrasadas"} ·{" "}
        {carga.aguardando_liberacao} aguardando liberação · {carga.sem_data} sem data prevista
      </p>
      <ul className="mt-2 space-y-1 text-xs">
        {carga.semanas.map((s) => {
          const prog = Object.entries(s.programacao_por_setor)
            .map(([setor, n]) => `${setor} ${n}`)
            .join(", ");
          return (
            <li key={s.inicio}>
              <span className="font-medium">Semana de {dataBR(s.inicio)}:</span> {s.ordens}{" "}
              {s.ordens === 1 ? "ordem" : "ordens"} · {s.etapas_abertas} etapas abertas
              {prog ? ` · Programação: ${prog}` : ""}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
