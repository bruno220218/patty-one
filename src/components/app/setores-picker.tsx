import { ChevronDown, Factory } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SetorProducao } from "@/lib/data";

/** Chips with the person's production sectors, in list order (nothing when none). */
export function SetoresChips({ setores, ids }: { setores: SetorProducao[]; ids: string[] }) {
  const meus = setores.filter((s) => ids.includes(s.id));
  if (meus.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {meus.map((s) => (
        <span
          key={s.id}
          className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          {s.nome}
        </span>
      ))}
    </span>
  );
}

/** Popover with a checkbox per production sector; a person can be in several. */
export function SetoresPicker({
  personName,
  setores,
  ids,
  disabled,
  onToggle,
}: {
  personName: string;
  setores: SetorProducao[];
  ids: string[];
  disabled?: boolean;
  onToggle: (setor: SetorProducao, on: boolean) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Setores da Produção de ${personName}`}
          className="h-8 gap-1.5"
        >
          <Factory className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Setores</span>
          {ids.length > 0 && (
            <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
              {ids.length}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <p className="px-2 pb-1 pt-1 text-xs font-semibold text-muted-foreground">
          Setores de {personName}
        </p>
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          Onde a pessoa trabalha na Produção. Pode marcar mais de um.
        </p>
        <ul className="space-y-0.5">
          {setores.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60">
                <Checkbox
                  checked={ids.includes(s.id)}
                  onCheckedChange={(v) => onToggle(s, v === true)}
                />
                <span className="text-sm font-medium">{s.nome}</span>
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
