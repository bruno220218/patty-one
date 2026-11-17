import { CheckCircle2, CircleDot, Lightbulb, Sparkles, Timer, UserRound } from "lucide-react";
import { formatHoras, type BriefingIndicators } from "@/lib/data/report";

function Tile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Timer;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Bloco({ titulo, ind }: { titulo: string; ind: BriefingIndicators }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={Lightbulb} label="Criados" value={ind.criados} />
        <Tile icon={CheckCircle2} label="Concluídos" value={ind.concluidos} />
        <Tile
          icon={Timer}
          label="Tempo médio"
          value={formatHoras(ind.horasMediasAteConcluir)}
          hint="até concluir"
        />
        <Tile
          icon={CircleDot}
          label="Novos / em andamento"
          value={`${ind.novosAgora} / ${ind.emAndamentoAgora}`}
          hint="agora"
        />
      </div>
      {ind.porResponsavel.length > 0 && (
        <ul className="space-y-1 text-sm">
          {ind.porResponsavel.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 truncate">
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                {p.name}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {p.count} concluído{p.count === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Briefing indicators, separately for Criação and Projetos especiais (report page). */
export function BriefingReportSection({
  ind,
}: {
  ind: { criacao: BriefingIndicators; projetos_especiais: BriefingIndicators };
}) {
  return (
    <section className="surface-card" aria-labelledby="rel-briefings">
      <h2
        id="rel-briefings"
        className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold"
      >
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        Briefings
      </h2>
      <div className="grid gap-6 p-4 lg:grid-cols-2">
        <Bloco titulo="Criação" ind={ind.criacao} />
        <Bloco titulo="Projetos especiais" ind={ind.projetos_especiais} />
      </div>
    </section>
  );
}
