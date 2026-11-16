import { Lock } from "lucide-react";
import type { ProjectStatus } from "@/lib/data";
import { cn } from "@/lib/utils";

const LABELS: Record<ProjectStatus, string> = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  done: "Concluído",
};

const STYLES: Record<ProjectStatus, string> = {
  not_started: "bg-status-idle text-status-idle-foreground",
  in_progress: "bg-status-progress text-status-progress-foreground",
  done: "bg-status-done text-status-done-foreground",
};

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        STYLES[status],
        className,
      )}
    >
      {LABELS[status]}
    </span>
  );
}

export function FixedParamsBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-locked px-2.5 py-0.5 text-xs font-semibold text-locked-foreground",
        className,
      )}
    >
      <Lock className="h-3 w-3" />
      Parâmetros fixos
    </span>
  );
}
