import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorComposicao, ResumoComposicao } from "@/components/app/orcamento-composicao";
import {
  useCurrentUser,
  useCustosDaVenda,
  useCustosOrcamento,
  useDataAction,
  useMateriaisDaOrdem,
  useMateriaisDaVenda,
  useOrcamentoConfig,
  useProdutosEstoque,
} from "@/hooks/use-data";
import {
  brl,
  canListarMaterial,
  canVender,
  canVerCustoEstoque,
  composicaoDoItem,
  CONFIG_PADRAO,
  formatQtd,
  orcamentoRepository,
  type MaterialItem,
  type ProdutoEstoque,
} from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Composição e lista de material de cada item de proposta/pedido (migrations 0048 and 0050).
 * Projetos Especiais, Estoque, Gestão and Direção build it; whoever may see costs (also Comercial)
 * sees values and prices; the rest sees only the materials. It never moves stock: the estoque
 * screen uses the materials for the previsão and the shopping list, and the item's ordem de
 * produção shows them with what was already taken out. Renders nothing without the estoque schema.
 */
export function ListaMaterialVenda({
  vendaId,
  itens,
  pedido,
}: {
  vendaId: string;
  itens: { id: string; descricao: string; quantidade: number }[];
  pedido: boolean;
}) {
  const me = useCurrentUser().data;
  const verCusto = canVerCustoEstoque(me);
  const podeEditar = canListarMaterial(me);
  const podeAplicar = podeEditar || canVender(me);
  const run = useDataAction();
  const materiais = useMateriaisDaVenda(vendaId);
  const produtos = useProdutosEstoque();
  const custos = useCustosDaVenda(vendaId, verCusto);
  const catalogo = useCustosOrcamento(verCusto);
  const config = useOrcamentoConfig().data ?? CONFIG_PADRAO;
  const [editando, setEditando] = useState<string | null>(null);
  if (!materiais.data || !produtos.data) return null;
  const comComposicao = verCusto && Array.isArray(custos.data) && Array.isArray(catalogo.data);
  const conta = materiais.data.some((m) => m.contaNaPrevisao);

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Boxes className="size-5 text-primary" />
          {comComposicao ? "Composição de custo e material" : "Lista de material"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Montada pela equipe de Projetos em cada item: material do estoque
          {comComposicao && ", serviços, mão de obra e deslocamento, com o preço que sai deles"}. O
          material não sai do estoque: entra na{" "}
          <Link to="/estoque" className="text-primary hover:underline">
            previsão do estoque
          </Link>{" "}
          quando o orçamento é aprovado.
          {materiais.data.length > 0 && !conta && " Este documento ainda não conta na previsão."}
        </p>
      </div>
      {itens.length === 0 && (
        <p className="text-sm text-muted-foreground">Salve o documento para montar a composição.</p>
      )}
      {itens.map((it, i) => {
        const mats = materiais.data?.filter((m) => m.vendaItemId === it.id) ?? [];
        const outros = custos.data?.filter((c) => c.vendaItemId === it.id) ?? [];
        const vazio = mats.length === 0 && outros.length === 0;
        const c = comComposicao
          ? composicaoDoItem(mats, outros, catalogo.data ?? [], config)
          : null;
        const cada =
          it.quantidade !== 1 ? (v: number) => ` (${brl(v / it.quantidade)} cada)` : () => "";
        return (
          <div key={it.id} className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Item {i + 1} · {it.descricao}
                {c && !vazio && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    custo {brl(c.custo)} · venda {brl(c.venda)}
                  </span>
                )}
              </p>
              {podeEditar && editando !== it.id && (
                <Button variant="outline" size="sm" onClick={() => setEditando(it.id)}>
                  {vazio ? <Plus /> : <Pencil />}
                  {vazio ? "Montar composição" : "Editar composição"}
                </Button>
              )}
            </div>
            {editando === it.id ? (
              <EditorComposicao
                vendaItemId={it.id}
                materiais={mats}
                outros={outros}
                produtos={produtos.data ?? []}
                catalogo={catalogo.data ?? []}
                config={config}
                onClose={() => setEditando(null)}
              />
            ) : vazio ? (
              <p className="text-sm text-muted-foreground">Sem composição.</p>
            ) : comComposicao ? (
              <ResumoComposicao
                materiais={mats}
                outros={outros}
                catalogo={catalogo.data ?? []}
                config={config}
                podeAplicar={podeAplicar}
                onAplicar={(valor) =>
                  void run(
                    () => orcamentoRepository.aplicarPreco(it.id, valor),
                    `Valor do item ${i + 1}: ${brl(valor)}${cada(valor)}`,
                  )
                }
              />
            ) : (
              <TabelaMaterial linhas={mats} produtos={produtos.data ?? []} baixas={pedido} />
            )}
          </div>
        );
      })}
      {comComposicao && podeAplicar && (
        <p className="text-xs text-muted-foreground">
          “Usar no item” troca o valor do item pelo preço escolhido e recarrega o documento: salve
          antes o que estiver editando nos itens.
        </p>
      )}
    </section>
  );
}

