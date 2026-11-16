import { useEffect, useState, type FormEvent } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Checklist, ChecklistInput } from "@/lib/data";

export function ChecklistFormDialog({
  open,
  onOpenChange,
  checklist,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog edits this checklist. */
  checklist?: Checklist | null;
  onSubmit: (input: ChecklistInput) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fixedParams, setFixedParams] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(checklist?.name ?? "");
      setDescription(checklist?.description ?? "");
      setFixedParams(checklist?.fixedParams ?? false);
      setError(null);
    }
  }, [open, checklist]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Informe o nome do checklist.");
      return;
    }
    setSaving(true);
    const result = await onSubmit({ name, description, fixedParams });
    setSaving(false);
    if (result !== undefined) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>{checklist ? "Editar checklist" : "Novo checklist"}</DialogTitle>
            <DialogDescription>
              {checklist
                ? "Altere o nome, a descrição ou as regras deste checklist."
                : "Depois de criar, adicione as tarefas do checklist."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="checklist-name">Nome *</Label>
            <Input
              id="checklist-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "checklist-name-error" : undefined}
            />
            {error && (
              <p id="checklist-name-error" className="text-xs font-medium text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="checklist-description">Descrição</Label>
            <Textarea
              id="checklist-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="checklist-fixed">Parâmetros fixos</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Nos projetos criados a partir deste checklist, as tarefas só poderão ser marcadas
                como feitas — sem adicionar, editar, excluir ou reordenar.
              </p>
            </div>
            <Switch id="checklist-fixed" checked={fixedParams} onCheckedChange={setFixedParams} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {checklist ? "Salvar" : "Criar checklist"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
