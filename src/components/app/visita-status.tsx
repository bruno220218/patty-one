import { CalendarClock, CheckCircle2, Clock, XCircle } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/app/status-pill";
import { VISITA_STATUS_LABEL, type VisitaStatus } from "@/lib/data";

const STYLE: Record<VisitaStatus, { tone: PillTone; icon: typeof Clock }> = {
  solicitada: { tone: "progress", icon: Clock },
  agendada: { tone: "idle", icon: CalendarClock },
  realizada: { tone: "done", icon: CheckCircle2 },
  cancelada: { tone: "danger", icon: XCircle },
};

export function VisitaStatusBadge({ status }: { status: VisitaStatus }) {
  const s = STYLE[status];
  return (
    <StatusPill tone={s.tone} icon={s.icon}>
      {VISITA_STATUS_LABEL[status]}
    </StatusPill>
  );
}
