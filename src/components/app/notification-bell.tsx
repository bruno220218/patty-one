import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useDataAction } from "@/hooks/use-data";
import { notificationRepository, type AppNotification } from "@/lib/data";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One line describing the notification. */
function NotificationText({ n }: { n: AppNotification }) {
  const who = <span className="font-semibold">{n.actorName}</span>;
  const lib = (
    <span className="font-medium">
      liberação nº {n.liberacaoNumero}
      {n.projectName && ` · ${n.projectName}`}
    </span>
  );
  switch (n.tipo) {
    case "liberacao_nova":
      return (
        <span className="block break-words">
          {who} enviou a {lib} para a fila do PCP
        </span>
      );
    case "liberacao_reenviada":
      return (
        <span className="block break-words">
          {who} corrigiu e reenviou a {lib} (fim da fila)
        </span>
      );
    case "liberacao_reprovada":
      return (
        <span className="block break-words">
          {who} <span className="font-semibold text-destructive">reprovou</span> a {lib}
          {n.detalhe && (
            <span className="mt-0.5 block text-muted-foreground">Motivo: {n.detalhe}</span>
          )}
        </span>
      );
    case "liberacao_aprovada":
      return (
        <span className="block break-words">
          {who} <span className="font-semibold text-status-done-foreground">aprovou</span> a {lib}:
          já está em produção
        </span>
      );
    case "liberacao_comentario":
      return (
        <span className="block break-words">
          {who} comentou na {lib}
          {n.detalhe && <span className="mt-0.5 block text-muted-foreground">“{n.detalhe}”</span>}
        </span>
      );
    case "briefing_novo":
    case "briefing_andamento":
    case "briefing_concluido": {
      const verbo = {
        briefing_novo: "enviou um novo",
        briefing_andamento: "começou o",
        briefing_concluido: "concluiu o",
      }[n.tipo];
      return (
        <span className="block break-words">
          {who} {verbo}{" "}
          <span className="font-medium">
            briefing nº {n.refNumero}
            {n.projectName && ` · ${n.projectName}`}
          </span>
          {n.detalhe && <span className="mt-0.5 block text-muted-foreground">{n.detalhe}</span>}
        </span>
      );
    }
    case "visita_nova":
    case "visita_agendada":
    case "visita_realizada":
    case "visita_cancelada": {
      const verbo = {
        visita_nova: "pediu a",
        visita_agendada: "agendou a",
        visita_realizada: "fez a",
        visita_cancelada: "cancelou a",
      }[n.tipo];
      return (
        <span className="block break-words">
          {who} {verbo}{" "}
          <span className="font-medium">
            visita técnica nº {n.refNumero}
            {n.projectName && ` · ${n.projectName}`}
          </span>
          {n.detalhe && (
            <span className="mt-0.5 block text-muted-foreground">
              {n.tipo === "visita_cancelada" ? `Motivo: ${n.detalhe}` : n.detalhe}
            </span>
          )}
        </span>
      );
    }
    case "ci_foto_solicitada":
    case "ci_foto_enviada": {
      const ci = (
        <span className="font-medium">
          CI nº {n.refNumero} · {n.projectName}
        </span>
      );
      return (
        <span className="block break-words">
          {n.tipo === "ci_foto_solicitada" ? (
            <>
              {who} pediu a <span className="font-semibold">foto da veiculação</span> da {ci}
            </>
          ) : (
            <>
              {who} enviou as <span className="font-semibold">fotos da veiculação</span> da {ci}
            </>
          )}
          {n.detalhe && <span className="mt-0.5 block text-muted-foreground">{n.detalhe}</span>}
        </span>
      );
    }
    case "ci_checkout_solicitada":
    case "ci_checkout_enviada": {
      const ci = (
        <span className="font-medium">
          CI nº {n.refNumero} · {n.projectName}
        </span>
      );
      return (
        <span className="block break-words">
          {n.tipo === "ci_checkout_solicitada" ? (
            <>
              {who} pediu o <span className="font-semibold">checkout</span> (foto do fim da
              veiculação) da {ci}
            </>
          ) : (
            <>
              {who} enviou as <span className="font-semibold">fotos do checkout</span> da {ci}
            </>
          )}
          {n.detalhe && <span className="mt-0.5 block text-muted-foreground">{n.detalhe}</span>}
        </span>
      );
    }
    case "prazo_solicitado":
    case "prazo_definido": {
      const pedido = (
        <span className="font-medium">
          pedido nº {n.refNumero}
          {n.projectName && ` · ${n.projectName}`}
        </span>
      );
      return (
        <span className="block break-words">
          {n.tipo === "prazo_solicitado" ? (
            <>
              {who} pediu o <span className="font-semibold">prazo de entrega</span> do {pedido}
            </>
          ) : (
            <>
              {who}{" "}
              <span className="font-semibold text-status-done-foreground">definiu o prazo</span> do{" "}
              {pedido}
            </>
          )}
          {n.detalhe && <span className="mt-0.5 block text-muted-foreground">{n.detalhe}</span>}
        </span>
      );
    }
    case "ci_nova":
    case "ci_vinheta_entrou":
    case "ci_recusada": {
      const ci = (
        <span className="font-medium">
          CI nº {n.refNumero} · {n.projectName}
        </span>
      );
      return (
        <span className="block break-words">
          {n.tipo === "ci_nova" && (
            <>
              {who} criou a {ci}: vinheta para entrar nos painéis
            </>
          )}
          {n.tipo === "ci_vinheta_entrou" && (
            <>
              {who} deu entrada na {ci}
            </>
          )}
          {n.tipo === "ci_recusada" && (
            <>
              {who} <span className="font-semibold text-destructive">recusou</span> a entrada da{" "}
              {ci}
            </>
          )}
          {n.detalhe && <span className="mt-0.5 block text-muted-foreground">{n.detalhe}</span>}
        </span>
      );
    }
    case "rgb_vencendo":
    case "rgb_vence_hoje":
    case "rgb_vencida": {
      const quando = {
        rgb_vencendo: (
          <span className="font-semibold text-status-progress-foreground">vence em breve</span>
        ),
        rgb_vence_hoje: (
          <span className="font-semibold text-status-progress-foreground">vence hoje</span>
        ),
        rgb_vencida: <span className="font-semibold text-destructive">venceu</span>,
      }[n.tipo];
      return (
        <span className="block break-words">
          Painéis RGB: o contrato de <span className="font-medium">{n.projectName}</span> {quando}
          {n.detalhe && <span className="mt-0.5 block text-muted-foreground">{n.detalhe}</span>}
        </span>
      );
    }
    default:
      return (
        <span className="block break-words">
          {who} concluiu <span className="font-medium">“{n.taskTitle}”</span>
          {n.projectName && (
            <>
              {" "}
              em <span className="font-medium">{n.projectName}</span>
            </>
          )}
        </span>
      );
  }
}

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Bell with the person's notifications (completed tasks for gestão and PCP; liberação flow for PCP/direção and comercial). `variant="sidebar"` renders a full-width
 * menu row (desktop); `variant="icon"` an icon button (mobile header).
 */
