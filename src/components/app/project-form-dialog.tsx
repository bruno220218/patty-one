import { useEffect, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Checklist, NewProjectInput, Project, ProjectInput } from "@/lib/data";
import { pluralTasks } from "@/lib/format";

const EMPTY = "__empty__";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (
  | {
      mode: "create";
      checklists: Checklist[];
      defaultChecklistId?: string | null;
      onSubmit: (input: NewProjectInput) => Promise<unknown>;
    }
  | {
      mode: "edit";
      project: Project;
      onSubmit: (input: ProjectInput) => Promise<unknown>;
    }
);

export function ProjectFormDialog(props: Props) {
  const { open, onOpenChange } = props;
  const [source, setSource] = useState(EMPTY);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (props.mode === "edit") {
      setName(props.project.name);
      setDescription(props.project.description);
      setDueDate(props.project.dueDate ?? "");
    } else {
      const initial =
        props.defaultChecklistId !== undefined
          ? (props.defaultChecklistId ?? EMPTY)
          : (props.checklists[0]?.id ?? EMPTY);
      setSource(initial);
      setName("");
      setDescription("");
      setDueDate("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected =
    props.mode === "create" ? props.checklists.find((c) => c.id === source) : undefined;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Informe o nome do projeto.");
      return;
    }
    setSaving(true);
    const base = { name, description, dueDate: dueDate || null };
    const result =
      props.mode === "create"
        ? await props.onSubmit({ ...base, checklistId: source === EMPTY ? null : source })
        : await props.onSubmit(base);
    setSaving(false);
    if (result !== undefined) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>{props.mode === "create" ? "Novo projeto" : "Editar projeto"}</DialogTitle>
            <DialogDescription>
              {props.mode === "create"
                ? "As tarefas do checklist são copiadas para o projeto, todas desmarcadas."
                : "Altere o nome, a descrição ou o prazo do projeto."}
            </DialogDescription>
          </DialogHeader>

          {props.mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="project-source">Criar a partir de</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id="project-source" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY}>Projeto vazio</SelectItem>
                  {props.checklists.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {pluralTasks(c.tasks.length)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected?.fixedParams && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Checklist com parâmetros fixos: as tarefas do projeto ficarão travadas.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="project-name">Nome do projeto *</Label>
            <Input
              id="project-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "project-name-error" : undefined}
            />
            {error && (
              <p id="project-name-error" className="text-xs font-medium text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Descrição</Label>
            <Textarea
              id="project-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-due">Prazo (opcional)</Label>
            <Input
              id="project-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-10"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {props.mode === "create" ? "Criar projeto" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
