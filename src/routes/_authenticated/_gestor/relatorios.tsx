import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Download, Hourglass, ListChecks, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { useCurrentUser, useProjects } from "@/hooks/use-data";
import { localToday } from "@/lib/data";
import { ALL_TIME, buildIndicators, monthPeriod } from "@/lib/data/report";
import { downloadIndicatorsPdf } from "@/lib/report-pdf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_gestor/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Patty One" },
      { name: "description", content: "Indicadores de clientes, tarefas e entregas da Patty One." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsPage,
});

/** The current month and the 11 before it, as YYYY-MM. */
function recentMonths(today: string): string[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p
        className={cn(
          "mt-2 text-3xl font-bold tabular-nums",
          tone === "danger" && value > 0 && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ReportsPage() {
  const today = localToday();
  const months = useMemo(() => recentMonths(today), [today]);
  const [selected, setSelected] = useState<string>(months[0] as string);
  const [busy, setBusy] = useState(false);
  const active = useProjects(false);
  const archived = useProjects(true);
  const { data: me } = useCurrentUser();

  const period = selected === "all" ? ALL_TIME : monthPeriod(selected);
  const loading = active.isPending || archived.isPending;
  const indicators = useMemo(
    () => buildIndicators([...(active.data ?? []), ...(archived.data ?? [])], period, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active.data, archived.data, selected, today],
  );

  const download = async () => {
    setBusy(true);
    try {
      await downloadIndicatorsPdf(indicators, period, me?.name ?? "Gestão");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Indicadores de clientes, tarefas e entregas. Inclui projetos arquivados."
        action={
          <Button onClick={download} disabled={loading || busy} className="h-10">
            <Download />
            {busy ? "Gerando…" : "Baixar PDF"}
          </Button>
        }
      />

      <div className="mb-5 flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Período</span>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-9 w-[14rem]" aria-label="Período do relatório">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {monthPeriod(m).label}
              </SelectItem>
            ))}
            <SelectItem value="all">{ALL_TIME.label}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <CardGridSkeleton />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi icon={Users} label="Clientes" value={indicators.clients.count} />
            <Kpi icon={ListChecks} label="Tarefas feitas" value={indicators.tasksTotal} />
            <Kpi icon={CheckCircle2} label="Entregues no prazo" value={indicators.onTime.length} />
            <Kpi
              icon={Clock}
              label="Entregues atrasados"
              value={indicators.late.length}
              tone="danger"
            />
            <Kpi icon={Hourglass} label="Não finalizados" value={indicators.open.length} />
          </div>

          <section className="surface-card">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
              Tarefas por colaborador
            </h2>
            {indicators.tasksByPerson.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Nenhuma tarefa concluída no período.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {indicators.tasksByPerson.map((p) => {
                  const share = Math.round((p.count / indicators.tasksTotal) * 100);
                  return (
                    <li key={p.name} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                      <span className="w-40 truncate">{p.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <span className="w-20 text-right tabular-nums text-muted-foreground">
                        {p.count} · {share}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <p className="text-xs text-muted-foreground">
            O PDF traz também a lista de clientes, as entregas (no prazo e atrasadas, com a
            diferença em dias) e os serviços ainda em aberto.
          </p>
        </div>
      )}
    </>
  );
}
