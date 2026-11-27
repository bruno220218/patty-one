import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { filtrarProdutos, formatQtd, type ProdutoEstoque } from "@/lib/data";

/** Picks a stock product by name or code (local search over the loaded list). */
export function ProdutoPicker({
  produtos,
  value,
  onChange,
  mostrarSaldo = true,
}: {
  produtos: ProdutoEstoque[];
  value: string;
  onChange: (id: string) => void;
  mostrarSaldo?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const produto = produtos.find((p) => p.id === value) ?? null;
  const opcoes = useMemo(
    () =>
      filtrarProdutos(
        produtos.filter((p) => p.ativo || p.id === value),
        busca,
        "",
      ).slice(0, 50),
    [produtos, busca, value],
  );

  if (produto) {
    return (
      <div className="flex min-h-10 items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
        <span className="min-w-0">
          <span className="text-muted-foreground tabular-nums">{produto.codigo}</span>{" "}
          {produto.nome}
          {mostrarSaldo && (
            <span className="text-muted-foreground">
              {" "}
              · saldo {formatQtd(produto.quantidade)} {produto.unidade}
            </span>
          )}
        </span>
        <button
          type="button"
          className="shrink-0 text-primary hover:underline"
          onClick={() => onChange("")}
        >
          Trocar
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Input
        aria-label="Buscar material"
        placeholder="Buscar por nome ou código…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
        {opcoes.map((p) => (
          <button
            type="button"
            key={p.id}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => onChange(p.id)}
          >
            <span className="text-muted-foreground tabular-nums">{p.codigo}</span> {p.nome}
          </button>
        ))}
        {opcoes.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum produto.</p>
        )}
      </div>
    </div>
  );
}
