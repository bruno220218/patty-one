import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ClipboardList,
  FileDown,
  FileText,
  Loader2,
  Plus,
  Save,
  Send,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ClientePicker, OrdemStatusBadge, selectClass } from "@/components/app/operacao-ui";
import { VendaStatusBadge } from "@/components/app/venda-status";
import { LiberacaoStatusBadge } from "@/components/app/liberacao-status";
import { PrazoPedidoSection } from "@/components/app/prazo-pedido";
import { VinculosBriefingVisita } from "@/components/app/vinculos-briefing-visita";
import { ListaMaterialVenda } from "@/components/app/estoque-lista-material";
import { useCurrentUser, useDataAction, useEmpresas, useVenda } from "@/hooks/use-data";
import {
  brl,
  calcDoItem,
  canEditLiberacoes,
  canVender,
  CATEGORIAS_ITEM,
  comercialRepository,
  dataBR,
  itemVazio,
  NOME_TIPO_VENDA,
  parseValor,
  podeGerarPedido,
  STATUS_VENDA,
  totaisVenda,
  totalItem,
  validarVenda,
  valorParaCampo,
  type CategoriaItem,
  type Empresa,
  type ItemForm,
  type LiberacaoStatus,
  type TipoVenda,
  type Venda,
} from "@/lib/data";

/** "nova-proposta" and "novo-pedido" open an empty document. */
const NOVOS: Record<string, TipoVenda> = { "nova-proposta": "proposta", "novo-pedido": "pedido" };

