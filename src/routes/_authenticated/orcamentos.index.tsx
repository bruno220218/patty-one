import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Calculator, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import {
  useCurrentUser,
  useDataAction,
  useOrcamentoConfig,
  useOrcamentosPE,
} from "@/hooks/use-data";
import {
  brl,
  canMontarOrcamento,
  canVender,
  CLASSE_SITUACAO_ORCAMENTO,
  CONFIG_PADRAO,
  NOME_SITUACAO_ORCAMENTO,
  orcamentosPERepository,
  rotuloOrcamento,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Orçamentos de Projetos Especiais (migration 0052): list + one click to start a new sheet. */
export const Route = createFileRoute("/_authenticated/orcamentos/")({
  head: () => ({
    meta: [{ title: "Orçamentos — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: OrcamentosPage,
});

function OrcamentosPage() {
  const me = useCurrentUser().data;
  const lista = useOrcamentosPE();
  const fator = (useOrcamentoConfig().data ?? CONFIG_PADRAO).fatorVenda;
  const run = useDataAction();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const podeCriar = canMontarOrcamento(me) || canVender(me);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (lista.data ?? []).filter(
      (o) =>
        !t ||
        `${o.cliente} ${o.informacoes} ${o.responsavel} ${rotuloOrcamento(o)}`
          .toLowerCase()
          .includes(t),
    );
  }, [lista.data, busca]);

  async function novo() {
    setCriando(true);
    const id = await run(
      () => orcamentosPERepository.criar(),
      "Orçamento criado com o escopo montado",
    );
    setCriando(false);
    if (id) void navigate({ to: "/orcamentos/$orcamentoId", params: { orcamentoId: id } });
  }

  return (
    <>
      <PageHeader
        title="Orçamentos de Projetos Especiais"
        description="A planilha de orçamento: escopo já montado por camadas (painel, estrutura, letreiro, pintura, iluminação, mão de obra). Quem orça só preenche as quantidades."
        action={
          podeCriar &&
          lista.data && (
            <Button onClick={() => void novo()} disabled={criando}>
              <Plus />
              Novo orçamento
            </Button>
          )
        }
      />
      {lista.isPending ? (
        <CardGridSkeleton />
      ) : lista.isError ? (
        <p className="text-sm text-destructive">{lista.error.message}</p>
      ) : lista.data === null ? (
        <EmptyState
          icon={Calculator}
          title="Ainda não está ligado"
          description="Rode a migration 0052 no Supabase."
        />
      ) : (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar orçamento"
              placeholder="Buscar por cliente, informação ou responsável…"
              className="pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          {filtrados.length === 0 ? (
            <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              {lista.data.length === 0 ? "Nenhum orçamento ainda." : "Nada com essa busca."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Orçamento</th>
                    <th className="p-3 font-medium">Cliente</th>
                    <th className="p-3 font-medium">Situação</th>
                    <th className="p-3 text-right font-medium">Custo</th>
                    <th className="p-3 text-right font-medium">Preço de venda</th>
                    <th className="p-3 font-medium">Responsável</th>
                    <th className="p-3 font-medium">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((o) => (
                    <tr key={o.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-semibold whitespace-nowrap">
                        <Link
                          to="/orcamentos/$orcamentoId"
                          params={{ orcamentoId: o.id }}
                          className="hover:underline"
                        >
                          {rotuloOrcamento(o)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            {o.ano}
                          </span>
                        </Link>
                      </td>
                      <td className="p-3">
                        {o.cliente || <span className="text-muted-foreground">sem cliente</span>}
                        {o.informacoes && (
                          <span className="block max-w-xs truncate text-xs text-muted-foreground">
                            {o.informacoes}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                            CLASSE_SITUACAO_ORCAMENTO[o.situacao],
                          )}
                        >
                          {NOME_SITUACAO_ORCAMENTO[o.situacao]}
                          {o.revisao > 0 && ` · R${o.revisao}`}
                        </span>
                      </td>
                      <td className="p-3 text-right tabular-nums">{brl(o.custo)}</td>
                      <td className="p-3 text-right font-medium tabular-nums">
                        {brl(fator > 0 ? o.custo / fator : 0)}
                      </td>
                      <td className="p-3">{o.responsavel || "—"}</td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {formatDateTime(o.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
