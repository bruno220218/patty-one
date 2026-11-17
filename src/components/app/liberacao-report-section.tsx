import { CheckCircle2, Clock, FileCheck2, PencilLine, ThumbsDown, Timer } from "lucide-react";
import { formatHoras, type LiberacaoIndicators } from "@/lib/data/report";
import { cn } from "@/lib/utils";

function Tile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
  hint?: string | undefined;
  tone?: "danger" | "good" | undefined;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "good" && "text-status-done-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Liberação indicators for the selected period (report page). */
export function LiberacaoReportSection({ ind }: { ind: LiberacaoIndicators }) {
  const decididas = ind.aprovadas + ind.reprovacoes;
  return (
    <section className="surface-card" aria-labelledby="rel-liberacoes">
      <h2 id="rel-liberacoes" className="border-b border-border px-4 py-3 text-sm font-semibold">
        Liberações
      </h2>
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
        <Tile icon={FileCheck2} label="Criadas" value={ind.criadas} />
        <Tile icon={CheckCircle2} label="Aprovadas" value={ind.aprovadas} tone="good" />
        <Tile
          icon={ThumbsDown}
          label="Reprovações"
          value={ind.reprovacoes}
          tone={ind.reprovacoes > 0 ? "danger" : undefined}
          hint={decididas ? `${Math.round((ind.reprovacoes / decididas) * 100)}% das decisões` : ""}
        />
        <Tile
          icon={CheckCircle2}
          label="Aprovadas de primeira"
          value={
            ind.aprovadas ? `${Math.round((ind.aprovadasDePrimeira / ind.aprovadas) * 100)}%` : "—"
          }
          hint={ind.aprovadas ? `${ind.aprovadasDePrimeira} de ${ind.aprovadas}` : ""}
        />
        <Tile icon={Timer} label="Tempo médio na fila" value={formatHoras(ind.horasMediasNaFila)} />
        <Tile
          icon={Clock}
          label="Na fila / em edição"
          value={`${ind.naFilaAgora} / ${ind.emEdicaoAgora}`}
          hint="agora"
        />
      </div>
      {ind.maisReprovadas.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <PencilLine className="h-3.5 w-3.5" />
            Mais reprovadas no período
          </p>
          <ul className="space-y-1 text-sm">
            {ind.maisReprovadas.map((r) => (
              <li key={r.numero} className="flex justify-between gap-3">
                <span className="truncate">
                  Nº {r.numero} · {r.cliente}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {r.vezes} {r.vezes === 1 ? "vez" : "vezes"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
