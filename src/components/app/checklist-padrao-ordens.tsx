import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/components/app/operacao-ui";
import { useDataAction } from "@/hooks/use-data";
import { operacaoRepository, TIPOS_ORDEM, type Checklist, type TipoOrdem } from "@/lib/data";

/**
 * Default checklist of the production orders of each type (0039): orders born from a
 * liberação get its tasks as steps; the PCP can still swap it before the order starts.
 */
export function ChecklistPadraoOrdens({ checklists }: { checklists: Checklist[] }) {
  const run = useDataAction();
  const padrao = useQuery({
    queryKey: ["operacao", "checklists-padrao"],
    queryFn: () => operacaoRepository.checklistsPadrao(),
  });
  const opcoes = checklists.filter((c) => c.tasks.length > 0);

  function escolher(tipo: TipoOrdem, id: string) {
    void run(
      () => operacaoRepository.definirChecklistPadrao(tipo, id || null),
      id
        ? `Checklist padrão das ordens de ${tipo} salvo.`
        : `Ordens de ${tipo} voltam às etapas padrão.`,
    );
  }

  return (
    <section className="mb-5 space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <ClipboardList className="size-4" />
          Etapas das ordens de produção
        </h2>
        <p className="text-sm text-muted-foreground">
          As ordens que nascem da liberação recebem as tarefas deste checklist como etapas. O PCP
          pode trocar na aprovação ou na ordem, antes de ela começar. Checklist com parâmetros fixos
          trava as etapas.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TIPOS_ORDEM.map((tipo) => (
          <div key={tipo} className="space-y-1.5">
            <Label htmlFor={`padrao-${tipo}`}>{tipo}</Label>
            <select
              id={`padrao-${tipo}`}
              className={selectClass}
              value={padrao.data?.[tipo] ?? ""}
              disabled={padrao.isPending}
              onChange={(e) => escolher(tipo, e.target.value)}
            >
              <option value="">Etapas padrão do tipo</option>
              {opcoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.fixedParams ? " (parâmetros fixos)" : ""}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </section>
  );
}
