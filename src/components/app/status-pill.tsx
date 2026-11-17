import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PillTone = "idle" | "progress" | "done" | "danger" | "muted";

const TONE: Record<PillTone, string> = {
  idle: "bg-status-idle text-status-idle-foreground",
  progress: "bg-status-progress text-status-progress-foreground",
  done: "bg-status-done text-status-done-foreground",
  danger: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

/** Small colored status pill (briefings, visitas). */
export function StatusPill({
  tone,
  icon: Icon,
  children,
  className,
}: {
  tone: PillTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        TONE[tone],
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}
