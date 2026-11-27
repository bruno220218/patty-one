import { Fragment, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ChevronDown, ChevronRight, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { selectClass } from "@/components/app/operacao-ui";
import { useDemandaEstoque, usePrevisaoEstoque } from "@/hooks/use-data";
import {
  formatCusto,
  formatQtd,
  linhasListaCompras,
  localToday,
  quantoComprar,
  toCsv,
  type PrevisaoEstoque,
} from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Previsão (migration 0048): saldo of each product minus what the approved, open services still
 * need (their material lists, minus what was already taken out for the item's ordem). Never
 * moves stock. "Baixar lista de compras" downloads what's missing as CSV.
 */
type Filtro = "servicos" | "falta" | "todos";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function baixarCsv(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function PrevisaoEstoqueTab({ verCusto }: { verCusto: boolean }) {
  const previsao = usePrevisaoEstoque();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("servicos");
  const [comMinimo, setComMinimo] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const lista = useMemo(() => {
    const termo = semAcento(busca.trim());
    return (previsao.data ?? []).filter(
      (p) =>
        (filtro === "todos"
          ? p.ativo || p.reservado > 0
          : filtro === "falta"
            ? quantoComprar(p, comMinimo) > 0
            : p.reservado > 0 || quantoComprar(p, comMinimo) > 0) &&
        (!termo || semAcento(`${p.nome} ${p.codigo} ${p.fornecedor ?? ""}`).includes(termo)),
    );
  }, [previsao.data, busca, filtro, comMinimo]);

  if (previsao.isPending) return <CardGridSkeleton />;
  if (previsao.isError) return <p className="text-sm text-destructive">{previsao.error.message}</p>;
  if (previsao.data === null) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="A previsão ainda não está ligada"
        description="Rode a migration 0048 no Supabase para usar a lista de material dos orçamentos."
      />
    );
  }

  const compras = linhasListaCompras(previsao.data, comMinimo);
  const servicos = previsao.data.reduce((n, p) => n + (p.reservado > 0 ? 1 : 0), 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Estoque atual menos o material listado nos orçamentos aprovados que ainda estão abertos
        (pedido aberto ou em andamento, ou proposta aprovada que ainda não virou pedido),
        descontando o que já foi baixado para a ordem de cada item. Não tira nada do estoque.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar na previsão"
            placeholder="Buscar material, código ou fornecedor…"
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select
          aria-label="Mostrar"
          className={cn(selectClass, "w-auto")}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
        >
          <option value="servicos">Com serviços abertos ou falta</option>
          <option value="falta">Só o que falta comprar</option>
          <option value="todos">Todos os produtos</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={comMinimo}
            onChange={(e) => setComMinimo(e.target.checked)}
          />
          Repor o estoque mínimo
        </label>
        <Button
          variant="outline"
          disabled={compras.length === 0}
          onClick={() => baixarCsv(`lista-de-compras-${localToday()}.csv`, toCsv(compras))}
        >
          <Download />
          Baixar lista de compras ({compras.length})
        </Button>
      </div>

      {lista.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          {servicos === 0
            ? "Nenhum orçamento aprovado com lista de material ainda. A equipe de Projetos monta a lista em cada item da proposta ou do pedido."
            : "Nada para mostrar com esse filtro."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 p-3" />
                <th className="p-3 font-medium">Código</th>
                <th className="p-3 font-medium">Material</th>
                <th className="p-3 text-right font-medium">Em estoque</th>
                <th className="p-3 text-right font-medium">Reservado</th>
                <th className="p-3 text-right font-medium">Depois dos serviços</th>
                <th className="p-3 text-right font-medium">Comprar</th>
                <th className="p-3 font-medium">Fornecedor</th>
                {verCusto && <th className="p-3 text-right font-medium">Último valor pago</th>}
                <th className="p-3 font-medium">Lote</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <Fragment key={p.id}>
                  <LinhaPrevisao
                    p={p}
                    comMinimo={comMinimo}
                    verCusto={verCusto}
                    aberto={aberto === p.id}
                    onToggle={() => setAberto(aberto === p.id ? null : p.id)}
                  />
                  {aberto === p.id && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={verCusto ? 10 : 9} className="p-3">
                        <DemandaDoProduto produto={p} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LinhaPrevisao({
  p,
  comMinimo,
  verCusto,
  aberto,
  onToggle,
}: {
  p: PrevisaoEstoque;
  comMinimo: boolean;
  verCusto: boolean;
  aberto: boolean;
  onToggle: () => void;
}) {
  const comprar = quantoComprar(p, comMinimo);
  const Icone = aberto ? ChevronDown : ChevronRight;
  return (
    <tr className="cursor-pointer border-t hover:bg-muted/30" onClick={onToggle}>
      <td className="p-3">
        <Icone className="size-4 text-muted-foreground" />
      </td>
      <td className="p-3 text-muted-foreground tabular-nums">{p.codigo}</td>
      <td className="p-3 font-medium">
        {p.nome}
        {p.servicos > 0 && (
          <span className="block text-xs font-normal text-muted-foreground">
            {p.servicos} {p.servicos === 1 ? "serviço" : "serviços"}
          </span>
        )}
      </td>
      <td className={cn("p-3 text-right tabular-nums", p.saldo < 0 && "text-destructive")}>
        {formatQtd(p.saldo)} {p.unidade}
      </td>
      <td className="p-3 text-right tabular-nums">{formatQtd(p.reservado)}</td>
      <td
        className={cn(
          "p-3 text-right font-medium tabular-nums",
          p.previsto < 0 && "text-destructive",
        )}
      >
        {formatQtd(p.previsto)}
      </td>
      <td className="p-3 text-right tabular-nums">
        {comprar > 0 ? (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
            {formatQtd(comprar)} {p.unidade}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-3">{p.fornecedor ?? "—"}</td>
      {verCusto && <td className="p-3 text-right tabular-nums">{formatCusto(p.ultimoValor)}</td>}
      <td className="p-3 text-muted-foreground">
        {p.ultimoLote ?? "—"}
        {p.ultimaEntrada && (
          <span className="block text-xs">{formatDateOnly(p.ultimaEntrada)}</span>
        )}
      </td>
    </tr>
  );
}

function DemandaDoProduto({ produto }: { produto: PrevisaoEstoque }) {
  const demanda = useDemandaEstoque(produto.id);
  if (demanda.isPending) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (demanda.isError) return <p className="text-sm text-destructive">{demanda.error.message}</p>;
  if (!demanda.data?.length) {
    return (
      <p className="text-sm text-muted-foreground">Nenhum serviço aberto usa este material.</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="p-2 font-medium">Documento</th>
            <th className="p-2 font-medium">Cliente</th>
            <th className="p-2 font-medium">Item</th>
            <th className="p-2 font-medium">Ordem</th>
            <th className="p-2 text-right font-medium">Previsto</th>
            <th className="p-2 text-right font-medium">Baixado</th>
            <th className="p-2 text-right font-medium">Falta tirar</th>
          </tr>
        </thead>
        <tbody>
          {demanda.data.map((d) => (
            <tr key={d.id} className="border-t">
              <td className="p-2">
                <Link
                  to="/comercial/$vendaId"
                  params={{ vendaId: d.vendaId }}
                  className="text-primary hover:underline"
                >
                  {d.vendaTipo === "pedido" ? "Pedido" : "Proposta"} {d.vendaNumero ?? ""}
                </Link>
                <span className="block text-xs text-muted-foreground">{d.vendaStatus}</span>
              </td>
              <td className="p-2">{d.cliente ?? "—"}</td>
              <td className="p-2">{d.itemDescricao}</td>
              <td className="p-2">
                {d.ordemId ? (
                  <Link
                    to="/producao/$ordemId"
                    params={{ ordemId: d.ordemId }}
                    className="text-primary hover:underline"
                  >
                    OP {d.ordemNumero}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="p-2 text-right tabular-nums">
                {formatQtd(d.quantidade)} {d.unidade}
              </td>
              <td className="p-2 text-right tabular-nums">{formatQtd(d.baixado)}</td>
              <td className="p-2 text-right font-medium tabular-nums">{formatQtd(d.pendente)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