/** Read-only list on the ordem de produção: what the item needs and what was already taken. */
export function MaterialDaOrdem({ ordemId }: { ordemId: string }) {
  const materiais = useMateriaisDaOrdem(ordemId);
  const produtos = useProdutosEstoque();
  if (!materiais.data?.length) return null;
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Boxes className="size-5 text-primary" />
          Material previsto
        </h2>
        <p className="text-sm text-muted-foreground">
          Da composição do pedido. O estoque dá a baixa apontando o número desta ordem; o baixado
          aparece aqui.
        </p>
      </div>
      <TabelaMaterial linhas={materiais.data} produtos={produtos.data ?? []} baixas />
    </section>
  );
}

/** One row per product (sections added up). */
function porProduto(linhas: MaterialItem[]) {
  const mapa = new Map<string, MaterialItem>();
  for (const l of linhas) {
    const a = mapa.get(l.produtoId);
    mapa.set(
      l.produtoId,
      a
        ? {
            ...a,
            quantidade: a.quantidade + l.quantidade,
            observacao: [a.observacao, l.observacao].filter(Boolean).join("; ") || null,
          }
        : l,
    );
  }
  return [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

function TabelaMaterial({
  linhas,
  produtos,
  baixas,
}: {
  linhas: MaterialItem[];
  produtos: ProdutoEstoque[];
  baixas: boolean;
}) {
  const saldo = (id: string) => produtos.find((p) => p.id === id)?.quantidade ?? null;
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="p-2 font-medium">Código</th>
            <th className="p-2 font-medium">Material</th>
            <th className="p-2 text-right font-medium">Quantidade</th>
            {baixas && <th className="p-2 text-right font-medium">Baixado</th>}
            {baixas && <th className="p-2 text-right font-medium">Falta tirar</th>}
            <th className="p-2 text-right font-medium">Em estoque</th>
          </tr>
        </thead>
        <tbody>
          {porProduto(linhas).map((m) => {
            const s = saldo(m.produtoId);
            return (
              <tr key={m.produtoId} className="border-t">
                <td className="p-2 text-muted-foreground tabular-nums">{m.codigo}</td>
                <td className="p-2">
                  {m.produto}
                  {m.observacao && (
                    <span className="block text-xs text-muted-foreground">{m.observacao}</span>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatQtd(m.quantidade)} {m.unidade}
                </td>
                {baixas && <td className="p-2 text-right tabular-nums">{formatQtd(m.baixado)}</td>}
                {baixas && (
                  <td className="p-2 text-right font-medium tabular-nums">
                    {formatQtd(m.pendente)}
                  </td>
                )}
                <td
                  className={cn(
                    "p-2 text-right tabular-nums",
                    s !== null && s < m.pendente && "font-medium text-destructive",
                  )}
                >
                  {s === null ? "—" : formatQtd(s)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
