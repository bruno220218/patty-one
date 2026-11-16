import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  emptyLiberacaoItem,
  formatTamanho,
  LIBERACAO_MODELO_LABEL,
  liberacaoProgress,
  parseCm,
  type LiberacaoInput,
  type LiberacaoItem,
} from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Item row as edited on screen: sizes stay as typed text until saving. */
type DraftItem = Omit<LiberacaoItem, "larguraCm" | "alturaCm"> & {
  key: string;
  largura: string;
  altura: string;
};

const cmText = (n: number | null) =>
  n === null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

let keySeq = 0;
const nextKey = () => `item-${++keySeq}`;

const toDraft = (i: LiberacaoItem): DraftItem => ({
  ...i,
  key: i.id ?? nextKey(),
  largura: cmText(i.larguraCm),
  altura: cmText(i.alturaCm),
});

const ITEM_COLUMNS: {
  field: "servico" | "material" | "acabamento" | "instalacao" | "detalhes";
  label: string;
  width: string;
}[] = [
  { field: "servico", label: "Serviço", width: "w-[17%]" },
  { field: "material", label: "Material", width: "w-[13%]" },
  { field: "acabamento", label: "Acabamento", width: "w-[13%]" },
  { field: "instalacao", label: "Instalação", width: "w-[11%]" },
  { field: "detalhes", label: "Detalhes", width: "w-[18%]" },
];

function Field({
  id,
  label,
  value,
  onChange,
  readOnly,
  type = "text",
  className,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  type?: "text" | "date" | "tel" | "number";
  className?: string;
  placeholder?: string;
}) {
  const shown = readOnly && type === "date" && value ? formatDateOnly(value) : value;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </Label>
      {readOnly ? (
        <p id={id} className="min-h-9 rounded-md border border-transparent py-1.5 text-sm">
          {shown || <span className="text-muted-foreground">—</span>}
        </p>
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-9"
        />
      )}
    </div>
  );
}

