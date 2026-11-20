import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FormField } from "@/components/app/form-field";
import { BRIEFING_DESTINO_LABEL, type BriefingDestino, type BriefingInput } from "@/lib/data";

const AREAS: {
  key: keyof Pick<
    BriefingInput,
    "descricao" | "objetivo" | "formatos" | "referencias" | "observacoes"
  >;
  label: string;
  placeholder: string;
  rows: number;
}[] = [
  {
    key: "descricao",
    label: "O que precisa ser feito",
    placeholder: "Descreva o pedido: peças, serviço, quantidades…",
    rows: 4,
  },
  {
    key: "objetivo",
    label: "Objetivo / mensagem",
    placeholder: "O que a peça precisa comunicar? Qual o objetivo do cliente?",
    rows: 3,
  },
  {
    key: "formatos",
    label: "Medidas e formatos",
    placeholder: "Ex.: 3 placas 30 x 10 cm, banner 1 x 2 m…",
    rows: 2,
  },
  {
    key: "referencias",
    label: "Referências",
    placeholder: "Links ou descrição de referências (os arquivos vão em Anexos)",
    rows: 2,
  },
  { key: "observacoes", label: "Observações", placeholder: "", rows: 2 },
];

/**
 * Lista de itens para orçamento (Projetos especiais).
 * Espaço reservado: os itens da lista serão informados depois; aqui fica só o lugar da função.
 */
function ItensOrcamento() {
  return (
    <FormField id="b-itens-orcamento" label="Itens para orçamento">
      <div
        id="b-itens-orcamento"
        className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground"
      >
        Lista de itens para orçamento em breve.
      </div>
    </FormField>
  );
}

/** Create/edit form of a briefing (comercial fills it; criação / projetos especiais read it). */
export function BriefingForm({
  initial,
  readOnly,
  saving,
  submitLabel,
  onSubmit,
}: {
  initial: BriefingInput;
  readOnly: boolean;
  saving: boolean;
  submitLabel: string;
  onSubmit: (input: BriefingInput) => void | Promise<void>;
}) {
  const [v, setV] = useState<BriefingInput>(initial);
  const [erro, setErro] = useState<string | null>(null);
  const set = <K extends keyof BriefingInput>(k: K, value: BriefingInput[K]) =>
    setV((old) => ({ ...old, [k]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.titulo.trim()) {
      setErro("Diga o que precisa ser feito no título.");
      return;
    }
    setErro(null);
    await onSubmit(v);
  };

  return (
    <form onSubmit={submit} className="surface-card space-y-5 p-5" noValidate>
      <FormField id="b-destino" label="Para quem é o briefing">
        <ToggleGroup
          id="b-destino"
          type="single"
          variant="outline"
          value={v.destino}
          onValueChange={(d) => d && set("destino", d as BriefingDestino)}
          disabled={readOnly}
          className="justify-start"
        >
          {(Object.keys(BRIEFING_DESTINO_LABEL) as BriefingDestino[]).map((d) => (
            <ToggleGroupItem key={d} value={d} className="h-9 px-4">
              {BRIEFING_DESTINO_LABEL[d]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FormField>

      <FormField id="b-titulo" label="Título *">
        <Input
          id="b-titulo"
          value={v.titulo}
          onChange={(e) => set("titulo", e.target.value)}
          placeholder="Ex.: Totem para a recepção"
          readOnly={readOnly}
          maxLength={160}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField id="b-cliente" label="Cliente" className="lg:col-span-2">
          <Input
            id="b-cliente"
            value={v.cliente}
            onChange={(e) => set("cliente", e.target.value)}
            readOnly={readOnly}
          />
        </FormField>
        <FormField id="b-contato" label="Contato / telefone">
          <Input
            id="b-contato"
            value={v.contato}
            onChange={(e) => set("contato", e.target.value)}
            readOnly={readOnly}
          />
        </FormField>
        <FormField id="b-vendedor" label="Vendedor">
          <Input
            id="b-vendedor"
            value={v.vendedor}
            onChange={(e) => set("vendedor", e.target.value)}
            readOnly={readOnly}
          />
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {AREAS.map((a) => (
          <FormField
            key={a.key}
            id={`b-${a.key}`}
            label={a.label}
            className={a.key === "descricao" ? "md:col-span-2" : undefined}
          >
            <Textarea
              id={`b-${a.key}`}
              value={v[a.key]}
              onChange={(e) => set(a.key, e.target.value)}
              placeholder={readOnly ? "" : a.placeholder}
              rows={a.rows}
              readOnly={readOnly}
            />
          </FormField>
        ))}
      </div>

      {v.destino !== "criacao" && <ItensOrcamento />}

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
