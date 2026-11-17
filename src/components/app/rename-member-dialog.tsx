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

const MAX_NAME = 80;

export function RenameMemberDialog({
  open,
  onOpenChange,
  currentName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  /** Resolves to undefined when the rename failed (the dialog stays open). */
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
    }
  }, [open, currentName]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError("Informe o nome.");
      return;
    }
    if (clean === currentName.trim()) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    const result = await onSubmit(clean);
    setSaving(false);
    if (result !== undefined) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>Renomear</DialogTitle>
            <DialogDescription>
              O novo nome aparece na equipe e nos projetos, inclusive em tarefas já concluídas.
              Notificações já enviadas mantêm o nome antigo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="member-name">Nome *</Label>
            <Input
              id="member-name"
              autoFocus
              maxLength={MAX_NAME}
              value={name}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "member-name-error" : undefined}
            />
            {error && (
              <p id="member-name-error" className="text-xs font-medium text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