export function LiberacaoEditor({
  initial,
  readOnly,
  saving,
  onSubmit,
  onDirtyChange,
}: {
  initial: LiberacaoInput;
  readOnly: boolean;
  saving?: boolean;
  onSubmit: (input: LiberacaoInput) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [header, setHeader] = useState(() => ({
    numero: initial.numero === null ? "" : String(initial.numero),
    cliente: initial.cliente,
    vendedor: initial.vendedor,
    projetista: initial.projetista,
    dataLiberacao: initial.dataLiberacao ?? "",
    dataEntrega: initial.dataEntrega ?? "",
    responsavel: initial.responsavel,
    telefone: initial.telefone,
    endereco: initial.endereco,
    bissemana: initial.bissemana,
    numeroPlaca: initial.numeroPlaca,
  }));
  const [items, setItems] = useState<DraftItem[]>(() =>
    (initial.itens.length ? initial.itens : [emptyLiberacaoItem()]).map(toDraft),
  );
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const projeto = initial.modelo === "projeto";
  const set = (field: keyof typeof header) => (v: string) => {
    setHeader((h) => ({ ...h, [field]: v }));
    setDirty(true);
    setError(null);
  };
  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    setDirty(true);
    setError(null);
  };
  const addItem = () => {
    setItems((list) => [...list, toDraft(emptyLiberacaoItem())]);
    setDirty(true);
  };
  const removeItem = (key: string) => {
    setItems((list) => {
      const next = list.filter((i) => i.key !== key);
      return next.length ? next : [toDraft(emptyLiberacaoItem())];
    });
    setDirty(true);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!header.cliente.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    const numero = header.numero.trim() ? Number(header.numero) : null;
    if (numero !== null && (!Number.isInteger(numero) || numero <= 0)) {
      setError("O número da liberação precisa ser um número inteiro.");
      return;
    }
    const itens: LiberacaoItem[] = [];
    for (const [index, i] of items.entries()) {
      const larguraCm = parseCm(i.largura);
      const alturaCm = parseCm(i.altura);
      if (Number.isNaN(larguraCm) || Number.isNaN(alturaCm)) {
        setError(`Tamanho inválido no item ${index + 1}. Use números em cm, ex.: 120 ou 80,5.`);
        return;
      }
      itens.push({
        id: i.id,
        servico: i.servico,
        material: i.material,
        acabamento: i.acabamento,
        instalacao: i.instalacao,
        detalhes: i.detalhes,
        larguraCm,
        alturaCm,
        checked: i.checked,
      });
    }
    setDirty(false);
    onSubmit({
      modelo: initial.modelo,
      numero,
      cliente: header.cliente,
      vendedor: header.vendedor,
      projetista: header.projetista,
      dataLiberacao: header.dataLiberacao || null,
      dataEntrega: header.dataEntrega || null,
      responsavel: header.responsavel,
      telefone: header.telefone,
      endereco: header.endereco,
      bissemana: header.bissemana,
      numeroPlaca: header.numeroPlaca,
      itens,
    });
  };

  const { done, total } = liberacaoProgress(items);
  const visibleItems = readOnly
    ? items.filter((i) =>
        [i.servico, i.material, i.acabamento, i.instalacao, i.detalhes, i.largura, i.altura].some(
          (v) => v.trim() !== "",
        ),
      )
    : items;

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <section className="surface-card p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Cabeçalho · modelo {LIBERACAO_MODELO_LABEL[initial.modelo]}
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            id="lib-numero"
            label="Número da liberação"
            type="number"
            value={header.numero}
            onChange={set("numero")}
            readOnly={readOnly}
            placeholder="Automático"
          />
          <Field
            id="lib-cliente"
            label="Nome do cliente *"
            value={header.cliente}
            onChange={set("cliente")}
            readOnly={readOnly}
            className="sm:col-span-1 lg:col-span-3"
          />
          <Field
            id="lib-vendedor"
            label="Vendedor"
            value={header.vendedor}
            onChange={set("vendedor")}
            readOnly={readOnly}
          />
          <Field
            id="lib-projetista"
            label="Projetista"
            value={header.projetista}
            onChange={set("projetista")}
            readOnly={readOnly}
          />
          <Field
            id="lib-data-liberacao"
            label="Data da liberação"
            type="date"
            value={header.dataLiberacao}
            onChange={set("dataLiberacao")}
            readOnly={readOnly}
          />
          <Field
            id="lib-data-entrega"
            label="Data da entrega"
            type="date"
            value={header.dataEntrega}
            onChange={set("dataEntrega")}
            readOnly={readOnly}
          />
          {projeto ? (
            <>
              <Field
                id="lib-responsavel"
                label="Responsável (cliente)"
                value={header.responsavel}
                onChange={set("responsavel")}
                readOnly={readOnly}
              />
              <Field
                id="lib-telefone"
                label="Telefone (cliente)"
                type="tel"
                value={header.telefone}
                onChange={set("telefone")}
                readOnly={readOnly}
              />
              <Field
                id="lib-endereco"
                label="Endereço"
                value={header.endereco}
                onChange={set("endereco")}
                readOnly={readOnly}
                className="sm:col-span-2"
              />
            </>
          ) : (
            <>
              <Field
                id="lib-bissemana"
                label="Bissemana"
                value={header.bissemana}
                onChange={set("bissemana")}
                readOnly={readOnly}
              />
              <Field
                id="lib-placa"
                label="Número da placa"
                value={header.numeroPlaca}
                onChange={set("numeroPlaca")}
                readOnly={readOnly}
              />
            </>
          )}
        </div>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">Itens</h2>
          <span className="text-xs text-muted-foreground">
            {done}/{total} conferidos
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[50rem] table-fixed text-sm">
            <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2 text-center">#</th>
                {ITEM_COLUMNS.map((c) => (
                  <th key={c.field} className={cn("px-2 py-2", c.width)}>
                    {c.label}
                  </th>
                ))}
                <th className="w-[8.5rem] px-2 py-2">Tamanho (cm) L x A</th>
                <th className="w-14 px-1 py-2 text-center">Check</th>
                {!readOnly && <th className="w-10 px-1 py-2" aria-label="Ações" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-6 text-center text-sm text-muted-foreground">
                    Nenhum item.
                  </td>
                </tr>
              )}
              {visibleItems.map((item, index) => (
                <tr key={item.key} className={cn(item.checked && "bg-status-done/30")}>
                  <td className="px-2 py-2.5 text-center align-top text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </td>
                  {ITEM_COLUMNS.map((c) => (
                    <td key={c.field} className="px-1 py-1.5 align-top">
                      {readOnly ? (
                        <span className="block whitespace-pre-wrap break-words px-1 py-1">
                          {item[c.field] || "—"}
                        </span>
                      ) : (
                        <Input
                          value={item[c.field]}
                          aria-label={`${c.label} do item ${index + 1}`}
                          onChange={(e) => updateItem(item.key, { [c.field]: e.target.value })}
                          className="h-8 px-2"
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 align-top">
                    {readOnly ? (
                      <span className="block px-1 py-1 tabular-nums">
                        {formatTamanho(parseCm(item.largura), parseCm(item.altura)) || "—"}
                      </span>
                    ) : (
                      <div className="flex items-center gap-0.5">
                        <Input
                          value={item.largura}
                          inputMode="decimal"
                          placeholder="L"
                          aria-label={`Largura em cm do item ${index + 1}`}
                          onChange={(e) => updateItem(item.key, { largura: e.target.value })}
                          className="h-8 w-14 px-2 text-right tabular-nums"
                        />
                        <span className="text-xs text-muted-foreground">x</span>
                        <Input
                          value={item.altura}
                          inputMode="decimal"
                          placeholder="A"
                          aria-label={`Altura em cm do item ${index + 1}`}
                          onChange={(e) => updateItem(item.key, { altura: e.target.value })}
                          className="h-8 w-14 px-2 text-right tabular-nums"
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center align-middle">
                    <Checkbox
                      checked={item.checked}
                      disabled={readOnly}
                      aria-label={`Conferido: item ${index + 1}`}
                      onCheckedChange={(v) => updateItem(item.key, { checked: v === true })}
                    />
                  </td>
                  {!readOnly && (
                    <td className="px-1 py-1.5 align-top">
                      <div className="flex items-center justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remover item ${index + 1}`}
                          onClick={() => removeItem(item.key)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <div className="border-t border-border px-5 py-3">
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus />
              Adicionar item
            </Button>
          </div>
        )}
      </section>

      {!readOnly && (
        <div className="sticky bottom-20 z-20 flex items-center justify-end gap-3 md:bottom-4">
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving} className="h-10 shadow-card-hover">
            {saving ? "Salvando…" : dirty ? "Salvar liberação" : "Salvar"}
          </Button>
        </div>
      )}
    </form>
  );
}
