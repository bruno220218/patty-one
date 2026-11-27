import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { OrcamentoPlanilha } from "@/components/app/orcamento-planilha";
import { useOrcamentoConfig, useOrcamentoPE, useProdutosEstoque } from "@/hooks/use-data";
import { CONFIG_PADRAO } from "@/lib/data";

/** One Orçamento de Projetos Especiais as the spreadsheet (migration 0052). */
export const Route = createFileRoute("/_authenticated/orcamentos/$orcamentoId")({
  head: () => ({
    meta: [{ title: "Orçamento — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: OrcamentoPage,
});

function OrcamentoPage() {
  const { orcamentoId } = Route.useParams();
  const orc = useOrcamentoPE(orcamentoId);
  const produtos = useProdutosEstoque();
  const config = useOrcamentoConfig().data ?? CONFIG_PADRAO;

  const voltar = (
    <Button variant="ghost" size="sm" asChild className="mb-3">
      <Link to="/orcamentos">
        <ArrowLeft />
        Orçamentos
      </Link>
    </Button>
  );
  if (orc.isPending || produtos.isPending) return <CardGridSkeleton />;
  if (orc.isError || !orc.data) {
    return (
      <>
        {voltar}
        <EmptyState
          icon={Calculator}
          title="Orçamento não encontrado"
          description={
            orc.error?.message ?? "Ele pode ter sido excluído, ou a migration 0052 não foi rodada."
          }
        />
      </>
    );
  }
  return (
    <>
      {voltar}
      <OrcamentoPlanilha
        key={orc.data.orcamento.updatedAt}
        orcamento={orc.data.orcamento}
        linhas={orc.data.linhas}
        produtos={produtos.data ?? []}
        config={config}
      />
    </>
  );
}
