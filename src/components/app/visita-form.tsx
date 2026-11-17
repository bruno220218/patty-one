import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/app/form-field";
import type { VisitaSolicitacao } from "@/lib/data";

/** Request part of a technical visit (comercial). */
export function VisitaForm({
  initial,
  readOnly,
  saving,
  submitLabel,
  onSubmit,
}: {
  initial: VisitaSolicitacao;
  readOnly: boolean;
  saving: boolean;
  submitLabel: string;
  onSubmit: (s: VisitaSolicitacao) => void | Promise<void>;
}) {
  const [v, setV] = useState<VisitaSolicitacao>(initial);
  const [erro, setErro] = useState<string | null>(null);
  const set = <K extends keyof VisitaSolicitacao>(k: K, value: VisitaSolicitacao[K]) =>
    setV((old) => ({ ...old, [k]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.cliente.trim()) return setErro("Informe o cliente.");
    if (!v.endereco.trim()) return setErro("Informe o endereço da visita.");
    setErro(null);
    await onSubmit(v);
  };

  return (
    <form onSubmit={submit} className="surface-card space-y-4 p-5" noValidate>
      <h2 className="text-sm font-semibold">Solicitação</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField id="vs-cliente" label="Cliente *" className="lg:col-span-2">
          <Input
            id="vs-cliente"
            value={v.cliente}
            onChange={(e) => set("cliente", e.target.value)}
            readOnly={readOnly}
          />
        </FormField>
        <FormField id="vs-contato" label="Contato / telefone">
          <Input
            id="vs-contato"
            value={v.contato}
            onChange={(e) => set("contato", e.target.value)}
            readOnly={readOnly}
          />
        </FormField>
        <FormField id="vs-vendedor" label="Vendedor">
          <Input
            id="vs-vendedor"
            value={v.vendedor}
            onChange={(e) => set("vendedor", e.target.value)}
            readOnly={readOnly}
          />
        </FormField>
        <FormField id="vs-endereco" label="Endereço *" className="lg:col-span-2">
          <Input
            id="vs-endereco"
            value={v.endereco}
            onChange={(e) => set("endereco", e.target.value)}
            readOnly={readOnly}
          />
        </FormField>
        <FormField id="vs-ref" label="Referência do local">
          <Input
            id="vs-ref"
            value={v.referenciaLocal}
            onChange={(e) => set("referenciaLocal", e.target.value)}
            readOnly={readOnly}
          />
        </FormField>
        <FormField id="vs-data" label="Data sugerida">
          <Input
            id="vs-data"
            type="date"
            value={v.dataSugerida ?? ""}
            onChange={(e) => set("dataSugerida", e.target.value || null)}
            readOnly={readOnly}
          />
        </FormField>
      </div>
      <FormField id="vs-desc" label="Descrição: medidas a serem realizadas">
        <Textarea
          id="vs-desc"
          value={v.descricao}
          onChange={(e) => set("descricao", e.target.value)}
          rows={4}
          readOnly={readOnly}
          placeholder={readOnly ? "" : "O que medir, onde, observações para a equipe…"}
        />
      </FormField>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="h-10">
            <Save />
            {saving ? "Salvando…" : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