export function NotificationBell({
  notifications,
  variant,
}: {
  notifications: AppNotification[];
  variant: "sidebar" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const run = useDataAction();
  const navigate = useNavigate();
  const unread = notifications.filter((n) => n.readAt === null).length;
  const label = unread > 0 ? `Notificações (${unread} não lidas)` : "Notificações";

  const openNotification = async (n: AppNotification) => {
    setOpen(false);
    if (n.readAt === null) void run(() => notificationRepository.markRead(n.id));
    if (n.link.startsWith("/")) {
      await navigate({ to: n.link });
    } else if (n.tipo !== "tarefa_concluida" && n.liberacaoId) {
      // Approved: go to the production project when there is one.
      if (n.tipo === "liberacao_aprovada" && n.projectId) {
        await navigate({ to: "/projetos/$projectId", params: { projectId: n.projectId } });
      } else {
        await navigate({ to: "/liberacoes/$liberacaoId", params: { liberacaoId: n.liberacaoId } });
      }
    } else if (n.projectId) {
      await navigate({ to: "/projetos/$projectId", params: { projectId: n.projectId } });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "sidebar" ? (
          <button
            type="button"
            aria-label={label}
            className="inline-flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Bell className="h-4 w-4" />
            Notificações
            <UnreadBadge count={unread} className="ml-auto" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={label}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:text-primary"
          >
            <Bell className="h-[18px] w-[18px]" />
            <UnreadBadge count={unread} className="absolute -right-1 -top-1" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        side={variant === "sidebar" ? "right" : "bottom"}
        align="end"
        collisionPadding={12}
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-sm font-semibold">Notificações</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => run(() => notificationRepository.markAllRead())}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas como lidas
            </Button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma notificação</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openNotification(n)}
                  className={cn(
                    "flex w-full gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                    n.readAt === null && "bg-primary/5",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.readAt === null ? "bg-primary" : "bg-transparent",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <NotificationText n={n} />
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatRelative(n.createdAt)}
                      {n.readAt === null && <span className="sr-only"> · não lida</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
