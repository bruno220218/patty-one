import { Fragment, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ChevronDown,
  ChevronRight,
  Download,
  FileCode2,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ClientePicker, TOM, selectClass } from "@/components/app/operacao-ui";
import { ProdutoPicker } from "@/components/app/estoque-produto-picker";
import { NotaXmlDialog } from "@/components/app/estoque-nota-xml";
import {
  useCurrentUser,
  useDataAction,
  useMovimentosEstoque,
  useProdutosEstoque,
  useSimilaresEstoque,
} from "@/hooks/use-data";
import {
  canExcluirMovimento,
  canMovimentarEstoque,
  canVerCustoEstoque,
  COLUNAS_PLANILHA_ESTOQUE,
  estoqueRepository,
  filtrarProdutos,
  formatarCnpj,
  formatCusto,
  formatQtd,
  lerNumero,
  linhasDaPlanilha,
  localToday,
  MOTIVOS_PERDA,
  parseCsv,
  SETORES_ESTOQUE,
  toCsv,
  UNIDADES_ESTOQUE,
  type ImportacaoEstoque,
  type LinhaPlanilhaEstoque,
  type MotivoPerda,
  type MovimentoEstoque,
  type ProdutoEstoque,
  type TipoMovimento,
  type UnidadeEstoque,
} from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Estoque (etapa 1, migration 0046): products with sector-prefixed codes and their balance; a
 * row opens its entries (fornecedor, último valor pago, data, lote) and latest movements.
 * Estoque/Gestão/Direção register entries, baixas, devoluções, perdas and import a spreadsheet;
 * everyone approved reads (costs only for Estoque, Gestão, Direção and Financeiro).
 */
export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [{ title: "Estoque — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: EstoquePage,
});

type Dialogo =
  | { tipo: "produto"; produto: ProdutoEstoque | null }
  | { tipo: "movimento"; movimento: TipoMovimento; produto: ProdutoEstoque | null }
  | { tipo: "importar" }
  | { tipo: "xml" }
  | null;

