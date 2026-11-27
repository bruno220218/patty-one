import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TAMANHOS_FONTE } from "@/lib/font-scale";
import { useTamanhoFonte } from "@/hooks/use-tamanho-fonte";
import { cn } from "@/lib/utils";

/** Botão redondo do topo, ao lado do tema. */
export function FontSizeToggle() {
  const [tamanho, escolher] = useTamanhoFonte();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Tamanho da letra"
          title="Tamanho da letra"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-card font-semibold text-muted-foreground shadow-sm transition-colors hover:text-primary"
        >
          <span aria-hidden className="leading-none">
            A<span className="text-xs">A</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Tamanho da letra</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TAMANHOS_FONTE.map((t) => (
          <DropdownMenuItem
            key={t.value}
            onSelect={() => escolher(t.value)}
            className="justify-between"
          >
            <span className={cn(t.amostra, tamanho === t.value && "font-semibold")}>{t.label}</span>
            {tamanho === t.value && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
