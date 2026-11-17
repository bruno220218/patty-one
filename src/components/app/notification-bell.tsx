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
 * Bell with the person's notifications (tasks for gestão; liberação flow for PCP/direção and comercial). `variant="sidebar"` renders a full-width
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
    if (n.tipo !== "tarefa_concluida" && n.liberacaoId) {
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
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Bell className="h-4 w-4" />
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
