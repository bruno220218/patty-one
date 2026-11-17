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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useChecklists } from "@/hooks/use-data";
import {
  EMPTY_CLIENT_INFO,
  isBlankLiberacaoItem,
  type Liberacao,
  type ProjectClientInfo,
} from "@/lib/data";

const SEM_CHECKLIST = "__vazio__";

/** Short project description from the liberação items (services). */
function descricaoDoProjeto(lib: Liberacao): string {
  const servicos = lib.itens
    .filter((i) => !isBlankLiberacaoItem(i))
    .map((i) => i.servico.trim())
    .filter(Boolean);
  const unicos = [...new Set(servicos)];
  const base = `Liberação nº ${lib.numero}`;
  return unicos.length ? `${base} · ${unicos.join(", ")}` : base;
}

export interface AprovarInput {
  name: string;
  description: string;
  dueDate: string | null;
  checklistId: string | null;
  clientInfo: ProjectClientInfo;
}

/** Client info for the new project: the services of the liberação become the service type. */
function clientInfoDaLiberacao(lib: Liberacao): ProjectClientInfo {
  const servicos = [
    ...new Set(
      lib.itens
        .filter((i) => !isBlankLiberacaoItem(i))
        .map((i) => i.servico.trim())
        .filter(Boolean),
    ),
  ];
  return { ...EMPTY_CLIENT_INFO, serviceType: servicos.join(", ") };
}

/** PCP/direção approves: creates the production project (from a checklist) and links it. */
export function AprovarDialog({
  open,
  onOpenChange,
  liberacao,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liberacao: Liberacao;
  /** Resolves to undefined when it failed (dialog stays open). */
  onConfirm: (input: AprovarInput) => Promise<unknown>;
}) {
  const { data: checklists } = useChecklists();
  const [name, setName] = useState("");
  const [checklistId, setChecklistId] = useState(SEM_CHECKLIST);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(liberacao.cliente);
      setChecklistId(SEM_CHECKLIST);
      setError(null);
    }
  }, [open, liberacao.cliente]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Informe o nome do projeto.");
      return;
    }
    setSaving(true);
    const ok = await onConfirm({
      name: name.trim(),
      description: descricaoDoProjeto(liberacao),
      dueDate: liberacao.dataEntrega,
      checklistId: checklistId === SEM_CHECKLIST ? null : checklistId,
      clientInfo: clientInfoDaLiberacao(liberacao),
    });
    setSaving(false);
    if (ok !== undefined) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <form onSubmit={submit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>Aprovar liberação nº {liberacao.numero}</DialogTitle>
            <DialogDescription>
              A liberação vai para a produção: será criado um projeto em Projetos
              {liberacao.dataEntrega ? " com o prazo da data de entrega" : ""}. Depois de aprovada,
              ela não pode mais ser editada pelo comercial.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="aprovar-nome">Nome do projeto *</Label>
            <Input
              id="aprovar-nome"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="aprovar-checklist">Checklist de tarefas</Label>
            <Select value={checklistId} onValueChange={setChecklistId}>
              <SelectTrigger id="aprovar-checklist">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_CHECKLIST}>Projeto vazio (sem tarefas)</SelectItem>
                {(checklists ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {c.tasks.length} {c.tasks.length === 1 ? "tarefa" : "tarefas"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              As tarefas são executadas por Criação, Produção e Montagem.
            </p>
          </div>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Aprovando…" : "Aprovar e criar projeto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** PCP/direção rejects with a reason; it goes back to comercial for editing. */
export function ReprovarDialog({
  open,
  onOpenChange,
  numero,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numero: number;
  onConfirm: (motivo: string) => Promise<unknown>;
}) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMotivo("");
      setError(null);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) {
      setError("Escreva o motivo para o comercial saber o que corrigir.");
      return;
    }
    setSaving(true);
    const ok = await onConfirm(motivo.trim());
    setSaving(false);
    if (ok !== undefined) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <form onSubmit={submit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>Reprovar liberação nº {numero}</DialogTitle>
            <DialogDescription>
              Ela volta para o comercial em edição. Quando for corrigida e salva, entra no fim da
              fila do PCP.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reprovar-motivo">Motivo *</Label>
            <Textarea
              id="reprovar-motivo"
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setError(null);
              }}
              placeholder="Ex.: falta a cor do ACM e a medida da segunda placa."
              rows={4}
              autoFocus
              aria-invalid={Boolean(error)}
            />
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving ? "Reprovando…" : "Reprovar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