function baixarArquivo(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function EstoquePage() {
  const user = useCurrentUser().data;
  const produtos = useProdutosEstoque();
  const podeMovimentar = canMovimentarEstoque(user);
  const verCusto = canVerCustoEstoque(user);
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  const lista = produtos.data ?? [];

  function exportarEstoque() {
    const linhas: LinhaPlanilhaEstoque[] = lista.map((p) => ({
      codigo: p.codigo,
      produto: p.nome,
      setor: p.setor,
      unidade: p.unidade,
      quantidade: String(p.quantidade),
      custo: p.custo === null ? "" : String(p.custo),
      fornecedor: p.fornecedor ?? "",
      lote: p.ultimoLote ?? "",
      minimo: p.estoqueMinimo === null ? "" : String(p.estoqueMinimo),
    }));
    baixarArquivo(`estoque-${localToday()}.csv`, toCsv(linhas, [...COLUNAS_PLANILHA_ESTOQUE]));
  }

  const novo = (movimento: TipoMovimento) =>
    setDialogo({ tipo: "movimento", movimento, produto: null });

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Todo material da Patty, com o código do setor. Clique num produto para ver fornecedor, último valor pago, data e lote de cada compra."
        action={
          produtos.data && (
            <div className="flex flex-wrap gap-2">
              {podeMovimentar && (
                <>
                  <Button onClick={() => novo("Baixa")}>
                    <ArrowUpFromLine />
                    Baixa de material
                  </Button>
                  <Button variant="outline" onClick={() => novo("Entrada")}>
                    <ArrowDownToLine />
                    Entrada
                  </Button>
                  <Button variant="outline" onClick={() => novo("Devolução")}>
                    <Undo2 />
                    Devolução
                  </Button>
                  <Button variant="outline" onClick={() => novo("Perda")}>
                    <PackageMinus />
                    Perda
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDialogo({ tipo: "produto", produto: null })}
                  >
                    <Plus />
                    Novo produto
                  </Button>
                  <Button variant="outline" onClick={() => setDialogo({ tipo: "xml" })}>
                    <FileCode2 />
                    Importar XML
                  </Button>
                  <Button variant="outline" onClick={() => setDialogo({ tipo: "importar" })}>
                    <Upload />
                    Importar
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={exportarEstoque} disabled={lista.length === 0}>
                <Download />
                Exportar
              </Button>
            </div>
          )
        }
      />

      {produtos.isPending ? (
        <CardGridSkeleton />
      ) : produtos.isError ? (
        <p className="text-sm text-destructive">{produtos.error.message}</p>
      ) : produtos.data === null ? (
        <EmptyState
          icon={Boxes}
          title="O estoque ainda não está ligado"
          description="Rode a migration 0046 no Supabase e acrescente o schema “estoque” em Project Settings › Data API › Exposed schemas."
        />
      ) : (
        <Tabs defaultValue="produtos">
          <TabsList>
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="movimentos">Movimentos</TabsTrigger>
          </TabsList>
          <TabsContent value="produtos" className="mt-4">
            <ListaProdutos
              produtos={lista}
              verCusto={verCusto}
              podeMovimentar={podeMovimentar}
              onEditar={(p) => setDialogo({ tipo: "produto", produto: p })}
              onMovimento={(movimento, p) =>
                setDialogo({ tipo: "movimento", movimento, produto: p })
              }
            />
          </TabsContent>
          <TabsContent value="movimentos" className="mt-4">
            <ListaMovimentos verCusto={verCusto} podeExcluir={canExcluirMovimento(user)} />
          </TabsContent>
        </Tabs>
      )}

      {dialogo?.tipo === "produto" && (
        <ProdutoDialog produto={dialogo.produto} onClose={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === "movimento" && (
        <MovimentoDialog
          tipo={dialogo.movimento}
          produtoInicial={dialogo.produto}
          produtos={lista}
          responsavelPadrao={user?.name ?? ""}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === "importar" && <ImportarDialog onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === "xml" && (
        <NotaXmlDialog produtos={lista} verCusto={verCusto} onClose={() => setDialogo(null)} />
      )}
    </>
  );
}

// ---------- Products ----------
const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={cn("p-3 font-medium whitespace-nowrap", right && "text-right")}>{children}</th>
);

function ListaProdutos({
  produtos,
  verCusto,
  podeMovimentar,
  onEditar,
  onMovimento,
}: {
  produtos: ProdutoEstoque[];
  verCusto: boolean;
  podeMovimentar: boolean;
  onEditar: (p: ProdutoEstoque) => void;
  onMovimento: (tipo: TipoMovimento, p: ProdutoEstoque) => void;
}) {
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const vis = useMemo(() => filtrarProdutos(produtos, busca, setor), [produtos, busca, setor]);
  const colunas = verCusto ? 6 : 5;

  if (produtos.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="Nenhum produto ainda"
        description="Cadastre os produtos ou importe a planilha do estoque atual."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
          <Input
            aria-label="Buscar produto"
            className="pl-9"
            placeholder="Buscar por produto, código ou fornecedor…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select
          aria-label="Setor"
          className={cn(selectClass, "sm:w-56")}
          value={setor}
          onChange={(e) => setSetor(e.target.value)}
        >
          <option value="">Todos os setores</option>
          {SETORES_ESTOQUE.map((s) => (
            <option key={s.prefixo} value={s.prefixo}>
              {s.prefixo} · {s.nome}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-muted-foreground">{vis.length} produtos</p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <Th>Produto</Th>
              <Th>Código</Th>
              <Th right>Quantidade</Th>
              {verCusto && <Th right>Custo</Th>}
              <Th>Fornecedor</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {vis.map((p) => {
              const open = aberto === p.id;
              return (
                <Fragment key={p.id}>
                  <tr
                    className={cn(
                      "cursor-pointer border-t hover:bg-accent/40",
                      !p.ativo && "opacity-60",
                    )}
                    onClick={() => setAberto(open ? null : p.id)}
                  >
                    <td className="p-3 font-medium">
                      <span className="flex items-center gap-2">
                        {open ? (
                          <ChevronDown className="size-4 shrink-0" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0" />
                        )}
                        {p.nome}
                        {!p.ativo && (
                          <span className="text-xs text-muted-foreground">(inativo)</span>
                        )}
                      </span>
                    </td>
                    <td className="p-3 tabular-nums whitespace-nowrap">{p.codigo}</td>
                    <td className="p-3 text-right whitespace-nowrap tabular-nums">
                      <QuantidadeBadge produto={p} />
                    </td>
                    {verCusto && (
                      <td className="p-3 text-right whitespace-nowrap tabular-nums">
                        {formatCusto(p.custo)}
                      </td>
                    )}
                    <td className="p-3">{p.fornecedor ?? "—"}</td>
                    <td className="p-3 text-right">
                      {podeMovimentar && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Editar ${p.nome}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditar(p);
                          }}
                        >
                          <Pencil />
                        </Button>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-t bg-muted/30">
                      <td colSpan={colunas} className="p-3">
                        <ListaFilha
                          produto={p}
                          verCusto={verCusto}
                          podeMovimentar={podeMovimentar}
                          onMovimento={(tipo) => onMovimento(tipo, p)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QuantidadeBadge({ produto: p }: { produto: ProdutoEstoque }) {
  const tom = p.quantidade < 0 ? TOM.perigo : p.abaixoMinimo ? TOM.aviso : null;
  const texto = `${formatQtd(p.quantidade)} ${p.unidade}`;
  if (!tom) return <>{texto}</>;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", tom)}
      title={
        p.quantidade < 0
          ? "Saldo negativo"
          : `Abaixo do mínimo (${formatQtd(p.estoqueMinimo ?? 0)})`
      }
    >
      <AlertTriangle className="size-3" />
      {texto}
    </span>
  );
}

/** Child list of a product: each purchase (entrada) and the latest movements. */
function ListaFilha({
  produto,
  verCusto,
  podeMovimentar,
  onMovimento,
}: {
  produto: ProdutoEstoque;
  verCusto: boolean;
  podeMovimentar: boolean;
  onMovimento: (tipo: TipoMovimento) => void;
}) {
  const movs = useMovimentosEstoque(produto.id);
  if (movs.isPending) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (movs.isError) return <p className="text-sm text-destructive">{movs.error.message}</p>;
  const entradas = movs.data.filter((m) => m.tipo === "Entrada");
  const outros = movs.data.filter((m) => m.tipo !== "Entrada").slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {produto.setor} · {produto.setorNome} · unidade {produto.unidade}
          {produto.estoqueMinimo !== null && ` · mínimo ${formatQtd(produto.estoqueMinimo)}`}
        </span>
        {podeMovimentar && (
          <span className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onMovimento("Baixa")}>
              <ArrowUpFromLine />
              Baixa
            </Button>
            <Button size="sm" variant="outline" onClick={() => onMovimento("Entrada")}>
              <PackagePlus />
              Entrada
            </Button>
            <Button size="sm" variant="outline" onClick={() => onMovimento("Devolução")}>
              <Undo2 />
              Devolução
            </Button>
            <Button size="sm" variant="outline" onClick={() => onMovimento("Perda")}>
              <PackageMinus />
              Perda
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onMovimento("Ajuste")}>
              Ajuste
            </Button>
          </span>
        )}
      </div>
      {produto.observacao && <p className="text-sm">{produto.observacao}</p>}
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <Th>Material</Th>
              <Th>Fornecedor</Th>
              {verCusto && <Th right>Último valor pago</Th>}
              <Th>Data</Th>
              <Th>Lote</Th>
              <Th right>Quantidade</Th>
            </tr>
          </thead>
          <tbody>
            {entradas.length === 0 ? (
              <tr className="border-t">
                <td colSpan={verCusto ? 6 : 5} className="p-3 text-muted-foreground">
                  Nenhuma entrada registrada.
                </td>
              </tr>
            ) : (
              entradas.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-3">{m.produto}</td>
                  <td className="p-3">{m.fornecedor ?? "—"}</td>
                  {verCusto && (
                    <td className="p-3 text-right tabular-nums">{formatCusto(m.valorUnitario)}</td>
                  )}
                  <td className="p-3 whitespace-nowrap">{formatDateOnly(m.data)}</td>
                  <td className="p-3">{m.lote ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums">
                    {formatQtd(m.quantidade)} {m.unidade}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Similares produtoId={produto.id} podeEditar={podeMovimentar} />
      {outros.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Últimas saídas e ajustes</p>
          <ul className="space-y-1 text-sm">
            {outros.map((m) => (
              <li key={m.id} className="flex flex-wrap gap-x-3">
                <span className="tabular-nums">{formatDateOnly(m.data)}</span>
                <span className="font-medium">{m.tipo}</span>
                <span className="tabular-nums">
                  {formatQtd(m.quantidadeSinal)} {m.unidade}
                </span>
                {m.cliente && <span>{m.cliente}</span>}
                {m.ordemNumero && <span>OS {m.ordemNumero}</span>}
                {m.motivo && <span>{m.motivo}</span>}
                {m.responsavel && <span className="text-muted-foreground">{m.responsavel}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
/** Names suppliers use for this product (similares, 0047), set when importing a note or by hand. */
function Similares({ produtoId, podeEditar }: { produtoId: string; podeEditar: boolean }) {
  const similares = useSimilaresEstoque(produtoId);
  const run = useDataAction();
  const [nome, setNome] = useState("");
  const lista = similares.data ?? [];
  if (!podeEditar && lista.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Nomes similares (como os fornecedores chamam este produto)
      </p>
      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum ainda.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {lista.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs"
              title={[
                s.fornecedorNome ??
                  (s.fornecedorCnpj ? formatarCnpj(s.fornecedorCnpj) : "Qualquer fornecedor"),
                s.codigoFornecedor && `cód. ${s.codigoFornecedor}`,
                s.fator !== 1 && `1 un da nota = ${formatQtd(s.fator)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            >
              <span className="font-medium">{s.nome}</span>
              <span className="text-muted-foreground">
                {s.fornecedorNome ?? (s.fornecedorCnpj ? formatarCnpj(s.fornecedorCnpj) : "geral")}
                {s.fator !== 1 && ` · ×${formatQtd(s.fator)}`}
              </span>
              {podeEditar && (
                <button
                  type="button"
                  aria-label={`Desligar ${s.nome}`}
                  className="ml-1 text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    void run(() => estoqueRepository.excluirSimilar(s.id), "Nome desligado")
                  }
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {podeEditar && (
        <form
          className="flex max-w-md gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(async () => {
              await estoqueRepository.salvarSimilar(produtoId, nome);
              return true;
            }, "Nome similar ligado");
            if (ok) setNome("");
          }}
        >
          <Input
            aria-label="Nome similar"
            className="h-8"
            placeholder="Ex.: COLA SUPER CIANO"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <Button size="sm" variant="outline" type="submit" disabled={!nome.trim()}>
            Ligar nome
          </Button>
        </form>
      )}
    </div>
  );
}

// ---------- Movements history ----------
function ListaMovimentos({ verCusto, podeExcluir }: { verCusto: boolean; podeExcluir: boolean }) {
  const movs = useMovimentosEstoque();
  const [tipo, setTipo] = useState<"" | TipoMovimento>("");
  const [excluir, setExcluir] = useState<MovimentoEstoque | null>(null);
  const run = useDataAction();
  if (movs.isPending) return <CardGridSkeleton />;
  if (movs.isError) return <p className="text-sm text-destructive">{movs.error.message}</p>;
  const vis = tipo ? movs.data.filter((m) => m.tipo === tipo) : movs.data;

  function exportar() {
    const linhas = vis.map((m) => ({
      data: m.data,
      tipo: m.tipo,
      material: m.produto,
      codigo: m.codigo,
      quantidade: m.quantidadeSinal,
      unidade: m.unidade,
      valor_unitario: m.valorUnitario ?? "",
      cliente: m.cliente ?? "",
      ordem: m.ordemNumero ?? "",
      fornecedor: m.fornecedor ?? "",
      lote: m.lote ?? "",
      responsavel: m.responsavel ?? "",
      motivo: m.motivo ?? "",
      nota: m.notaNumero ?? "",
      observacao: m.observacao ?? "",
      registrado_por: m.registradoPorNome ?? "",
    }));
    baixarArquivo(`movimentos-estoque-${localToday()}.csv`, toCsv(linhas));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Tipo de movimento"
          className={cn(selectClass, "w-52")}
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "" | TipoMovimento)}
        >
          <option value="">Todos os tipos</option>
          {(["Entrada", "Baixa", "Devolução", "Perda", "Ajuste"] as const).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">{vis.length} movimentos (últimos 500)</span>
        <Button variant="outline" className="ml-auto" onClick={exportar} disabled={!vis.length}>
          <Download />
          Exportar
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <Th>Material</Th>
              <Th>Código</Th>
              <Th>Data</Th>
              <Th>Tipo</Th>
              <Th right>Quantidade</Th>
              <Th>Cliente</Th>
              <Th>Fornecedor</Th>
              <Th>Lote</Th>
              <Th>Responsável</Th>
              {verCusto && <Th right>Valor</Th>}
              {podeExcluir && <Th />}
            </tr>
          </thead>
          <tbody>
            {vis.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-3 font-medium">{m.produto}</td>
                <td className="p-3 tabular-nums whitespace-nowrap">{m.codigo}</td>
                <td className="p-3 whitespace-nowrap">{formatDateOnly(m.data)}</td>
                <td className="p-3">
                  {m.tipo}
                  {m.motivo && (
                    <span className="block text-xs text-muted-foreground">{m.motivo}</span>
                  )}
                </td>
                <td
                  className={cn(
                    "p-3 text-right whitespace-nowrap tabular-nums",
                    m.quantidadeSinal < 0 && "text-destructive",
                  )}
                >
                  {formatQtd(m.quantidadeSinal)} {m.unidade}
                </td>
                <td className="p-3">
                  {m.cliente ?? "—"}
                  {m.ordemNumero && (
                    <span className="block text-xs text-muted-foreground">OS {m.ordemNumero}</span>
                  )}
                </td>
                <td className="p-3">{m.fornecedor ?? "—"}</td>
                <td className="p-3">{m.lote ?? "—"}</td>
                <td className="p-3">{m.responsavel ?? m.registradoPorNome ?? "—"}</td>
                {verCusto && (
                  <td className="p-3 text-right tabular-nums">
                    {m.valorUnitario === null ? "—" : formatCusto(m.valorUnitario)}
                  </td>
                )}
                {podeExcluir && (
                  <td className="p-3 text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Excluir lançamento"
                      onClick={() => setExcluir(m)}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={excluir !== null}
        onOpenChange={(o) => !o && setExcluir(null)}
        title="Excluir este lançamento?"
        description="Use só para lançamento errado: o saldo do produto volta como se ele não existisse."
        confirmLabel="Excluir"
        onConfirm={async () => {
          if (excluir)
            await run(() => estoqueRepository.excluirMovimento(excluir.id), "Lançamento excluído");
          setExcluir(null);
        }}
      />
    </div>
  );
}

// ---------- Dialogs ----------
const Campo = ({
  id,
  label,
  children,
  className,
}: {
  id?: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("space-y-1.5", className)}>
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);

function ProdutoDialog({
  produto,
  onClose,
}: {
  produto: ProdutoEstoque | null;
  onClose: () => void;
}) {
  const run = useDataAction();
  const [f, setF] = useState({
    setor: produto?.setor ?? "",
    nome: produto?.nome ?? "",
    unidade: (produto?.unidade ?? "un") as UnidadeEstoque,
    minimo: produto?.estoqueMinimo === null || !produto ? "" : String(produto.estoqueMinimo),
    fornecedor:
      produto?.fornecedorId && produto.fornecedor
        ? { id: produto.fornecedorId, nome: produto.fornecedor }
        : null,
    observacao: produto?.observacao ?? "",
    ativo: produto?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const set = (p: Partial<typeof f>) => setF((v) => ({ ...v, ...p }));

  async function salvar() {
    setSalvando(true);
    const ok = await run(
      () =>
        estoqueRepository.salvarProduto(produto?.id ?? null, {
          setor: f.setor,
          nome: f.nome,
          unidade: f.unidade,
          estoqueMinimo: lerNumero(f.minimo),
          fornecedorId: f.fornecedor?.id ?? null,
          fornecedorNome: null,
          observacao: f.observacao,
          ativo: f.ativo,
        }),
      produto ? "Produto salvo" : "Produto cadastrado",
    );
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{produto ? `Editar ${produto.codigo}` : "Novo produto"}</DialogTitle>
          <DialogDescription>
            O código nasce do setor (ex.: 06.0001) e não muda depois.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="pr-setor" label="Setor">
            <select
              id="pr-setor"
              className={selectClass}
              value={f.setor}
              disabled={Boolean(produto)}
              onChange={(e) => set({ setor: e.target.value })}
            >
              <option value="">Escolha…</option>
              {SETORES_ESTOQUE.map((s) => (
                <option key={s.prefixo} value={s.prefixo}>
                  {s.prefixo} · {s.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="pr-un" label="Unidade">
            <select
              id="pr-un"
              className={selectClass}
              value={f.unidade}
              onChange={(e) => set({ unidade: e.target.value as UnidadeEstoque })}
            >
              {UNIDADES_ESTOQUE.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Campo>
          <Campo id="pr-nome" label="Produto" className="sm:col-span-2">
            <Input
              id="pr-nome"
              value={f.nome}
              placeholder="Ex.: Cola instantânea"
              onChange={(e) => set({ nome: e.target.value })}
            />
          </Campo>
          <Campo id="pr-min" label="Estoque mínimo (opcional)">
            <Input
              id="pr-min"
              inputMode="decimal"
              value={f.minimo}
              onChange={(e) => set({ minimo: e.target.value })}
            />
          </Campo>
          <Campo label="Situação">
            <label className="flex h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={f.ativo}
                onChange={(e) => set({ ativo: e.target.checked })}
              />
              Ativo
            </label>
          </Campo>
          <Campo label="Fornecedor de costume (opcional)" className="sm:col-span-2">
            <ClientePicker
              placeholder="Buscar fornecedor nos cadastros…"
              value={f.fornecedor}
              onChange={(c) => set({ fornecedor: c })}
            />
          </Campo>
          <Campo id="pr-obs" label="Observação" className="sm:col-span-2">
            <Textarea
              id="pr-obs"
              rows={2}
              value={f.observacao}
              onChange={(e) => set({ observacao: e.target.value })}
            />
          </Campo>
        </div>
        <DialogFooter className="gap-2">
          {produto && produto.movimentos === 0 && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={() => setExcluir(true)}
            >
              <Trash2 />
              Excluir
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !f.nome.trim() || !f.setor}>
            Salvar
          </Button>
        </DialogFooter>
        <ConfirmDialog
          open={excluir}
          onOpenChange={setExcluir}
          title="Excluir este produto?"
          description="Só dá para excluir produto sem movimentos."
          confirmLabel="Excluir"
          onConfirm={async () => {
            if (!produto) return;
            const ok = await run(async () => {
              await estoqueRepository.excluirProduto(produto.id);
              return true;
            }, "Produto excluído");
            setExcluir(false);
            if (ok !== undefined) onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

const TEXTO_MOVIMENTO: Record<TipoMovimento, { titulo: string; descricao: string }> = {
  Entrada: { titulo: "Entrada de material", descricao: "Material que chegou (compra)." },
  Baixa: {
    titulo: "Baixa de material",
    descricao: "Material que saiu do estoque para a produção. Só aqui o estoque diminui.",
  },
  Devolução: { titulo: "Devolução ao estoque", descricao: "Material que voltou para o estoque." },
  Perda: {
    titulo: "Perda de material",
    descricao: "Material perdido por retrabalho, produto defeituoso e afins.",
  },
  Ajuste: {
    titulo: "Ajuste de estoque",
    descricao: "Corrige o saldo depois de uma contagem: positivo soma, negativo subtrai.",
  },
};

function MovimentoDialog({
  tipo,
  produtoInicial,
  produtos,
  responsavelPadrao,
  onClose,
}: {
  tipo: TipoMovimento;
  produtoInicial: ProdutoEstoque | null;
  produtos: ProdutoEstoque[];
  responsavelPadrao: string;
  onClose: () => void;
}) {
  const run = useDataAction();
  const [produtoId, setProdutoId] = useState(produtoInicial?.id ?? "");
  const [f, setF] = useState({
    data: localToday(),
    quantidade: "",
    valor: "",
    fornecedor: null as { id: string; nome: string } | null,
    lote: "",
    cliente: null as { id: string; nome: string } | null,
    ordem: "",
    responsavel: tipo === "Entrada" || tipo === "Ajuste" ? "" : responsavelPadrao,
    motivo: "" as "" | MotivoPerda,
    nota: "",
    observacao: "",
  });
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<typeof f>) => setF((v) => ({ ...v, ...p }));
  const produto = produtos.find((p) => p.id === produtoId) ?? null;
  const qtd = lerNumero(f.quantidade);
  const saidas = tipo === "Baixa" || tipo === "Perda";
  const ficaNegativo = produto && qtd !== null && saidas && produto.quantidade - qtd < 0;
  const precisaResp = tipo === "Baixa" || tipo === "Devolução" || tipo === "Perda";
  const valido =
    produto &&
    qtd !== null &&
    qtd !== 0 &&
    (tipo === "Ajuste" || qtd > 0) &&
    (!precisaResp || f.responsavel.trim()) &&
    (tipo !== "Perda" || f.motivo);

  async function salvar() {
    if (!produto || qtd === null) return;
    setSalvando(true);
    const ordem = f.ordem.trim() ? Number(f.ordem.replace(/\D/g, "")) : null;
    const ok = await run(
      async () => {
        await estoqueRepository.registrarMovimento({
          tipo,
          produtoId: produto.id,
          data: f.data,
          quantidade: qtd,
          valorUnitario: tipo === "Entrada" ? lerNumero(f.valor) : null,
          fornecedorId: f.fornecedor?.id ?? null,
          lote: f.lote,
          clienteId: f.cliente?.id ?? null,
          ordemNumero: ordem || null,
          responsavel: f.responsavel,
          motivo: tipo === "Perda" ? (f.motivo as MotivoPerda) : null,
          notaNumero: f.nota,
          observacao: f.observacao,
        });
        return true;
      },
      tipo === "Ajuste" ? "Ajuste registrado" : `${TEXTO_MOVIMENTO[tipo].titulo} registrada`,
    );
    setSalvando(false);
    if (ok !== undefined) onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TEXTO_MOVIMENTO[tipo].titulo}</DialogTitle>
          <DialogDescription>{TEXTO_MOVIMENTO[tipo].descricao}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Material" className="sm:col-span-2">
            <ProdutoPicker produtos={produtos} value={produtoId} onChange={setProdutoId} />
          </Campo>
          <Campo id="mv-data" label="Data">
            <Input
              id="mv-data"
              type="date"
              max={localToday()}
              value={f.data}
              onChange={(e) => set({ data: e.target.value })}
            />
          </Campo>
          <Campo id="mv-qtd" label={`Quantidade${produto ? ` (${produto.unidade})` : ""}`}>
            <Input
              id="mv-qtd"
              inputMode="decimal"
              value={f.quantidade}
              placeholder={tipo === "Ajuste" ? "Ex.: -2 ou 5" : ""}
              onChange={(e) => set({ quantidade: e.target.value })}
            />
          </Campo>
          {ficaNegativo && (
            <p
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm sm:col-span-2",
                TOM.aviso,
              )}
            >
              <AlertTriangle className="size-4 shrink-0" />O saldo vai ficar negativo (
              {formatQtd(produto.quantidade - (qtd ?? 0))}). Dá para registrar, mas confira se falta
              lançar uma entrada.
            </p>
          )}
          {tipo === "Perda" && (
            <Campo id="mv-motivo" label="Motivo" className="sm:col-span-2">
              <select
                id="mv-motivo"
                className={selectClass}
                value={f.motivo}
                onChange={(e) => set({ motivo: e.target.value as MotivoPerda })}
              >
                <option value="">Escolha…</option>
                {MOTIVOS_PERDA.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Campo>
          )}
          {tipo === "Entrada" && (
            <>
              <Campo id="mv-valor" label="Valor pago por unidade">
                <Input
                  id="mv-valor"
                  inputMode="decimal"
                  placeholder="R$"
                  value={f.valor}
                  onChange={(e) => set({ valor: e.target.value })}
                />
              </Campo>
              <Campo id="mv-nota" label="Nº da nota (opcional)">
                <Input
                  id="mv-nota"
                  value={f.nota}
                  onChange={(e) => set({ nota: e.target.value })}
                />
              </Campo>
            </>
          )}
          {(tipo === "Baixa" || tipo === "Devolução") && (
            <>
              <Campo label="Cliente (opcional)" className="sm:col-span-2">
                <ClientePicker value={f.cliente} onChange={(c) => set({ cliente: c })} />
              </Campo>
              <Campo id="mv-os" label="Ordem de produção nº (opcional)">
                <Input
                  id="mv-os"
                  inputMode="numeric"
                  value={f.ordem}
                  placeholder="O cliente vem da ordem"
                  onChange={(e) => set({ ordem: e.target.value })}
                />
              </Campo>
            </>
          )}
          {tipo !== "Ajuste" && (
            <>
              <Campo label="Fornecedor" className="sm:col-span-2">
                <ClientePicker
                  placeholder="Buscar fornecedor nos cadastros…"
                  value={f.fornecedor}
                  onChange={(c) => set({ fornecedor: c })}
                />
              </Campo>
              <Campo id="mv-lote" label="Lote">
                <Input
                  id="mv-lote"
                  value={f.lote}
                  placeholder={produto?.ultimoLote ?? ""}
                  onChange={(e) => set({ lote: e.target.value })}
                />
              </Campo>
            </>
          )}
          {tipo !== "Entrada" && (
            <Campo id="mv-resp" label={precisaResp ? "Responsável" : "Responsável (opcional)"}>
              <Input
                id="mv-resp"
                value={f.responsavel}
                placeholder="Quem retirou / devolveu"
                onChange={(e) => set({ responsavel: e.target.value })}
              />
            </Campo>
          )}
          <Campo id="mv-obs" label="Observação" className="sm:col-span-2">
            <Textarea
              id="mv-obs"
              rows={2}
              value={f.observacao}
              onChange={(e) => set({ observacao: e.target.value })}
            />
          </Campo>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !valido}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportarDialog({ onClose }: { onClose: () => void }) {
  const run = useDataAction();
  const [linhas, setLinhas] = useState<LinhaPlanilhaEstoque[]>([]);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<ImportacaoEstoque | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ler(file: File) {
    setErro("");
    setResultado(null);
    setLinhas([]);
    try {
      const texto = await file.text();
      const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
      const sep =
        (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
      setLinhas(linhasDaPlanilha(parseCsv(texto.replace(/^\uFEFF/, ""), sep).rows));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    }
  }

  async function importar() {
    setEnviando(true);
    const r = await run(() => estoqueRepository.importarPlanilha(linhas));
    setEnviando(false);
    if (r) setResultado(r);
  }

  const modelo = () =>
    baixarArquivo(
      "modelo-estoque.csv",
      toCsv(
        [
          {
            codigo: "",
            produto: "Cola instantânea",
            setor: "06",
            unidade: "un",
            quantidade: "12",
            custo: "8.50",
            fornecedor: "",
            lote: "",
            minimo: "5",
          },
        ],
        [...COLUNAS_PLANILHA_ESTOQUE],
      ),
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar planilha do estoque</DialogTitle>
          <DialogDescription>
            CSV com as colunas {COLUNAS_PLANILHA_ESTOQUE.join(", ")}. O produto é achado pelo código
            ou pelo nome; sem par, é criado no setor informado (01 a 08 ou o nome). A quantidade
            entra como Entrada — importar a mesma planilha duas vezes soma de novo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button variant="link" className="h-auto p-0" onClick={modelo}>
            Baixar modelo
          </Button>
          <Input
            type="file"
            accept=".csv,text/csv"
            aria-label="Arquivo CSV"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void ler(file);
            }}
          />
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {linhas.length > 0 && !resultado && (
            <p className="text-sm">
              {linhas.length} linhas prontas ·{" "}
              {linhas.filter((l) => lerNumero(l.quantidade)).length} com quantidade.
            </p>
          )}
          {resultado && (
            <div className="space-y-1 text-sm">
              <p>
                {resultado.criados} produtos criados · {resultado.entradas} entradas registradas
              </p>
              {resultado.erros.length > 0 && (
                <ul className="max-h-40 overflow-y-auto text-destructive">
                  {resultado.erros.map((e) => (
                    <li key={e.linha}>
                      Linha {e.linha + 1} ({e.produto ?? "sem nome"}): {e.erro}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
          {!resultado && (
            <Button onClick={importar} disabled={enviando || linhas.length === 0}>
              Importar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
