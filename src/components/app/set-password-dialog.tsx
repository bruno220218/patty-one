import { useEffect, useState, type FormEvent } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
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

/** Easy-to-read temporary password (no 0/O/1/l). */
function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  const part = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `patty-${part}`;
}

export function SetPasswordDialog({
  open,
  onOpenChange,
  personName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  /** Resolves to undefined when it failed (the dialog stays open). */
  onSubmit: (password: string) => Promise<unknown>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword(generatePassword());
      setError(null);
    }
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Senha copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.trim().length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setSaving(true);
    const result = await onSubmit(password.trim());
    setSaving(false);
    if (result !== undefined) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>Definir senha de {personName}</DialogTitle>
            <DialogDescription>
              A conta continua a mesma (mesmo e-mail e histórico). Copie a senha e passe para a
              pessoa: ela entra com o e-mail e esta senha, inclusive quem antes entrava com Google.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="member-password">Senha</Label>
            <div className="flex gap-2">
              <Input
                id="member-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                className="font-mono"
                aria-invalid={Boolean(error)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copy}
                aria-label="Copiar senha"
              >
                <Copy />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setPassword(generatePassword())}
                aria-label="Gerar outra senha"
              >
                <RefreshCw />
              </Button>
            </div>
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Definir senha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
