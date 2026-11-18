import type { VinhetaSituacao, VinhetaTipo } from "@/lib/data";

/** Text color per tipo, following the spreadsheet legend (venda = plain). */
export const TIPO_TEXTO: Record<VinhetaTipo, string> = {
  venda: "text-foreground",
  permuta: "text-emerald-700 dark:text-emerald-400",
  camp_patty: "text-violet-700 dark:text-violet-400",
  doacao: "text-sky-700 dark:text-sky-400",
  reserva: "text-orange-700 dark:text-orange-400",
  evento: "text-pink-700 dark:text-pink-400",
  indisponivel: "text-muted-foreground",
};

/** Small dot in the same color, for legends and compact lists. */
export const TIPO_PONTO: Record<VinhetaTipo, string> = {
  venda: "bg-foreground/70",
  permuta: "bg-emerald-600 dark:bg-emerald-400",
  camp_patty: "bg-violet-600 dark:bg-violet-400",
  doacao: "bg-sky-600 dark:bg-sky-400",
  reserva: "bg-orange-600 dark:bg-orange-400",
  evento: "bg-pink-600 dark:bg-pink-400",
  indisponivel: "bg-muted-foreground/50",
};

/** Cell background per situação: what needs attention stands out. */
export const SITUACAO_FUNDO: Record<VinhetaSituacao["tipo"], string> = {
  no_ar: "",
  sem_fim: "",
  agendada: "bg-sky-500/10 outline-1 -outline-offset-1 outline-dashed outline-sky-500/50",
  vencendo: "bg-amber-400/20",
  hoje: "bg-amber-400/35",
  vencida: "bg-red-500/15",
  indisponivel: "bg-muted/70",
};

/** Short status for dense tables ("5d", "vencida há 7d"). */
export function situacaoCurta(s: VinhetaSituacao): string {
  switch (s.tipo) {
    case "no_ar":
      return "no ar";
    case "sem_fim":
      return "sem fim";
    case "agendada":
      return `entra em ${s.dias}d`;
    case "vencendo":
      return `vence em ${s.dias}d`;
    case "hoje":
      return "vence hoje";
    case "vencida":
      return `vencida há ${s.dias}d`;
    case "indisponivel":
      return "bloqueado";
  }
}

export const SITUACAO_TEXTO: Record<VinhetaSituacao["tipo"], string> = {
  no_ar: "text-status-done-foreground",
  sem_fim: "text-status-done-foreground",
  agendada: "text-sky-700 dark:text-sky-400",
  vencendo: "text-status-progress-foreground",
  hoje: "text-status-progress-foreground font-semibold",
  vencida: "text-destructive font-semibold",
  indisponivel: "text-muted-foreground",
};
