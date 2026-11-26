import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Paperclip, Plus, Trash2 } from "lucide-react";
import { usePedidosAbertos } from "@/hooks/use-data";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WrapField } from "@/components/app/wrap-field";
import { MultiPickField } from "@/components/app/multi-pick-field";
import {
  BISSEMANAS,
  CLASSIFICACOES_VENDA,
  emptyLiberacaoItem,
  LIBERACAO_MODELO_INFO,
  LISTAS_PADRAO,
  MOTIVOS_SEM_PEDIDO,
  onlyDigits,
  splitMultiplos,
  parseCm,
  type LiberacaoInput,
  type LiberacaoItem,
  type ListasLiberacao,
  type MotivoSemPedido,
} from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Item row as edited on screen: numbers stay as typed text until saving. */
type DraftItem = Omit<LiberacaoItem, "larguraCm" | "alturaCm" | "quantidade"> & {
  key: string;
  largura: string;
  altura: string;
  qtd: string;
};

type TextField =
  | "referencia"
  | "servico"
  | "insumos"
  | "acabamento"
  | "instalacao"
  | "detalhes"
  | "localInstalacao";

const numText = (n: number | null) =>
  n === null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

let keySeq = 0;
const nextKey = () => `item-${++keySeq}`;

const toDraft = (i: LiberacaoItem): DraftItem => ({
  ...i,
  key: i.id ?? nextKey(),
  largura: numText(i.larguraCm),
  altura: numText(i.alturaCm),
  qtd: numText(i.quantidade),
});

const draftIsBlank = (i: DraftItem) =>
  [
    i.referencia,
    i.servico,
    i.insumos,
    i.acabamento,
    i.instalacao,
    i.detalhes,
    i.localInstalacao,
    i.largura,
    i.altura,
    i.qtd,
  ].every((v) => v.trim() === "");

/** Spreadsheet-like cell input: borderless inside the bordered table cell. */
const cellInput =
  "block h-9 w-full min-w-0 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:bg-accent/60";

/** Header field: label on the left, value on the right (like the spreadsheet). */
function HeaderField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-stretch overflow-hidden rounded-md border border-border">
      <label
        htmlFor={htmlFor}
        className="flex items-center bg-secondary px-2.5 py-1.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      <div className="min-w-0 bg-card">{children}</div>
    </div>
  );
}

function ReadValue({ id, value }: { id: string; value: string }) {
  return (
    <p id={id} className="flex min-h-9 items-center px-3 py-1.5 text-sm font-medium">
      {value || <span className="font-normal text-muted-foreground">—</span>}
    </p>
  );
}

