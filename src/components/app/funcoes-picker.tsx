import { ChevronDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FUNCOES, type Funcao } from "@/lib/data";

/** Chips with the person's functions (or nothing when they have none). */
export function FuncoesChips({ funcoes }: { funcoes: Funcao[] }) {
  if (funcoes.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {FUNCOES.filter((f) => funcoes.includes(f.value)).map((f) => (
        <span
          key={f.value}
          className={
            f.value === "gestor"
              ? "rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground"
              : "rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground"
          }
        >
          {f.label}
        </span>
      ))}
    </span>
  );
}

/** Popover with a checkbox per function. */
export function FuncoesPicker({
  personName,
  funcoes,
  disabled,
  lockGestor,
  onToggle,
}: {
  personName: string;
  funcoes: Funcao[];
  disabled?: boolean;
  /** Prevents removing your own Gestão (you would lose access to this page). */
  lockGestor?: boolean;
  onToggle: (funcao: Funcao, on: boolean) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Funções de ${personName}`}
          className="h-8 gap-1.5"
        >
          <Users className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Funções</span>
          {funcoes.length > 0 && (
            <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
              {funcoes.length}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 pb-2 pt-1 text-xs font-semibold text-muted-foreground">
          Funções de {personName}
        </p>
        <ul className="space-y-0.5">
          {FUNCOES.map((f) => {
            const checked = funcoes.includes(f.value);
            const locked = f.value === "gestor" && lockGestor;
            return (
              <li key={f.value}>
                <label
                  className={
                    "flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60" +
                    (locked ? " cursor-not-allowed opacity-60" : "")
                  }
                >
                  <Checkbox
                    checked={checked}
                    disabled={locked}
                    onCheckedChange={(v) => onToggle(f.value, v === true)}
                    className="mt-0.5"
                  />
                  <span className="leading-tight">
                    <span className="block text-sm font-medium">{f.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {locked ? "Você não pode tirar sua própria gestão" : f.descricao}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
