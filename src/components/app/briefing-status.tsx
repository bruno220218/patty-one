import { CheckCircle2, CircleDot, Sparkles } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/app/status-pill";
import { BRIEFING_STATUS_LABEL, type BriefingStatus } from "@/lib/data";

const STYLE: Record<BriefingStatus, { tone: PillTone; icon: typeof Sparkles }> = {
  novo: { tone: "progress", icon: Sparkles },
  em_andamento: { tone: "idle", icon: CircleDot },
  concluido: { tone: "done", icon: CheckCircle2 },
};

export function BriefingStatusBadge({ status }: { status: BriefingStatus }) {
  const s = STYLE[status];
  return (
    <StatusPill tone={s.tone} icon={s.icon}>
      {BRIEFING_STATUS_LABEL[status]}
    </StatusPill>
  );
}
