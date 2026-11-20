import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock,
  FolderOpen,
  History,
  Mail,
  MessageSquare,
  PencilLine,
  Send,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  LIBERACAO_STATUS_LABEL,
  type Liberacao,
  type LiberacaoEvento,
  type LiberacaoStatus,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STYLE: Record<LiberacaoStatus, { className: string; icon: typeof Clock }> = {
  aguardando: { className: "bg-status-progress text-status-progress-foreground", icon: Clock },
  reprovada: { className: "bg-destructive/10 text-destructive", icon: PencilLine },
  aprovada: { className: "bg-status-done text-status-done-foreground", icon: CheckCircle2 },
};

/** Pill with the liberação status ("Na fila do PCP · 2ª" when a position is given). */
export function LiberacaoStatusBadge({
  status,
  posicao,
  className,
}: {
  status: LiberacaoStatus;
  posicao?: number | undefined;
  className?: string;
}) {
  const { className: tone, icon: Icon } = STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold",
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {LIBERACAO_STATUS_LABEL[status]}
      {posicao !== undefined && <span className="tabular-nums">· {posicao}ª</span>}
    </span>
  );
}

/** Where the liberação is in the flow, with the PCP actions (approve / reject). */
export function LiberacaoStatusPanel({
  liberacao,
  posicao,
  filaTotal,
  canAprovar,
  canEdit,
  onAprovar,
  onReprovar,
}: {
  liberacao: Liberacao;
  posicao: number | undefined;
  filaTotal: number;
  canAprovar: boolean;
  canEdit: boolean;
  onAprovar: () => void;
  onReprovar: () => void;
}) {
  return (
    <section
      aria-label="Situação da liberação"
      className={cn(
        "surface-card mb-4 flex flex-wrap items-center justify-between gap-3 border-l-4 px-5 py-4",
        liberacao.status === "aguardando" && "border-l-status-progress-foreground",
        liberacao.status === "reprovada" && "border-l-destructive",
        liberacao.status === "aprovada" && "border-l-status-done-foreground",
      )}
    >
      <div className="min-w-0 space-y-1">
        <LiberacaoStatusBadge status={liberacao.status} posicao={posicao} />
        {liberacao.status === "aguardando" && (
          <p className="text-sm text-muted-foreground">
            {posicao ? `${posicao}ª de ${filaTotal} na fila` : "Na fila"} · enviada em{" "}
            {formatDateTime(liberacao.enviadaEm)}.{" "}
            {canAprovar ? "Revise e decida." : "Aguardando PCP ou direção."}
          </p>
        )}
        {liberacao.status === "reprovada" && (
          <>
            <p className="text-sm">
              <span className="font-semibold">Motivo:</span> {liberacao.motivoReprovacao}
            </p>
            <p className="text-xs text-muted-foreground">
              Reprovada por {liberacao.decididoPorNome || "PCP"}
              {liberacao.decididoEm ? ` em ${formatDateTime(liberacao.decididoEm)}` : ""}.{" "}
              {canEdit
                ? "Corrija abaixo e salve: ela volta para o fim da fila do PCP."
                : "Aguardando correção do comercial."}
            </p>
          </>
        )}
        {liberacao.status === "aprovada" && (
          <p className="text-sm text-muted-foreground">
            Aprovada por {liberacao.decididoPorNome || "PCP"}
            {liberacao.decididoEm ? ` em ${formatDateTime(liberacao.decididoEm)}` : ""} e enviada
            para a produção.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {liberacao.status === "aguardando" && canAprovar && (
          <>
            <Button
              variant="outline"
              onClick={onReprovar}
              className="hover:bg-destructive/10 hover:text-destructive"
            >
              <ThumbsDown />
              Reprovar
            </Button>
            <Button onClick={onAprovar}>
              <ThumbsUp />
              Aprovar
            </Button>
          </>
        )}
        {liberacao.status === "aprovada" && liberacao.projectId && (
          <Button asChild>
            <Link to="/projetos/$projectId" params={{ projectId: liberacao.projectId }}>
              <FolderOpen />
              Abrir projeto
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

const EVENTO: Record<LiberacaoEvento["tipo"], { label: string; icon: typeof Clock; tone: string }> =
  {
    criada: { label: "Criada e enviada ao PCP", icon: Clock, tone: "text-muted-foreground" },
    reprovada: { label: "Reprovada", icon: ThumbsDown, tone: "text-destructive" },
    reenviada: {
      label: "Corrigida e reenviada (fim da fila)",
      icon: PencilLine,
      tone: "text-status-progress-foreground",
    },
    aprovada: {
      label: "Aprovada e enviada para produção",
      icon: CheckCircle2,
      tone: "text-status-done-foreground",
    },
    email_enviado: { label: "Enviada por e-mail", icon: Mail, tone: "text-muted-foreground" },
    comentario: { label: "Comentou", icon: MessageSquare, tone: "text-primary" },
  };

/** Timeline: criada → reprovada → reenviada → aprovada, with the team's comments in between. */
export function LiberacaoHistorico({
  eventos,
  onComentar,
}: {
  eventos: LiberacaoEvento[] | undefined;
  /** Missing for people who can't comment (account not approved yet). Resolves true when saved. */
  onComentar?: ((texto: string) => Promise<boolean>) | undefined;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!onComentar || !texto.trim()) return;
    setEnviando(true);
    const ok = await onComentar(texto);
    setEnviando(false);
    if (ok) setTexto("");
  };
  return (
    <section className="surface-card mt-6 p-5" aria-labelledby="historico">
      <h2 id="historico" className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4 text-muted-foreground" />
        Histórico e comentários
      </h2>
      {!eventos || eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem registros.</p>
      ) : (
        <ol className="space-y-3">
          {eventos.map((e) => {
            const ev = EVENTO[e.tipo];
            return (
              <li key={e.id} className="flex gap-3">
                <ev.icon className={cn("mt-0.5 h-4 w-4 shrink-0", ev.tone)} />
                <div className="min-w-0 text-sm">
                  <p>
                    <span className="font-medium">{ev.label}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {e.autorNome || "Alguém da equipe"} · {formatDateTime(e.createdAt)}
                    </span>
                  </p>
                  {e.detalhe && (
                    <p className="whitespace-pre-wrap text-muted-foreground">“{e.detalhe}”</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {onComentar && (
        <form onSubmit={enviar} className="mt-4 space-y-2 border-t pt-4">
          <label htmlFor="lib-comentario" className="text-sm font-medium">
            Comentar
          </label>
          <Textarea
            id="lib-comentario"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Dúvida, aviso ou combinado sobre esta liberação. Quem criou e o PCP são avisados."
            rows={2}
            maxLength={2000}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={enviando || !texto.trim()} className="h-9">
              <Send />
              {enviando ? "Enviando…" : "Comentar"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