export const Route = createFileRoute("/_authenticated/comercial/$vendaId")({
  head: () => ({
    meta: [{ title: "Proposta / pedido — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: VendaPage,
});

function VendaPage() {
  const { vendaId } = Route.useParams();
  const tipoNovo = NOVOS[vendaId];
  const empresas = useEmpresas();
  const venda = useVenda(tipoNovo ? "" : vendaId);
  if (empresas.isPending || (!tipoNovo && venda.isPending)) return <CardGridSkeleton />;
  if (empresas.error || (!tipoNovo && (venda.error || !venda.data))) {
    return (
      <EmptyState
        icon={FileText}
        title="Documento não encontrado"
        description={(empresas.error ?? venda.error)?.message ?? "Ele pode ter sido excluído."}
      />
    );
  }
  const doc = tipoNovo ? undefined : venda.data;
  return (
    <Editor
      key={doc ? `${doc.id}-${doc.updatedAt}` : vendaId}
      tipo={doc?.tipo ?? tipoNovo ?? "proposta"}
      empresas={empresas.data}
      doc={doc}
    />
  );
}

type Form = {
  empresaId: string;
  cliente: { id: string; nome: string } | null;
  vendedor: string;
  status: string;
  validade: string;
  condicoesPagamento: string;
  observacao: string;
  desconto: string;
  itens: ItemForm[];
};

function formDoDoc(tipo: TipoVenda, doc: Venda | undefined): Form {
  if (!doc) {
    return {
      empresaId: "",
      cliente: null,
      vendedor: "",
      status: STATUS_VENDA[tipo][0],
      validade: "",
      condicoesPagamento: "",
      observacao: "",
      desconto: "",
      itens: [itemVazio()],
    };
  }
  return {
    empresaId: doc.empresaId,
    cliente: doc.cliente ? { id: doc.cliente.id, nome: doc.cliente.nome } : null,
    vendedor: doc.vendedor,
    status: doc.status,
    validade: doc.validade ?? "",
    condicoesPagamento: doc.condicoesPagamento,
    observacao: doc.observacao,
    desconto: valorParaCampo(doc.desconto),
    itens: doc.itens.map((i) => ({
      id: i.id,
      categoria: i.categoria,
      descricao: i.descricao,
      ponto: i.ponto ?? "",
      periodoInicio: i.periodoInicio ?? "",
      periodoFim: i.periodoFim ?? "",
      quantidade: valorParaCampo(i.quantidade) || "1",
      valorUnitario: valorParaCampo(i.valorUnitario),
      desconto: valorParaCampo(i.desconto),
    })),
  };
}

function Editor({
  tipo,
  empresas,
  doc,
}: {
  tipo: TipoVenda;
  empresas: Empresa[];
  doc: Venda | undefined;
}) {
  const navigate = useNavigate();
  const run = useDataAction();
  const { data: me } = useCurrentUser();
  const podeVender = canVender(me);
  const bloqueado = !podeVender;
  const [f, setF] = useState<Form>(() => formDoDoc(tipo, doc));
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [confirmarPedido, setConfirmarPedido] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const set = (p: Partial<Form>) => setF((a) => ({ ...a, ...p }));
  const setItem = (k: number, p: Partial<ItemForm>) =>
    setF((a) => ({ ...a, itens: a.itens.map((it, i) => (i === k ? { ...it, ...p } : it)) }));
  const calc = f.itens.map(calcDoItem);
  const tot = totaisVenda(calc, parseValor(f.desconto));
  const nome = NOME_TIPO_VENDA[tipo];
  const a = tipo === "proposta" ? "a" : "o";

  async function salvar() {
    const erro = validarVenda({
      empresaId: f.empresaId,
      cadastroId: f.cliente?.id ?? null,
      itens: f.itens,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    setSalvando(true);
    const id = await run(
      () =>
        comercialRepository.save(
          tipo,
          {
            empresaId: f.empresaId,
            cadastroId: f.cliente?.id ?? "",
            vendedor: f.vendedor,
            status: f.status,
            validade: f.validade,
            condicoesPagamento: f.condicoesPagamento,
            observacao: f.observacao,
            desconto: parseValor(f.desconto),
            itens: f.itens,
          },
          doc?.id,
        ),
      `${nome} salv${a}`,
    );
    setSalvando(false);
    if (id && !doc) navigate({ to: "/comercial/$vendaId", params: { vendaId: id }, replace: true });
  }

  async function gerarPedido() {
    if (!doc) return;
    setConfirmarPedido(false);
    setGerando(true);
    const id = await run(
      () => comercialRepository.gerarPedido(doc.id),
      "Pedido criado a partir da proposta",
    );
    setGerando(false);
    if (id) navigate({ to: "/comercial/$vendaId", params: { vendaId: id } });
  }

  async function excluir() {
    if (!doc) return;
    const ok = await run(
      () => comercialRepository.remove(doc.id).then(() => true),
      `${nome} excluíd${a}`,
    );
    if (ok) navigate({ to: "/comercial", search: { tipo, busca: "", status: "", pagina: 1 } });
  }

  async function baixarPdf() {
    if (!doc) return;
    setBaixando(true);
    try {
      const { downloadVendaPdf } = await import("@/lib/venda-pdf");
      await downloadVendaPdf(doc, "/patty-logo.png");
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setBaixando(false);
    }
  }

  const alterado = doc && JSON.stringify(f) !== JSON.stringify(formDoDoc(tipo, doc));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Voltar à lista">
            <Link to="/comercial" search={{ tipo, busca: "", status: "", pagina: 1 }}>
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {doc ? `${nome} nº ${doc.numero}` : `Nov${a} ${nome.toLowerCase()}`}
              </h1>
              {doc && <VendaStatusBadge status={doc.status} />}
            </div>
            <div className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
              {doc && (
                <span>
                  Criad{a} em {dataBR(doc.createdAt)}
                </span>
              )}
              {doc?.propostaOrigem && (
                <Link
                  to="/comercial/$vendaId"
                  params={{ vendaId: doc.propostaOrigem.id }}
                  className="text-primary hover:underline"
                >
                  Gerado da proposta nº {doc.propostaOrigem.numero}
                </Link>
              )}
              {doc?.pedidoGerado && (
                <Link
                  to="/comercial/$vendaId"
                  params={{ vendaId: doc.pedidoGerado.id }}
                  className="text-primary hover:underline"
                >
                  Virou o pedido nº {doc.pedidoGerado.numero}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {doc && me?.isGestor && (
            <Button variant="outline" onClick={() => setExcluindo(true)}>
              <Trash2 />
              Excluir
            </Button>
          )}
          {doc && (
            <Button
              variant="outline"
              onClick={() => void baixarPdf()}
              disabled={baixando || Boolean(alterado)}
              title={alterado ? "Salve antes de baixar o PDF" : undefined}
            >
              {baixando ? <Loader2 className="animate-spin" /> : <FileDown />}
              Baixar PDF
            </Button>
          )}
          {doc &&
            podeVender &&
            podeGerarPedido({
              tipo,
              status: doc.status,
              pedidoGeradoId: doc.pedidoGerado?.id ?? null,
            }) && (
              <Button
                variant="outline"
                onClick={() => setConfirmarPedido(true)}
                disabled={gerando || Boolean(alterado)}
                title={alterado ? "Salve antes de gerar o pedido" : undefined}
              >
                {gerando ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
                Gerar pedido
              </Button>
            )}
          {podeVender && (
            <Button onClick={() => void salvar()} disabled={salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          )}
        </div>
      </div>

      {!podeVender && (
        <p className="text-sm text-muted-foreground">
          Só Comercial e Gestão editam propostas e pedidos.
        </p>
      )}

      <section className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="empresa">Empresa do grupo</Label>
          <select
            id="empresa"
            className={selectClass}
            value={f.empresaId}
            disabled={bloqueado}
            onChange={(e) => set({ empresaId: e.target.value })}
          >
            <option value="">Escolha…</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label>Cliente</Label>
          <ClientePicker
            value={f.cliente}
            disabled={bloqueado}
            onChange={(c) => set({ cliente: c })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendedor">Vendedor</Label>
          <Input
            id="vendedor"
            value={f.vendedor}
            disabled={bloqueado}
            onChange={(e) => set({ vendedor: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Situação</Label>
          <select
            id="status"
            className={selectClass}
            value={f.status}
            disabled={bloqueado}
            onChange={(e) => set({ status: e.target.value })}
          >
            {STATUS_VENDA[tipo].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {tipo === "proposta" && (
          <div className="space-y-1.5">
            <Label htmlFor="validade">Validade</Label>
            <Input
              id="validade"
              type="date"
              value={f.validade}
              disabled={bloqueado}
              onChange={(e) => set({ validade: e.target.value })}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="cond">Condições de pagamento</Label>
          <Input
            id="cond"
            placeholder="Ex.: 30/60/90 dias"
            value={f.condicoesPagamento}
            disabled={bloqueado}
            onChange={(e) => set({ condicoesPagamento: e.target.value })}
          />
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Itens</h2>
          {!bloqueado && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => set({ itens: [...f.itens, itemVazio()] })}
            >
              <Plus />
              Adicionar item
            </Button>
          )}
        </div>
        {f.itens.map((it, i) => (
          <div key={i} className="grid gap-3 rounded-xl border bg-muted/30 p-3 md:grid-cols-12">
            <select
              aria-label={`Tipo do item ${i + 1}`}
              className={`${selectClass} md:col-span-2`}
              value={it.categoria}
              disabled={bloqueado}
              onChange={(e) => setItem(i, { categoria: e.target.value as CategoriaItem })}
            >
              {CATEGORIAS_ITEM.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <Input
              aria-label={`Descrição do item ${i + 1}`}
              placeholder="Descrição"
              className="md:col-span-4"
              value={it.descricao}
              disabled={bloqueado}
              onChange={(e) => setItem(i, { descricao: e.target.value })}
            />
            <Input
              aria-label={`Quantidade do item ${i + 1}`}
              placeholder="Qtd."
              inputMode="decimal"
              className="md:col-span-1"
              value={it.quantidade}
              disabled={bloqueado}
              onChange={(e) => setItem(i, { quantidade: e.target.value })}
            />
            <Input
              aria-label={`Valor unitário do item ${i + 1}`}
              placeholder="Valor unit."
              inputMode="decimal"
              className="md:col-span-2"
              value={it.valorUnitario}
              disabled={bloqueado}
              onChange={(e) => setItem(i, { valorUnitario: e.target.value })}
            />
            <Input
              aria-label={`Desconto do item ${i + 1}`}
              placeholder="Desconto R$"
              inputMode="decimal"
              className="md:col-span-1"
              value={it.desconto}
              disabled={bloqueado}
              onChange={(e) => setItem(i, { desconto: e.target.value })}
            />
            <div className="flex items-center justify-end gap-2 md:col-span-2">
              <span className="text-sm font-medium">
                {brl(totalItem(calc[i] ?? calcDoItem(it)))}
              </span>
              {!bloqueado && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover item ${i + 1}`}
                  disabled={f.itens.length === 1}
                  onClick={() => set({ itens: f.itens.filter((_, k) => k !== i) })}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            {it.categoria === "Mídia OOH" && (
              <>
                <Input
                  aria-label={`Ponto do item ${i + 1}`}
                  placeholder="Ponto (ex.: Outdoor 9x3 — Av. Brasil, 1200)"
                  className="md:col-span-6"
                  value={it.ponto}
                  disabled={bloqueado}
                  onChange={(e) => setItem(i, { ponto: e.target.value })}
                />
                <label className="flex items-center gap-2 text-sm md:col-span-3">
                  De
                  <Input
                    type="date"
                    aria-label={`Início do período do item ${i + 1}`}
                    value={it.periodoInicio}
                    disabled={bloqueado}
                    onChange={(e) => setItem(i, { periodoInicio: e.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm md:col-span-3">
                  até
                  <Input
                    type="date"
                    aria-label={`Fim do período do item ${i + 1}`}
                    value={it.periodoFim}
                    disabled={bloqueado}
                    onChange={(e) => setItem(i, { periodoFim: e.target.value })}
                  />
                </label>
              </>
            )}
          </div>
        ))}
        <div className="ml-auto max-w-xs space-y-1.5 pt-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{brl(tot.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="desc" className="font-normal text-muted-foreground">
              Desconto no total (R$)
            </Label>
            <Input
              id="desc"
              inputMode="decimal"
              className="h-8 w-28 text-right"
              value={f.desconto}
              disabled={bloqueado}
              onChange={(e) => set({ desconto: e.target.value })}
            />
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{brl(tot.total)}</span>
          </div>
        </div>
      </section>

      <section className="space-y-1.5 rounded-2xl border bg-card p-5 shadow-sm">
        <Label htmlFor="obs">Observações</Label>
        <Textarea
          id="obs"
          rows={3}
          value={f.observacao}
          disabled={bloqueado}
          onChange={(e) => set({ observacao: e.target.value })}
        />
      </section>

      {doc && tipo === "pedido" && (
        <PrazoPedidoSection vendaId={doc.id} cancelado={doc.status === "Cancelado"} />
      )}

      {doc && <ListaMaterialVenda vendaId={doc.id} itens={doc.itens} pedido={tipo === "pedido"} />}

      {doc && <VinculosBriefingVisita vendaId={doc.id} />}

      {doc && tipo === "pedido" && (
        <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Send className="size-4" />
              Liberação para a produção
            </h2>
            {!doc.liberacao &&
              doc.status !== "Cancelado" &&
              canEditLiberacoes(me) &&
              (alterado ? (
                <Button size="sm" disabled>
                  <Send />
                  Liberar para produção
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link to="/liberacoes/nova" search={{ pedido: doc.id }}>
                    <Send />
                    Liberar para produção
                  </Link>
                </Button>
              ))}
          </div>
          {doc.liberacao ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
              <Link
                to="/liberacoes/$liberacaoId"
                params={{ liberacaoId: doc.liberacao.id }}
                className="font-medium text-primary hover:underline"
              >
                Liberação nº {doc.liberacao.numero}
              </Link>
              <LiberacaoStatusBadge status={doc.liberacao.status as LiberacaoStatus} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {doc.status === "Cancelado"
                ? "Pedido cancelado não vai para a produção."
                : alterado
                  ? "Salve o pedido antes de liberar para a produção."
                  : "Ainda não liberado. A liberação já vem com o cliente e os itens deste pedido, entra na fila do PCP e cria uma ordem de produção por item."}
            </p>
          )}
        </section>
      )}

      {doc && tipo === "pedido" && (
        <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <ClipboardList className="size-4" />
              Ordens de produção deste pedido
            </h2>
            <Button asChild variant="outline" size="sm">
              <Link
                to="/producao/$ordemId"
                params={{ ordemId: "nova" }}
                search={{ pedido: doc.id }}
              >
                <Plus />
                Nova ordem
              </Link>
            </Button>
          </div>
          {doc.ordens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ordem ligada a este pedido.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {doc.ordens.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <Link
                    to="/producao/$ordemId"
                    params={{ ordemId: o.id }}
                    className="min-w-0 truncate font-medium text-primary hover:underline"
                  >
                    Ordem nº {o.numero}
                    {o.descricao ? ` · ${o.descricao}` : ""}
                  </Link>
                  <OrdemStatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmarPedido}
        onOpenChange={setConfirmarPedido}
        title="Gerar pedido de venda?"
        description="A proposta fica como Aprovada e um pedido novo é criado com os mesmos itens."
        confirmLabel="Gerar pedido"
        onConfirm={() => void gerarPedido()}
      />
      <ConfirmDialog
        open={excluindo}
        onOpenChange={setExcluindo}
        title={`Excluir ${nome.toLowerCase()}?`}
        description="Os itens vão junto. Ordens de produção ligadas a ele ficam sem pedido."
        onConfirm={() => void excluir()}
      />
    </div>
  );
}
