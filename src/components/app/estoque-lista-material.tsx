import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProdutoPicker } from "@/components/app/estoque-produto-picker";
import {
  useCurrentUser,
  useDataAction,
  useMateriaisDaOrdem,
  useMateriaisDaVenda,
  useProdutosEstoque,
} from "@/hooks/use-data";
import {
  canListarMaterial,
  estoqueRepository,
  formatQtd,
  lerNumero,
  type MaterialItem,
  type ProdutoEstoque,
} from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Lista de material (migration 0048): per item of a proposta/pedido, which stock products and how
 * much. Projetos Especiais, Estoque, Gestão and Direção edit it; everyone approved reads it. It
 * never moves stock: the estoque screen uses it for the previsão and the shopping list, and the
 * item's ordem de produção shows the same list with what was already taken out (baixas).
 * Renders nothing while the estoque schema or 0048 isn't there.
 */
export function ListaMaterialVenda({
  vendaId,
  itens,
  pedido,
}: {
  vendaId: string;
  itens: { id: string; descricao: string }[];
  pedido: boolean;
}) {
  const me = useCurrentUser().data;
  const materiais = useMateriaisDaVenda(vendaId);
  const produtos = useProdutosEstoque();
  const [editando, setEditando] = useState<string | null>(null);
  if (!materiais.data || !produtos.data) return null;
  const podeEditar = canListarMaterial(me);
  const porItem = (id: string) => materiais.data?.filter((m) => m.vendaItemId === id) ?? [];
  const conta = materiais.data.some((m) => m.contaNaPrevisao);

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Boxes className="size-5 text-primary" />
            Lista de material
          </h2>
          <p className="text-sm text-muted-foreground">
            Material do estoque para cada item, montado pela equipe de Projetos. Não tira nada do
            estoque: entra na{" "}
            <Link to="/estoque" className="text-primary hover:underline">
              previsão do estoque
            </Link>{" "}
            quando o orçamento é aprovado.
            {materiais.data.length > 0 && !conta && " Este documento ainda não conta na previsão."}
          </p>
        </div>
      </div>
      {itens.length === 0 && (
        <p className="text-sm text-muted-foreground">Salve o documento para montar a lista.</p>
      )}
      {itens.map((it, i) => {
        const linhas = porItem(it.id);
        return (
          <div key={it.id} className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Item {i + 1} · {it.descricao}
              </p>
              {podeEditar && editando !== it.id && (
                <Button variant="outline" size="sm" onClick={() => setEditando(it.id)}>
                  {linhas.length ? <Pencil /> : <Plus />}
                  {linhas.length ? "Editar lista" : "Montar lista"}
                </Button>
              )}
            </div>
            {editando === it.id ? (
              <EditorLista
                vendaItemId={it.id}
                linhas={linhas}
                produtos={produtos.data ?? []}
                onClose={() => setEditando(null)}
              />
            ) : linhas.length ? (
              <TabelaMaterial linhas={linhas} produtos={produtos.data ?? []} baixas={pedido} />
            ) : (
              <p className="text-sm text-muted-foreground">Sem material listado.</p>
            )}
          </div>
        );
      })}
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
          Da lista de material do pedido. O estoque dá a baixa apontando o número desta ordem; o
          baixado aparece aqui.
        </p>
      </div>
      <TabelaMaterial linhas={materiais.data} produtos={produtos.data ?? []} baixas />
    </section>
  );
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
          {linhas.map((m) => {
            const s = saldo(m.produtoId);
            return (
              <tr key={m.id} className="border-t">
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

type Linha = { produtoId: string; quantidade: string; observacao: string };

function EditorLista({
  vendaItemId,
  linhas,
  produtos,
  onClose,
}: {
  vendaItemId: string;
  linhas: MaterialItem[];
  produtos: ProdutoEstoque[];
  onClose: () => void;
}) {
  const run = useDataAction();
  const [salvando, setSalvando] = useState(false);
  const [rows, setRows] = useState<Linha[]>(() =>
    linhas.length
      ? linhas.map((l) => ({
          produtoId: l.produtoId,
          quantidade: formatQtd(l.quantidade),
          observacao: l.observacao ?? "",
        }))
      : [{ produtoId: "", quantidade: "", observacao: "" }],
  );
  const setRow = (k: number, p: Partial<Linha>) =>
    setRows((a) => a.map((r, i) => (i === k ? { ...r, ...p } : r)));

  const preenchidas = rows.filter((r) => r.produtoId || r.quantidade.trim());
  const invalida = preenchidas.find((r) => !r.produtoId || !((lerNumero(r.quantidade) ?? 0) > 0));

  async function salvar() {
    setSalvando(true);
    const ok = await run(async () => {
      await estoqueRepository.salvarListaMaterial(
        vendaItemId,
        preenchidas.map((r) => ({
          produtoId: r.produtoId,
          quantidade: lerNumero(r.quantidade) ?? 0,
          observacao: r.observacao.trim() || null,
        })),
      );
      return true;
    }, "Lista de material salva");
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-lg border bg-background p-2 md:grid-cols-12">
          <div className="md:col-span-6">
            <ProdutoPicker
              produtos={produtos}
              value={r.produtoId}
              onChange={(id) => setRow(i, { produtoId: id })}
            />
          </div>
          <Input
            aria-label={`Quantidade do material ${i + 1}`}
            placeholder={`Qtd.${unidadeDe(produtos, r.produtoId)}`}
            inputMode="decimal"
            className="md:col-span-2"
            value={r.quantidade}
            onChange={(e) => setRow(i, { quantidade: e.target.value })}
          />
          <Input
            aria-label={`Observação do material ${i + 1}`}
            placeholder="Observação (opcional)"
            className="md:col-span-3"
            value={r.observacao}
            onChange={(e) => setRow(i, { observacao: e.target.value })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="md:col-span-1"
            aria-label={`Remover material ${i + 1}`}
            onClick={() => setRows((a) => a.filter((_, k) => k !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((a) => [...a, { produtoId: "", quantidade: "", observacao: "" }])}
        >
          <Plus />
          Adicionar material
        </Button>
        <div className="flex items-center gap-2">
          {invalida && (
            <span className="text-xs text-destructive">
              Escolha o material e a quantidade em todas as linhas.
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} disabled={salvando}>
            <X />
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void salvar()} disabled={salvando || !!invalida}>
            <Save />
            Salvar lista
          </Button>
        </div>
      </div>
    </div>
  );
}

const unidadeDe = (produtos: ProdutoEstoque[], id: string) => {
  const u = produtos.find((p) => p.id === id)?.unidade;
  return u ? ` (${u})` : "";
};
