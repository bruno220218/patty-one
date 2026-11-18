import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CircleCheck,
  Infinity as InfinityIcon,
} from "lucide-react";
import { situacaoLabel, type VinhetaSituacao } from "@/lib/data";
import { StatusPill, type PillTone } from "./status-pill";

const TONE: Record<VinhetaSituacao["tipo"], PillTone> = {
  indisponivel: "muted",
  agendada: "idle",
  no_ar: "done",
  sem_fim: "done",
  vencendo: "progress",
  hoje: "progress",
  vencida: "danger",
};

const ICON = {
  indisponivel: Ban,
  agendada: CalendarClock,
  no_ar: CircleCheck,
  sem_fim: InfinityIcon,
  vencendo: AlertTriangle,
  hoje: AlertTriangle,
  vencida: AlertTriangle,
} satisfies Record<VinhetaSituacao["tipo"], unknown>;

/** Where a vinheta stands today: no ar, vence em X dias, vencida… */
export function VinhetaSituacaoPill({ situacao }: { situacao: VinhetaSituacao }) {
  return (
    <StatusPill tone={TONE[situacao.tipo]} icon={ICON[situacao.tipo]}>
      {situacaoLabel(situacao)}
    </StatusPill>
  );
}
