import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, Loader2, RotateCcw, SendHorizontal } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/use-data";
import {
  carregarDadosSetores,
  perguntarOrquestrador,
  type DadosSetores,
} from "@/lib/ai/orquestrador-client";
import type { ConsultaSetor, SituacaoSetor } from "@/lib/ai/orquestrador-schema";
import { cn } from "@/lib/utils";

/**
 * Orquestrador: ask about the operation in plain words; a central agent consults the sector
 * agents (PCP and Comercial have data today; the others say they don't yet). Nothing is written.
 */
export const Route = createFileRoute("/_authenticated/orquestrador")({
  head: () => ({
    meta: [{ title: "Orquestrador — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: OrquestradorPage,
});

type Mensagem =
  | { papel: "usuario"; texto: string }
  | { papel: "assistente"; texto: string; consultas: ConsultaSetor[] }
  | { papel: "erro"; texto: string };

/** The sectors' data is reloaded after this long, so answers follow the day. */
const VALIDADE_DADOS_MS = 10 * 60_000;

const EXEMPLOS = [
  "Quais ordens estão atrasadas e o que está travando cada uma?",
  "Quais CIs vencem nos próximos dias e ainda não foram renovadas?",
  "Tem proposta parada esperando resposta do cliente?",
  "Como está a carga da produção para amanhã?",
];

const ROTULO: Record<SituacaoSetor, string> = {
  respondeu: "consultado",
  sem_dados: "ainda sem dados",
  sem_acesso: "sem acesso",
  erro: "não respondeu",
};

function OrquestradorPage() {
  const { data: me } = useCurrentUser();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [etapa, setEtapa] = useState("");
  const dados = useRef<{ em: number; valor: DadosSetores } | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, enviando]);

  async function dadosAtuais(): Promise<DadosSetores> {
    if (dados.current && Date.now() - dados.current.em < VALIDADE_DADOS_MS) {
      return dados.current.valor;
    }
    const valor = me ? await carregarDadosSetores(me) : {};
    dados.current = { em: Date.now(), valor };
    return valor;
  }

  async function enviar(pergunta: string) {
    const mensagem = pergunta.trim();
    if (!mensagem || enviando) return;
    const historico = mensagens
      .filter((m): m is Exclude<Mensagem, { papel: "erro" }> => m.papel !== "erro")
      .slice(-6)
      .map((m) => ({ papel: m.papel, texto: m.texto.slice(0, 4000) }));
    setMensagens((atual) => [...atual, { papel: "usuario", texto: mensagem }]);
    setTexto("");
    setEnviando(true);
    try {
      setEtapa("Lendo os dados dos setores…");
      const valor = await dadosAtuais();
      setEtapa("Consultando os setores…");
      const r = await perguntarOrquestrador({
        mensagem,
        historico,
        usuario: { nome: me?.name ?? "", funcoes: me?.funcoes ?? [] },
        dados: valor,
      });
      setMensagens((atual) => [
        ...atual,
        { papel: "assistente", texto: r.resposta, consultas: r.consultas },
      ]);
    } catch (e) {
      setMensagens((atual) => [
        ...atual,
        {
          papel: "erro",
          texto: e instanceof Error ? e.message : "O orquestrador não respondeu agora.",
        },
      ]);
    } finally {
      setEnviando(false);
      setEtapa("");
    }
  }

  function recomecar() {
    setMensagens([]);
    dados.current = null;
  }

  return (
    <>
      <PageHeader
        title="Orquestrador"
        description="Pergunte sobre a operação. Ele consulta os setores e responde com os dados do Patty One. Hoje PCP e Comercial já têm dados; os outros setores entram aos poucos."
        action={
          mensagens.length > 0 && (
            <Button variant="outline" className="h-10" onClick={recomecar} disabled={enviando}>
              <RotateCcw />
              Nova conversa
            </Button>
          )
        }
      />

      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {mensagens.length === 0 && (
          <div className="surface-card space-y-3 p-5">
            <p className="text-sm text-muted-foreground">Algumas perguntas para começar:</p>
            <div className="flex flex-col gap-2">
              {EXEMPLOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => void enviar(e)}
                  className="rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        <ul className="flex flex-col gap-3" aria-live="polite">
          {mensagens.map((m, i) => (
            <li
              key={i}
              className={cn(
                "max-w-[90%] rounded-lg px-4 py-3 text-sm",
                m.papel === "usuario" && "self-end bg-primary text-primary-foreground",
                m.papel === "assistente" && "surface-card self-start",
                m.papel === "erro" && "self-start border border-destructive/40 text-destructive",
              )}
            >
              {m.papel === "assistente" && (
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Bot className="size-4" />
                  Orquestrador
                </div>
              )}
              <p className="whitespace-pre-wrap break-words leading-relaxed">{m.texto}</p>
              {m.papel === "assistente" && m.consultas.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.consultas.map((c) => (
                    <Badge
                      key={c.setor}
                      variant={c.situacao === "respondeu" ? "secondary" : "outline"}
                      className="font-normal"
                    >
                      {c.nome}: {ROTULO[c.situacao]}
                    </Badge>
                  ))}
                </div>
              )}
            </li>
          ))}
          {enviando && (
            <li className="surface-card flex items-center gap-2 self-start px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {etapa || "Pensando…"}
            </li>
          )}
        </ul>
        <div ref={fim} />

        <form
          className="surface-card sticky bottom-4 flex items-end gap-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(texto);
          }}
        >
          <Textarea
            id="orquestrador-pergunta"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar(texto);
              }
            }}
            placeholder="Ex.: o que está atrasado na produção?"
            maxLength={2000}
            rows={2}
            className="min-h-[44px] resize-none"
            disabled={enviando}
            aria-label="Sua pergunta"
          />
          <Button type="submit" className="h-11" disabled={enviando || !texto.trim()}>
            <SendHorizontal />
            <span className="sr-only sm:not-sr-only">Enviar</span>
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          As respostas são sugestões da IA com base nos dados do sistema; confira antes de decidir.
        </p>
      </div>
    </>
  );
}
