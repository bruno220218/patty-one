import { useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  localToday,
  VINHETA_TIPOS,
  type CiInput,
  type CiMovel,
  type CiTipo,
  type Painel,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { FormField } from "./form-field";

const TIPOS_CI = VINHETA_TIPOS.filter((t) => t.value !== "indisponivel");
const SIM_NAO = ["", "Sim", "Não"];
const NENHUM = "__nenhum__";

function SimNao({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FormField id={id} label={label}>
      <Select value={value || NENHUM} onValueChange={(v) => onChange(v === NENHUM ? "" : v)}>
        <SelectTrigger id={id} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SIM_NAO.map((o) => (
            <SelectItem key={o || NENHUM} value={o || NENHUM}>
              {o || "—"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

/** The CI form, in the same order as the paper/PDF CI. */
export function CiForm({
  initial,
  paineis,
  representantes,
  responsaveis,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: CiInput;
  paineis: Painel[];
  representantes: string[];
  responsaveis: string[];
  submitLabel: string;
  onSubmit: (input: CiInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CiInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const temMovel = Object.values(initial.movel).some(Boolean);
  const [movelAberto, setMovelAberto] = useState(temMovel);

  const set = <K extends keyof CiInput>(key: K, value: CiInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (error) setError(null);
  };
  const setMovel = <K extends keyof CiMovel>(key: K, value: CiMovel[K]) =>
    setForm((f) => ({ ...f, movel: { ...f.movel, [key]: value } }));

  const togglePainel = (id: string, on: boolean) =>
    set("painelIds", on ? [...form.painelIds, id] : form.painelIds.filter((p) => p !== id));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.cliente.trim()) return setError("Informe o cliente.");
    if (form.painelIds.length === 0) return setError("Marque pelo menos um painel.");
    if (form.inicio && form.fim && form.fim < form.inicio)
      return setError("O fim não pode ser antes do início.");
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <section className="surface-card grid gap-4 p-5 sm:grid-cols-6">
        <FormField id="ci-rep" label="Representante" className="sm:col-span-3">
          <Input
            id="ci-rep"
            list="ci-rep-opcoes"
            value={form.representanteNome}
            onChange={(e) => set("representanteNome", e.target.value)}
            className="h-9"
          />
          <datalist id="ci-rep-opcoes">
            {representantes.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </FormField>
        <FormField id="ci-data" label="Data" className="sm:col-span-3">
          <Input
            id="ci-data"
            type="date"
            value={form.data}
            onChange={(e) => set("data", e.target.value || localToday())}
            className="h-9"
          />
        </FormField>
        <FormField id="ci-cliente" label="Cliente *" className="sm:col-span-3">
          <Input
            id="ci-cliente"
            autoFocus
            value={form.cliente}
            onChange={(e) => set("cliente", e.target.value)}
            className="h-9"
          />
        </FormField>
        <FormField
          id="ci-titulo"
          label="Título"
          hint="Nome da vinheta, se for diferente do cliente."
          className="sm:col-span-3"
        >
          <Input
            id="ci-titulo"
            value={form.titulo}
            onChange={(e) => set("titulo", e.target.value)}
            className="h-9"
          />
        </FormField>
      </section>

      <section className="surface-card p-5" aria-labelledby="ci-paineis-titulo">
        <h2 id="ci-paineis-titulo" className="mb-3 text-sm font-semibold">
          Painel RGB · onde a vinheta vai rodar *
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {paineis.map((p) => {
            const on = form.painelIds.includes(p.id);
            return (
              <label
                key={p.id}
                htmlFor={`ci-p-${p.id}`}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border p-2.5 text-sm transition-colors",
                  on ? "border-primary bg-accent" : "hover:bg-muted/50",
                )}
              >
                <span className="flex items-center gap-2">
                  <Checkbox
                    id={`ci-p-${p.id}`}
                    checked={on}
                    onCheckedChange={(c) => togglePainel(p.id, c === true)}
                  />
                  <span className="font-semibold">{p.codigo}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.nome.replace(/^Painel\s+/i, "")}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="surface-card grid gap-4 p-5 sm:grid-cols-6">
        <FormField id="ci-inicio" label="Início" className="sm:col-span-2">
          <Input
            id="ci-inicio"
            type="date"
            value={form.inicio ?? ""}
            onChange={(e) => set("inicio", e.target.value || null)}
            className="h-9"
          />
        </FormField>
        <FormField id="ci-fim" label="Fim" className="sm:col-span-2">
          <Input
            id="ci-fim"
            type="date"
            value={form.fim ?? ""}
            onChange={(e) => set("fim", e.target.value || null)}
            className="h-9"
          />
        </FormField>
        <FormField id="ci-tipo" label="Tipo" className="sm:col-span-2">
          <Select value={form.tipo} onValueChange={(v) => set("tipo", v as CiTipo)}>
            <SelectTrigger id="ci-tipo" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_CI.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          id="ci-insercao"
          label="Responsável pela inserção"
          hint="Se ficar vazio, entra o nome de quem der entrada."
          className="sm:col-span-3"
        >
          <Input
            id="ci-insercao"
            list="ci-insercao-opcoes"
            value={form.responsavelInsercaoNome}
            onChange={(e) => set("responsavelInsercaoNome", e.target.value)}
            className="h-9"
          />
          <datalist id="ci-insercao-opcoes">
            {responsaveis.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </FormField>
        <FormField id="ci-recebimento" label="Recebimento do cliente" className="sm:col-span-3">
          <Input
            id="ci-recebimento"
            list="ci-recebimento-opcoes"
            value={form.recebimento}
            onChange={(e) => set("recebimento", e.target.value)}
            className="h-9"
          />
          <datalist id="ci-recebimento-opcoes">
            <option value="Normal" />
          </datalist>
        </FormField>
        <FormField id="ci-obs" label="Observação" className="sm:col-span-6">
          <Textarea
            id="ci-obs"
            rows={2}
            value={form.observacao}
            onChange={(e) => set("observacao", e.target.value)}
          />
        </FormField>
      </section>

      <section className="surface-card">
        <button
          type="button"
          onClick={() => setMovelAberto((o) => !o)}
          aria-expanded={movelAberto}
          className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold"
        >
          Painel RGB · Patty Móvel (opcional)
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", movelAberto && "rotate-180")}
          />
        </button>
        {movelAberto && (
          <div className="grid gap-4 border-t px-5 pt-4 pb-5 sm:grid-cols-4">
            <FormField id="ci-m-modalidade" label="Modalidade" className="sm:col-span-2">
              <Select
                value={form.movel.modalidade || NENHUM}
                onValueChange={(v) =>
                  setMovel("modalidade", (v === NENHUM ? "" : v) as CiMovel["modalidade"])
                }
              >
                <SelectTrigger id="ci-m-modalidade" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>—</SelectItem>
                  <SelectItem value="convencional">Convencional</SelectItem>
                  <SelectItem value="exclusivo">Exclusivo</SelectItem>
                  <SelectItem value="evento">Evento</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField id="ci-m-resp" label="Responsável" className="sm:col-span-2">
              <Input
                id="ci-m-resp"
                value={form.movel.responsavel}
                onChange={(e) => setMovel("responsavel", e.target.value)}
                className="h-9"
              />
            </FormField>
            <FormField id="ci-m-end" label="Endereço" className="sm:col-span-4">
              <Input
                id="ci-m-end"
                value={form.movel.endereco}
                onChange={(e) => setMovel("endereco", e.target.value)}
                className="h-9"
              />
            </FormField>
            <SimNao
              id="ci-m-som"
              label="Som / microfone"
              value={form.movel.somMicrofone}
              onChange={(v) => setMovel("somMicrofone", v)}
            />
            <SimNao
              id="ci-m-palco"
              label="Palco / escada"
              value={form.movel.palcoEscada}
              onChange={(v) => setMovel("palcoEscada", v)}
            />
            <SimNao
              id="ci-m-caixas"
              label="Suporte das caixas"
              value={form.movel.suporteCaixas}
              onChange={(v) => setMovel("suporteCaixas", v)}
            />
            <SimNao
              id="ci-m-cabo"
              label="Cabo de energia"
              value={form.movel.caboEnergia}
              onChange={(v) => setMovel("caboEnergia", v)}
            />
          </div>
        )}
      </section>

      {error && <p className="text-sm font-medium text-destructive">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
