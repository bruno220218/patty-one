import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, SearchX, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { selectClass } from "@/components/app/operacao-ui";
import { useCurrentUser, useHistoricoComercial } from "@/hooks/use-data";
import { brl, dataBR, VENDAS_POR_PAGINA, type HistoricoFiltros } from "@/lib/data";

type Busca = HistoricoFiltros & { pagina: number };
const TIPOS = ["", "proposta", "contrato", "reserva"] as const;
const NOME_TIPO = { proposta: "Proposta", contrato: "Contrato", reserva: "Reserva" } as const;

export const Route = createFileRoute("/_authenticated/comercial/historico")({
  validateSearch: (s: Record<string, unknown>): Busca => ({
    busca: typeof s["busca"] === "string" ? s["busca"] : "",
    tipo: TIPOS.includes(s["tipo"] as (typeof TIPOS)[number]) ? (s["tipo"] as Busca["tipo"]) : "",
    pagina: Math.max(1, Math.floor(Number(s["pagina"]) || 1)),
  }),
  head: () => ({
    meta: [
      { title: "Histórico comercial SIGE — Patty One" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HistoricoPage,
});

function HistoricoPage() {
  const { pagina, ...filtros } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: me } = useCurrentUser();
  const { data, isPending, error } = useHistoricoComercial(filtros, pagina);

  const [busca, setBusca] = useState(filtros.busca);
  useEffect(() => setBusca(filtros.busca), [filtros.busca]);
  useEffect(() => {
    if (busca === filtros.busca) return;
    const t = setTimeout(() => mudar({ busca }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function mudar(patch: Partial<HistoricoFiltros>) {
    void navigate({ search: (prev) => ({ ...prev, ...patch, pagina: 1 }) });
  }
  const irPara = (p: number) => void navigate({ search: (prev) => ({ ...prev, pagina: p }) });
  const total = data?.total ?? 0;
  const linhas = data?.linhas ?? [];
  const paginas = Math.max(1, Math.ceil(total / VENDAS_POR_PAGINA));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Voltar a propostas e pedidos">
            <Link to="/comercial" search={{ tipo: "proposta", busca: "", status: "", pagina: 1 }}>
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Histórico comercial SIGE
            </h1>
            <p className="text-sm text-muted-foreground">
              Propostas, contratos e reservas originais do SIGE (somente leitura).
            </p>
          </div>
        </div>
        {me?.isGestor && (
          <Button asChild variant="outline">
            <Link to="/importar-historico">
              <Upload />
              Importar do SIGE
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          aria-label="Buscar no histórico"
          placeholder="Cliente, número, contrato ou vendedor…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-10 sm:col-span-2"
        />
        <select
          aria-label="Tipo de documento"
          className={selectClass}
          value={filtros.tipo}
          onChange={(e) => mudar({ tipo: e.target.value as HistoricoFiltros["tipo"] })}
        >
          <option value="">Todos os documentos</option>
          <option value="proposta">Propostas</option>
          <option value="contrato">Contratos</option>
          <option value="reserva">Reservas</option>
        </select>
      </div>
      <p className="text-sm text-muted-foreground">{total.toLocaleString("pt-BR")} registros</p>

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState
          icon={SearchX}
          title="Não foi possível abrir o histórico"
          description={error.message}
        />
      ) : linhas.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum registro encontrado"
          description="Mude a busca ou o filtro."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                {["Nº SIGE", "Tipo", "Cliente", "Empresa", "Data", "Vendedor", "Situação SIGE"].map(
                  (h) => (
                    <th className="p-3 font-medium whitespace-nowrap" key={h}>
                      {h}
                    </th>
                  ),
                )}
                <th className="p-3 text-right font-medium">Valor</th>
                <th className="p-3 text-right font-medium whitespace-nowrap">Valor líquido</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => (
                <tr className="border-t align-top hover:bg-muted/40" key={r.id}>
                  <td className="p-3 font-medium">
                    {r.numeroSige}
                    {r.contratoSige && (
                      <p className="text-xs whitespace-nowrap text-muted-foreground">
                        Contrato {r.contratoSige}
                      </p>
                    )}
                    {r.propostaNumeroSige && (
                      <p className="text-xs whitespace-nowrap text-muted-foreground">
                        Proposta {r.propostaNumeroSige}
                      </p>
                    )}
                    {r.tipo === "proposta" && r.autorizacaoSige && (
                      <p className="text-xs whitespace-nowrap text-muted-foreground">
                        Autorização {r.autorizacaoSige}
                      </p>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline">{NOME_TIPO[r.tipo]}</Badge>
                  </td>
                  <td className="min-w-44 p-3">
                    {r.cadastroId ? (
                      <Link
                        to="/cadastros/$cadastroId"
                        params={{ cadastroId: r.cadastroId }}
                        className="hover:underline"
                      >
                        {r.clienteNome}
                      </Link>
                    ) : (
                      <>
                        {r.clienteNome}
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Sem vínculo com cadastro
                        </p>
                      </>
                    )}
                    {r.tipoServico && (
                      <p className="text-xs text-muted-foreground">{r.tipoServico}</p>
                    )}
                  </td>
                  <td className="min-w-36 p-3 text-muted-foreground">
                    {r.empresaNome ?? "Não informada"}
                    {r.empresaOrigem === "proposta" && (
                      <p className="text-xs">Da proposta vinculada</p>
                    )}
                    {r.empresaNome && !r.empresaId && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Sem vínculo com empresa do grupo
                      </p>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">{dataBR(r.dataDocumento)}</td>
                  <td className="p-3">{r.vendedor ?? "—"}</td>
                  <td className="p-3">{r.statusSige}</td>
                  <td className="p-3 text-right font-medium whitespace-nowrap">{brl(r.valor)}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {r.valorLiquido === null ? "—" : brl(r.valorLiquido)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-end gap-3">
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
    </div>
  );
}