export function LiberacaoEditor({
  initial,
  readOnly,
  saving,
  submitLabel = "Salvar liberação",
  listas = LISTAS_PADRAO,
  pedidoNumero = null,
  motivoObrigatorio = false,
  onSubmit,
}: {
  initial: LiberacaoInput;
  readOnly: boolean;
  /** Number of the pedido in `initial.vendaId`, shown before the open-pedido list loads. */
  pedidoNumero?: number | null;
  /** New liberações: without a pedido, the reason is required (old ones may stay blank). */
  motivoObrigatorio?: boolean;
  saving?: boolean;
  /** Save button text (e.g. "Salvar e reenviar para o PCP"). */
  submitLabel?: string;
  /** Suggestion lists (editable by gestão); defaults to the built-in lists. */
  listas?: ListasLiberacao;
  onSubmit: (input: LiberacaoInput) => void;
}) {
  const uid = useId();
  const projeto = initial.modelo === "projeto";
  const info = LIBERACAO_MODELO_INFO[initial.modelo];
  const options = projeto ? listas.projeto : listas.midia;

  const [header, setHeader] = useState(() => ({
    numero: initial.numero === null ? "" : String(initial.numero),
    cliente: initial.cliente,
    responsavel: initial.responsavel,
    contato: initial.contato,
    endereco: initial.endereco,
    projetista: initial.projetista,
    vendedor: initial.vendedor,
    classificacaoVenda: initial.classificacaoVenda,
    dataLiberacao: initial.dataLiberacao ?? "",
    dataEntrega: initial.dataEntrega ?? "",
    bissemana: initial.bissemana,
    pontoEnergia: initial.pontoEnergia,
    horarioInstalacao: initial.horarioInstalacao,
    observacoes: initial.observacoes,
  }));
  const [vendaId, setVendaId] = useState(initial.vendaId ?? "");
  const [motivo, setMotivo] = useState<MotivoSemPedido | "">(initial.motivoSemPedido);
  // The pedido can be picked here (e.g. an Urgência that gets its pedido later).
  const pedidos = usePedidosAbertos(!readOnly);
  const pedidoAtual = pedidos.data?.find((p) => p.id === vendaId);
  const numeroDoPedido =
    pedidoAtual?.numero ?? (vendaId && vendaId === initial.vendaId ? pedidoNumero : null);
  const [items, setItems] = useState<DraftItem[]>(() => {
    const rows = initial.itens.map(toDraft);
    const minRows = projeto ? 4 : 9;
    while (!readOnly && rows.length < minRows) rows.push(toDraft(emptyLiberacaoItem()));
    return rows;
  });
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const set = (field: keyof typeof header) => (v: string) => {
    setHeader((h) => ({ ...h, [field]: v }));
    setDirty(true);
    setError(null);
  };
  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((rows) => rows.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    setDirty(true);
    setError(null);
  };
  const addItem = () => {
    setItems((rows) => [...rows, toDraft(emptyLiberacaoItem())]);
    setDirty(true);
  };
  const removeItem = (key: string) => {
    setItems((rows) => rows.filter((i) => i.key !== key));
    setDirty(true);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!header.cliente.trim()) {
      setError("Informe o cliente.");
      return;
    }
    if (!vendaId && !motivo && (motivoObrigatorio || initial.vendaId || initial.motivoSemPedido)) {
      setError("Escolha o pedido ou informe o motivo da liberação sem pedido.");
      return;
    }
    const numero = header.numero.trim() ? Number(header.numero) : null;
    if (numero !== null && (!Number.isInteger(numero) || numero <= 0)) {
      setError("O número da liberação precisa ser um número inteiro.");
      return;
    }
    const itens: LiberacaoItem[] = [];
    for (const [index, i] of items.entries()) {
      if (draftIsBlank(i)) continue;
      const larguraCm = parseCm(i.largura);
      const alturaCm = parseCm(i.altura);
      const quantidade = i.qtd.trim() ? Number(onlyDigits(i.qtd)) : null;
      if ([larguraCm, alturaCm, quantidade].some((n) => Number.isNaN(n))) {
        setError(`Número inválido na linha ${index + 1}. Use só números, ex.: 120 ou 80,5.`);
        return;
      }
      itens.push({
        id: i.id,
        referencia: i.referencia,
        servico: i.servico,
        insumos: i.insumos,
        acabamento: i.acabamento,
        instalacao: i.instalacao,
        detalhes: i.detalhes,
        larguraCm,
        alturaCm,
        quantidade,
        localInstalacao: i.localInstalacao,
      });
    }
    setDirty(false);
    onSubmit({
      modelo: initial.modelo,
      vendaId: vendaId || null,
      motivoSemPedido: vendaId ? "" : motivo,
      numero,
      cliente: header.cliente,
      responsavel: header.responsavel,
      contato: header.contato,
      endereco: header.endereco,
      projetista: header.projetista,
      vendedor: header.vendedor,
      classificacaoVenda: header.classificacaoVenda,
      dataLiberacao: header.dataLiberacao || null,
      dataEntrega: header.dataEntrega || null,
      bissemana: header.bissemana,
      pontoEnergia: header.pontoEnergia,
      horarioInstalacao: header.horarioInstalacao,
      observacoes: header.observacoes,
      itens,
    });
  };

  const filled = items.filter((i) => !draftIsBlank(i));
  const rows = readOnly ? filled : items;
  const id = (name: string) => `${uid}-${name}`;

  const text = (
    field: keyof typeof header,
    opts?: { type?: "date"; suggestions?: string[]; placeholder?: string; inputMode?: "tel" },
  ) =>
    readOnly ? (
      <ReadValue
        id={id(field)}
        value={
          opts?.type === "date" && header[field] ? formatDateOnly(header[field]) : header[field]
        }
      />
    ) : opts?.type === "date" ? (
      <input
        id={id(field)}
        type="date"
        value={header[field]}
        onChange={(e) => set(field)(e.target.value)}
        className={cn(cellInput, "h-full min-h-9 px-3")}
      />
    ) : (
      <WrapField
        id={id(field)}
        value={header[field]}
        onChange={set(field)}
        suggestions={opts?.suggestions}
        placeholder={opts?.placeholder}
        inputMode={opts?.inputMode}
        className="h-full min-h-9 px-3"
      />
    );

  const select = (field: "classificacaoVenda" | "bissemana", values: string[]) =>
    readOnly ? (
      <ReadValue id={id(field)} value={header[field]} />
    ) : (
      <select
        id={id(field)}
        value={header[field]}
        onChange={(e) => set(field)(e.target.value)}
        className={cn(cellInput, "h-full min-h-9 cursor-pointer px-2")}
      >
        <option value="">Selecione</option>
        {header[field] && !values.includes(header[field]) && (
          <option value={header[field]}>{header[field]}</option>
        )}
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );

  const itemColumns: {
    field: TextField;
    label: string;
    width: string;
    suggestions?: string[];
  }[] = [
    {
      field: "servico",
      label: "Serviço",
      width: info.localInstalacao ? "w-[16%]" : "w-[20%]",
      suggestions: options.servico,
    },
    { field: "insumos", label: info.insumos, width: "w-[13%]", suggestions: options.insumos },
    { field: "acabamento", label: "Acabamento", width: "w-[11%]", suggestions: options.acabamento },
    {
      field: "instalacao",
      label: "Instalação",
      width: info.localInstalacao ? "w-[13%]" : "w-[12%]",
      suggestions: options.instalacao,
    },
    {
      field: "detalhes",
      label: "Detalhes",
      width: info.localInstalacao ? "w-[10%]" : "w-[18%]",
    },
  ];
  const th = "border border-primary-foreground/20";

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="surface-card overflow-hidden">
        {/* Title bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-primary px-5 py-3 text-primary-foreground">
          <h2 className="text-sm font-bold uppercase tracking-wide sm:text-base">{info.titulo}</h2>
          <div className="flex items-center gap-2 text-sm font-bold">
            <label htmlFor={id("numero")}>Nº</label>
            {readOnly ? (
              <span id={id("numero")} className="tabular-nums">
                {header.numero}
              </span>
            ) : (
              <input
                id={id("numero")}
                inputMode="numeric"
                value={header.numero}
                placeholder="Auto"
                onChange={(e) => set("numero")(e.target.value.replace(/\D/g, ""))}
                className="h-8 w-24 rounded-md bg-primary-foreground/15 px-2 text-right tabular-nums text-primary-foreground outline-none placeholder:text-primary-foreground/60 focus:bg-primary-foreground/25"
              />
            )}
          </div>
        </div>

        {/* Header fields */}
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-12">
          <div className="grid content-start gap-3 md:col-span-2 xl:col-span-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <HeaderField label="Pedido" htmlFor={id("pedido")}>
                {readOnly ? (
                  vendaId ? (
                    <Link
                      id={id("pedido")}
                      to="/comercial/$vendaId"
                      params={{ vendaId }}
                      className="flex min-h-9 items-center px-3 py-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      {numeroDoPedido ? `Pedido nº ${numeroDoPedido}` : "Abrir o pedido"}
                    </Link>
                  ) : (
                    <ReadValue id={id("pedido")} value="Sem pedido" />
                  )
                ) : (
                  <select
                    id={id("pedido")}
                    value={vendaId}
                    disabled={pedidos.isPending}
                    onChange={(e) => {
                      const p = pedidos.data?.find((x) => x.id === e.target.value);
                      setVendaId(e.target.value);
                      if (p && !header.cliente.trim()) set("cliente")(p.clienteNome);
                      setDirty(true);
                      setError(null);
                    }}
                    className={cn(cellInput, "h-full min-h-9 cursor-pointer px-2")}
                  >
                    <option value="">Sem pedido</option>
                    {vendaId && !pedidoAtual && (
                      <option value={vendaId}>
                        {numeroDoPedido ? `Pedido nº ${numeroDoPedido}` : "Pedido atual"}
                      </option>
                    )}
                    {(pedidos.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        Nº {p.numero} · {p.clienteNome}
                        {p.primeiroItem ? ` · ${p.primeiroItem}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </HeaderField>
              {!vendaId && (
                <HeaderField label="Motivo sem pedido" htmlFor={id("motivo")}>
                  {readOnly ? (
                    <ReadValue id={id("motivo")} value={motivo} />
                  ) : (
                    <select
                      id={id("motivo")}
                      value={motivo}
                      onChange={(e) => {
                        setMotivo(e.target.value as MotivoSemPedido | "");
                        setDirty(true);
                        setError(null);
                      }}
                      className={cn(cellInput, "h-full min-h-9 cursor-pointer px-2")}
                    >
                      <option value="">Selecione</option>
                      {MOTIVOS_SEM_PEDIDO.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                </HeaderField>
              )}
            </div>
            <HeaderField label="Cliente *" htmlFor={id("cliente")}>
              {text("cliente")}
            </HeaderField>
            <div className="grid gap-3 sm:grid-cols-2">
              <HeaderField label="Responsável" htmlFor={id("responsavel")}>
                {text("responsavel")}
              </HeaderField>
              <HeaderField label="Contato" htmlFor={id("contato")}>
                {text("contato", { inputMode: "tel" })}
              </HeaderField>
            </div>
            <HeaderField label="Endereço (referência)" htmlFor={id("endereco")}>
              {text("endereco")}
            </HeaderField>
          </div>
          <div className="grid content-start gap-3 xl:col-span-3">
            <HeaderField
              label={projeto ? "Projetista" : "Layoutista / projetista"}
              htmlFor={id("projetista")}
            >
              {text("projetista", { suggestions: listas.projetistas, placeholder: "Selecione" })}
            </HeaderField>
            <HeaderField label="Vendedor" htmlFor={id("vendedor")}>
              {text("vendedor", { suggestions: listas.vendedores, placeholder: "Selecione" })}
            </HeaderField>
            <HeaderField label="Classificação venda" htmlFor={id("classificacaoVenda")}>
              {select("classificacaoVenda", CLASSIFICACOES_VENDA)}
            </HeaderField>
          </div>
          <div className="grid content-start gap-3 xl:col-span-3">
            <HeaderField label="Data liberação" htmlFor={id("dataLiberacao")}>
              {text("dataLiberacao", { type: "date" })}
            </HeaderField>
            <HeaderField label="Data entrega" htmlFor={id("dataEntrega")}>
              {text("dataEntrega", { type: "date" })}
            </HeaderField>
            {!projeto && (
              <HeaderField label="Bissemana" htmlFor={id("bissemana")}>
                {select("bissemana", BISSEMANAS)}
              </HeaderField>
            )}
          </div>
        </div>

        {/* Section band */}
        <div className="flex items-center justify-between border-y border-border bg-accent px-5 py-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-accent-foreground">
            {info.secao}
          </h3>
          <span className="text-xs font-medium text-accent-foreground/80">
            {filled.length} {filled.length === 1 ? "item" : "itens"}
          </span>
        </div>

        {/* Items */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[58rem] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-primary text-[11px] font-semibold uppercase tracking-wide text-primary-foreground">
                <th
                  rowSpan={2}
                  className="w-[9%] border border-border bg-secondary px-1 py-2 text-[10px] leading-tight text-secondary-foreground"
                >
                  {info.referencia}
                </th>
                {itemColumns.map((c) => (
                  <th key={c.field} rowSpan={2} className={cn(th, "px-2 py-2", c.width)}>
                    {c.label}
                  </th>
                ))}
                <th colSpan={2} className={cn(th, "w-[12%] px-1 pt-1.5")}>
                  Tamanho (cm)
                </th>
                <th rowSpan={2} className={cn(th, "w-[5%] px-1 py-2")}>
                  Qtda
                </th>
                {info.localInstalacao && (
                  <th rowSpan={2} className={cn(th, "w-[11%] px-2 py-2")}>
                    Local de instalação
                  </th>
                )}
                {!readOnly && (
                  <th rowSpan={2} className={cn(th, "w-[2.25rem]")} aria-label="Remover" />
                )}
              </tr>
              <tr className="bg-primary text-[9px] font-semibold uppercase text-primary-foreground/80">
                <th className={cn(th, "px-1 pb-1")}>Largura</th>
                <th className={cn(th, "px-1 pb-1")}>Altura</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={info.localInstalacao ? 12 : 11}
                    className="border border-border px-5 py-6 text-center text-muted-foreground"
                  >
                    Nenhum item.
                  </td>
                </tr>
              )}
              {rows.map((item, index) => {
                const label = (what: string) => `${what}, linha ${index + 1}`;
                const cellText = (field: TextField, suggestions?: string[]) =>
                  readOnly && (info.multiplos as string[]).includes(field) ? (
                    <span className="flex flex-wrap gap-1 px-1.5 py-1.5">
                      {splitMultiplos(item[field]).map((v, i) => (
                        <span
                          key={`${v}-${i}`}
                          className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium leading-snug text-secondary-foreground"
                        >
                          {v}
                        </span>
                      ))}
                    </span>
                  ) : !readOnly && (info.multiplos as string[]).includes(field) ? (
                    <MultiPickField
                      value={item[field]}
                      suggestions={suggestions ?? []}
                      aria-label={label(field)}
                      onChange={(v) => updateItem(item.key, { [field]: v })}
                    />
                  ) : readOnly ? (
                    <span className="block whitespace-pre-wrap break-words px-2 py-2">
                      {item[field]}
                    </span>
                  ) : (
                    <WrapField
                      value={item[field]}
                      suggestions={suggestions}
                      multiline={field === "detalhes" || field === "localInstalacao"}
                      aria-label={label(field)}
                      onChange={(v) => updateItem(item.key, { [field]: v })}
                    />
                  );
                const cellNum = (field: "largura" | "altura" | "qtd", what: string) =>
                  readOnly ? (
                    <span className="block break-all px-2 py-2 text-right tabular-nums">
                      {item[field]}
                    </span>
                  ) : (
                    <WrapField
                      value={item[field]}
                      inputMode={field === "qtd" ? "numeric" : "decimal"}
                      aria-label={label(what)}
                      onChange={(v) =>
                        updateItem(item.key, { [field]: field === "qtd" ? onlyDigits(v) : v })
                      }
                      className="break-all px-1.5 text-right tabular-nums"
                    />
                  );
                return (
                  <tr key={item.key} className="align-top">
                    <td className="border border-border bg-secondary/50">
                      {cellText("referencia")}
                    </td>
                    {itemColumns.map((c) => (
                      <td key={c.field} className="border border-border">
                        {cellText(c.field, c.suggestions)}
                      </td>
                    ))}
                    <td className="border border-border">{cellNum("largura", "Largura em cm")}</td>
                    <td className="border border-border bg-muted/40">
                      {cellNum("altura", "Altura em cm")}
                    </td>
                    <td className="border border-border bg-muted/40">
                      {cellNum("qtd", "Quantidade")}
                    </td>
                    {info.localInstalacao && (
                      <td className="border border-border bg-muted/40">
                        {cellText("localInstalacao")}
                      </td>
                    )}
                    {!readOnly && (
                      <td className="border border-border text-center align-middle">
                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          aria-label={label("Remover")}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <div className="border-b border-border px-4 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={addItem}>
              <Plus />
              Adicionar linha
            </Button>
          </div>
        )}

        {info.aviso && (
          <p className="flex items-center justify-center gap-2 bg-destructive/10 px-5 py-2 text-center text-sm font-bold uppercase tracking-wide text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {info.aviso}
          </p>
        )}

        {/* Observações */}
        <div className="border-t border-border bg-primary px-5 py-2">
          <h3 className="text-center text-sm font-bold uppercase tracking-wide text-primary-foreground">
            Observações
          </h3>
        </div>
        <div className="grid gap-3 p-4">
          {projeto && (
            <div className="grid gap-3 sm:grid-cols-2">
              <HeaderField label="Ponto de energia" htmlFor={id("pontoEnergia")}>
                {text("pontoEnergia")}
              </HeaderField>
              <HeaderField label="Horário de instalação" htmlFor={id("horarioInstalacao")}>
                {text("horarioInstalacao")}
              </HeaderField>
            </div>
          )}
          {readOnly ? (
            <p className="min-h-16 whitespace-pre-wrap rounded-md border border-border px-3 py-2 text-sm">
              {header.observacoes || (
                <span className="text-muted-foreground">Sem observações.</span>
              )}
            </p>
          ) : (
            <Textarea
              id={id("observacoes")}
              aria-label="Observações"
              value={header.observacoes}
              onChange={(e) => set("observacoes")(e.target.value)}
              placeholder={
                projeto
                  ? "Cor do ACM, pintura, iluminação, detalhes da execução…"
                  : "Detalhes da execução…"
              }
              rows={4}
            />
          )}
        </div>

        <p className="flex items-center justify-center gap-2 bg-destructive px-5 py-2 text-center text-xs font-bold uppercase tracking-wide text-destructive-foreground">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          {info.anexo}
        </p>
      </div>

      {!readOnly && (
        <div className="flex items-center justify-end gap-3 pb-4">
          {error && (
            <p
              role="alert"
              className="rounded-md bg-card px-3 py-2 text-sm font-medium text-destructive shadow-card"
            >
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving} className="h-10 shadow-card-hover">
            {saving ? "Salvando…" : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
