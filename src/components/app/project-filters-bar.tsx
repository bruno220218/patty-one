import { LayoutGrid, List, ListTodo, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_PROJECT_FILTERS,
  type DueFilter,
  type ProgressFilter,
  type ProjectFilters,
  type ProjectSort,
} from "@/lib/data";

export type ProjectView = "kanban" | "lista";

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "todos", label: "Qualquer prazo" },
  { value: "atrasados", label: "Atrasados" },
  { value: "7dias", label: "Próximos 7 dias" },
  { value: "30dias", label: "Próximos 30 dias" },
  { value: "sem_prazo", label: "Sem prazo" },
];

const PROGRESS_OPTIONS: { value: ProgressFilter; label: string }[] = [
  { value: "todos", label: "Qualquer produção" },
  { value: "0-25", label: "0–24%" },
  { value: "25-50", label: "25–49%" },
  { value: "50-75", label: "50–74%" },
  { value: "75-99", label: "75–99%" },
  { value: "100", label: "100%" },
];

const SORT_OPTIONS: { value: ProjectSort; label: string }[] = [
  { value: "prazo_asc", label: "Prazo mais próximo" },
  { value: "prazo_desc", label: "Prazo mais distante" },
  { value: "nome_asc", label: "Nome (A–Z)" },
  { value: "nome_desc", label: "Nome (Z–A)" },
  { value: "producao_desc", label: "Maior produção" },
  { value: "producao_asc", label: "Menor produção" },
];

export function ProjectFiltersBar({
  filters,
  onChange,
  view,
  onViewChange,
  shown,
  total,
}: {
  filters: ProjectFilters;
  onChange: (next: ProjectFilters) => void;
  view: ProjectView;
  onViewChange: (view: ProjectView) => void;
  shown: number;
  total: number;
}) {
  const set = <K extends keyof ProjectFilters>(key: K, value: ProjectFilters[K]) =>
    onChange({ ...filters, [key]: value });
  const filtering =
    filters.query.trim() !== "" ||
    filters.openTask.trim() !== "" ||
    filters.due !== "todos" ||
    filters.progress !== "todos";

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="Buscar por nome…"
            aria-label="Buscar projeto por nome"
            className="h-9 pl-9"
          />
        </div>

        <Select value={filters.due} onValueChange={(v) => set("due", v as DueFilter)}>
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Filtrar por prazo de entrega">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DUE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.progress}
          onValueChange={(v) => set("progress", v as ProgressFilter)}
        >
          <SelectTrigger className="h-9 w-[11rem]" aria-label="Filtrar por % de produção">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROGRESS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.sort} onValueChange={(v) => set("sort", v as ProjectSort)}>
          <SelectTrigger className="h-9 w-[13.5rem]" aria-label="Ordenar projetos">
            <span className="mr-1 shrink-0 text-muted-foreground">Ordenar:</span>
            <span className="min-w-0 flex-1 truncate text-left">
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <ListTodo className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.openTask}
            onChange={(e) => set("openTask", e.target.value)}
            placeholder="Tarefa em aberto… ex.: instalação, arte, corte"
            aria-label="Mostrar só projetos com esta tarefa ainda em aberto"
            className="h-9 pl-9 pr-8"
          />
          {filters.openTask && (
            <button
              type="button"
              onClick={() => set("openTask", "")}
              aria-label="Limpar tarefa em aberto"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          value={view}
          onValueChange={(v) => v && onViewChange(v as ProjectView)}
          aria-label="Visualização"
          className="ml-auto shrink-0"
        >
          <ToggleGroupItem value="kanban" aria-label="Kanban" className="h-9 gap-1.5 px-3">
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">Kanban</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="lista" aria-label="Lista" className="h-9 gap-1.5 px-3">
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">Lista</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {filtering && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {shown} de {total} {total === 1 ? "projeto" : "projetos"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onChange({ ...DEFAULT_PROJECT_FILTERS, sort: filters.sort })}
          >
            <X className="h-3 w-3" />
            Limpar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
