import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  espacosLivres,
  VINHETA_TIPOS,
  type Painel,
  type Vinheta,
  type VinhetaInput,
  type VinhetaTipo,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { FormField } from "./form-field";

type Extra = { painelId: string; posicao: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  painel: Painel;
  paineis: Painel[];
  /** Vinhetas currently on the panels (to know which slots are free). */
  vinhetas: Vinheta[];
  /** Names to suggest for "Representante". */
  representantes: string[];
} & (
  | {
      mode: "create";
      posicao: number;
      onSubmit: (input: VinhetaInput, extras: Extra[]) => Promise<unknown>;
    }
  | { mode: "edit"; vinheta: Vinheta; onSubmit: (input: VinhetaInput) => Promise<unknown> }
);

function vazio(painel: Painel, posicao: number): VinhetaInput {
  return {
    posicao,
    cliente: "",
    ci: "",
    tipo: "venda",
    inicio: null,
    fim: null,
    representanteNome: "",
    duracaoSeg: painel.duracaoPadrao,
    loop: painel.loopPadrao,
    insercoesDia: painel.insercoesPadrao,
    observacao: "",
  };
}

export function VinhetaDialog(props: Props) {
  const { open, onOpenChange, painel, paineis, vinhetas, representantes } = props;
  const [form, setForm] = useState<VinhetaInput>(() => vazio(painel, 1));
  const [extras, setExtras] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setExtras([]);
    if (props.mode === "edit") {
      const {
        id: _id,
        painelId: _p,
        representanteId: _r,
        createdByNome: _c,
        createdAt: _ca,
        updatedByNome: _u,
        updatedAt: _ua,
        ...input
      } = props.vinheta;
      setForm(input);
    } else {
      setForm(vazio(painel, props.posicao));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof VinhetaInput>(key: K, value: VinhetaInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const livresAqui = useMemo(() => {
    const ocupados = vinhetas
      .filter(
        (v) => v.painelId === painel.id && (props.mode === "create" || v.id !== props.vinheta.id),
      )
      .map((v) => v.posicao);
    return espacosLivres(painel.espacos, ocupados);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vinhetas, painel, props.mode, props.mode === "edit" ? props.vinheta.id : null]);

  // Other panels with a free slot: the same vinheta can go there too (first free slot).
  const outros = useMemo(
    () =>
      paineis
        .filter((p) => p.id !== painel.id)
        .map((p) => ({
          painel: p,
          livre: espacosLivres(
            p.espacos,
            vinhetas.filter((v) => v.painelId === p.id).map((v) => v.posicao),
          )[0],
        })),
    [paineis, painel.id, vinhetas],
  );

  const bloqueado = form.tipo === "indisponivel";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bloqueado && !form.cliente.trim()) {
      setError("Informe o cliente (nome da vinheta).");
      return;
    }
    if (form.inicio && form.fim && form.fim < form.inicio) {
      setError("O fim não pode ser antes do início.");
      return;
    }
    setSaving(true);
    const result =
      props.mode === "create"
        ? await props.onSubmit(
            form,
            outros
              .filter((o) => extras.includes(o.painel.id) && o.livre)
              .map((o) => ({ painelId: o.painel.id, posicao: o.livre as number })),
          )
        : await props.onSubmit(form);
    setSaving(false);
    if (result !== undefined) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-xl sm:max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <DialogHeader>
            <DialogTitle>
              {props.mode === "create" ? "Nova vinheta" : "Editar vinheta"} · {painel.codigo}
            </DialogTitle>
            <DialogDescription>
              {props.mode === "create"
                ? `${painel.nome || painel.codigo}: escolha o espaço e preencha o contrato.`
                : `Última alteração: ${props.vinheta.updatedByNome || "—"} em ${formatDateTime(props.vinheta.updatedAt)}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-6">
            <FormField id="v-posicao" label="Espaço" className="sm:col-span-2">
              <Select value={String(form.posicao)} onValueChange={(v) => set("posicao", Number(v))}>
                <SelectTrigger id="v-posicao" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([...livresAqui, form.posicao])]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}º
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField id="v-tipo" label="Tipo" className="sm:col-span-4">
              <Select value={form.tipo} onValueChange={(v) => set("tipo", v as VinhetaTipo)}>
                <SelectTrigger id="v-tipo" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VINHETA_TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <div className="space-y-1.5 sm:col-span-4">
              <Label htmlFor="v-cliente">Cliente / vinheta{bloqueado ? "" : " *"}</Label>
              <Input
                id="v-cliente"
                autoFocus
                value={form.cliente}
                placeholder={bloqueado ? "Indisponível" : "Ex.: Supranet"}
                onChange={(e) => {
                  set("cliente", e.target.value);
                  if (error) setError(null);
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "v-error" : undefined}
                className="h-10"
              />
            </div>
            <FormField id="v-ci" label="Nº da CI" className="sm:col-span-2">
              <Input
                id="v-ci"
                value={form.ci}
                placeholder="10/Nov"
                onChange={(e) => set("ci", e.target.value)}
                className="h-10"
              />
            </FormField>

            <FormField id="v-inicio" label="Início" className="sm:col-span-3">
              <Input
                id="v-inicio"
                type="date"
                value={form.inicio ?? ""}
                onChange={(e) => set("inicio", e.target.value || null)}
                className="h-10"
              />
            </FormField>
            <FormField
              id="v-fim"
              label="Fim"
              hint="Sem fim = contrato sem data para acabar."
              className="sm:col-span-3"
            >
              <Input
                id="v-fim"
                type="date"
                value={form.fim ?? ""}
                onChange={(e) => set("fim", e.target.value || null)}
                className="h-10"
              />
            </FormField>

            <FormField
              id="v-rep"
              label="Representante"
              hint="Recebe o aviso de vencimento no app, se estiver na equipe."
              className="sm:col-span-6"
            >
              <Input
                id="v-rep"
                list="v-rep-opcoes"
                value={form.representanteNome}
                onChange={(e) => set("representanteNome", e.target.value)}
                className="h-10"
              />
              <datalist id="v-rep-opcoes">
                {representantes.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </FormField>

            <FormField id="v-duracao" label="Duração (s)" className="sm:col-span-2">
              <Input
                id="v-duracao"
                type="number"
                min={1}
                inputMode="numeric"
                value={form.duracaoSeg}
                onChange={(e) => set("duracaoSeg", Number(e.target.value))}
                className="h-10"
              />
            </FormField>
            <FormField id="v-loop" label="Loop" className="sm:col-span-2">
              <Input
                id="v-loop"
                value={form.loop}
                onChange={(e) => set("loop", e.target.value)}
                className="h-10"
              />
            </FormField>
            <FormField id="v-insercoes" label="Inserções/dia" className="sm:col-span-2">
              <Input
                id="v-insercoes"
                type="number"
                min={0}
                inputMode="numeric"
                value={form.insercoesDia}
                onChange={(e) => set("insercoesDia", Number(e.target.value))}
                className="h-10"
              />
            </FormField>

            <FormField id="v-obs" label="Observação" className="sm:col-span-6">
              <Textarea
                id="v-obs"
                rows={2}
                value={form.observacao}
                onChange={(e) => set("observacao", e.target.value)}
              />
            </FormField>
          </div>

          {props.mode === "create" && outros.length > 0 && (
            <fieldset className="space-y-2 rounded-lg border p-4">
              <legend className="px-1 text-sm font-semibold">Colocar também em</legend>
              <p className="text-xs text-muted-foreground">
                A mesma vinheta entra no primeiro espaço vago de cada painel marcado.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {outros.map(({ painel: p, livre }) => (
                  <label
                    key={p.id}
                    htmlFor={`v-extra-${p.id}`}
                    className="flex items-center gap-2 text-sm aria-disabled:opacity-50"
                    aria-disabled={!livre}
                  >
                    <Checkbox
                      id={`v-extra-${p.id}`}
                      disabled={!livre}
                      checked={extras.includes(p.id)}
                      onCheckedChange={(c) =>
                        setExtras((xs) => (c ? [...xs, p.id] : xs.filter((x) => x !== p.id)))
                      }
                    />
                    <span>
                      <span className="font-medium">{p.codigo}</span>{" "}
                      <span className="text-muted-foreground">
                        {livre ? `· espaço ${livre}` : "· sem vaga"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {error && (
            <p id="v-error" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {props.mode === "create" ? "Colocar no painel" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
