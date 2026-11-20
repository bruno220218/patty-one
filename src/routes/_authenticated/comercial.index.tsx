import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Plus,
  SearchX,
  ShoppingCart,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { selectClass } from "@/components/app/operacao-ui";
import { VendaStatusBadge } from "@/components/app/venda-status";
import { useCurrentUser, useVendas } from "@/hooks/use-data";
import {
  brl,
  canVender,
  dataBR,
  STATUS_VENDA,
  VENDAS_POR_PAGINA,
  type TipoVenda,
  type VendaFiltros,
} from "@/lib/data";
import { cn } from "@/lib/utils";

type Busca = VendaFiltros & { pagina: number };
const texto = (v: unknown) => (typeof v === "string" ? v : "");

export const Route = createFileRoute("/_authenticated/comercial/")({
  // Filters live in the address, so a filtered list can be shared or reopened.
  validateSearch: (s: Record<string, unknown>): Busca => ({
    tipo: s["tipo"] === "pedido" ? "pedido" : "proposta",
    busca: texto(s["busca"]),
    status: texto(s["status"]),
    pagina: Math.max(1, Math.floor(Number(s["pagina"]) || 1)),
  }),
  head: () => ({
    meta: [{ title: "Propostas e pedidos — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: ComercialPage,
});

function ComercialPage() {
  const { pagina, ...filtros } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: me } = useCurrentUser();
  const podeVender = canVender(me);
  const { data, isPending, error } = useVendas(filtros, pagina);
  const proposta = filtros.tipo === "proposta";

  // Typing waits a moment before searching, so the database isn't asked on every key.
  const [busca, setBusca] = useState(filtros.busca);
  useEffect(() => setBusca(filtros.busca), [filtros.busca]);
  useEffect(() => {
    if (busca === filtros.busca) return;
    const t = setTimeout(() => mudar({ busca }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function mudar(patch: Partial<VendaFiltros>) {
    void navigate({ search: (prev) => ({ ...prev, ...patch, pagina: 1 }) });
  }
  const irPara = (p: number) => void navigate({ search: (prev) => ({ ...prev, pagina: p }) });

  const total = data?.total ?? 0;
  const linhas = data?.linhas ?? [];
  const paginas = Math.max(1, Math.ceil(total / VENDAS_POR_PAGINA));

  return (
    <>
      <PageHeader
        title="Propostas e pedidos"
        description="Propostas comerciais e pedidos de venda das empresas do grupo."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-10">
              <Link to="/comercial/historico" search={{ busca: "", tipo: "", pagina: 1 }}>
                <History />
                Histórico SIGE
              </Link>
            </Button>
            {podeVender && (
              <>
                <Button asChild variant="outline" className="h-10">
                  <Link to="/comercial/$vendaId" params={{ vendaId: "novo-pedido" }}>
                    <ShoppingCart />
                    Novo pedido
                  </Link>
                </Button>
                <Button asChild className="h-10">
                  <Link to="/comercial/$vendaId" params={{ vendaId: "nova-proposta" }}>
                    <Plus />
                    Nova proposta
                  </Link>
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="mb-4 inline-flex rounded-lg border bg-card p-1" role="tablist">
        {(["proposta", "pedido"] as TipoVenda[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={filtros.tipo === t}
            onClick={() => mudar({ tipo: t, status: "" })}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition",
              filtros.tipo === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "proposta" ? "Propostas" : "Pedidos"}
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input
          aria-label="Buscar"
          placeholder="Buscar por cliente ou número…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-10 sm:col-span-2"
        />
        <select
          aria-label="Filtrar situação"
          className={selectClass}
          value={filtros.status}
          onChange={(e) => mudar({ status: e.target.value })}
        >
          <option value="">Todas as situações</option>
          {STATUS_VENDA[filtros.tipo].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {total.toLocaleString("pt-BR")} {proposta ? "propostas" : "pedidos"}
      </p>

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState
          icon={SearchX}
          title="Não foi possível abrir a lista"
          description={error.message}
        />
      ) : linhas.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={proposta ? "Nenhuma proposta encontrada" : "Nenhum pedido encontrado"}
          description="Mude a busca ou os filtros."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                {[
                  "Nº",
                  "Cliente",
                  "Empresa",
                  "Vendedor",
                  proposta ? "Validade" : "Data",
                  "Situação",
                ].map((h) => (
                  <th key={h} className="p-3 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
                <th className="p-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">
                    <Link
                      to="/comercial/$vendaId"
                      params={{ vendaId: r.id }}
                      className="text-primary hover:underline"
                    >
                      {r.numero}
                    </Link>
                  </td>
                  <td className="min-w-48 p-3">
                    <Link
                      to="/comercial/$vendaId"
                      params={{ vendaId: r.id }}
                      className="hover:underline"
                    >
                      {r.clienteNome}
                    </Link>
                    {r.daProposta && (
                      <Badge variant="outline" className="ml-2">
                        da proposta
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{r.empresaNome}</td>
                  <td className="p-3">{r.vendedor || "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    {dataBR(proposta ? r.validade : r.createdAt) || "—"}
                  </td>
                  <td className="p-3">
                    <VendaStatusBadge status={r.status} />
                  </td>
                  <td className="p-3 text-right font-medium whitespace-nowrap">{brl(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <Button
            size="icon"
            variant="outline"
            aria-label="Página anterior"
            disabled={pagina <= 1}
            onClick={() => irPara(pagina - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm">
            Página {pagina} de {paginas}
          </span>
          <Button
            size="icon"
            variant="outline"
            aria-label="Próxima página"
            disabled={pagina >= paginas}
            onClick={() => irPara(pagina + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </>
  );
}
