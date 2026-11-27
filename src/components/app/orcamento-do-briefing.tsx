import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Calculator, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser, useDataAction, useOrcamentoDoBriefing } from "@/hooks/use-data";
import { canMontarOrcamento, canVender, orcamentosPERepository, type Briefing } from "@/lib/data";

/**
 * Briefing de orçamento → planilha de Orçamento de Projetos Especiais (migration 0052) in one
 * click, with cliente and informações taken from the briefing. Shows the link once it exists.
 */
export function OrcamentoDoBriefing({ briefing }: { briefing: Briefing }) {
  const me = useCurrentUser().data;
  const existente = useOrcamentoDoBriefing(
    briefing.destino === "projetos_especiais" ? briefing.id : "",
  );
  const run = useDataAction();
  const navigate = useNavigate();
  const [criando, setCriando] = useState(false);

  if (briefing.destino !== "projetos_especiais" || existente.isPending) return null;

  if (existente.data) {
    return (
      <section className="surface-card mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="flex items-center gap-2 text-sm">
          <Calculator className="size-5" />O orçamento deste briefing já está na planilha.
        </p>
        <Button asChild variant="outline">
          <Link to="/orcamentos/$orcamentoId" params={{ orcamentoId: existente.data }}>
            <ExternalLink />
            Abrir orçamento
          </Link>
        </Button>
      </section>
    );
  }
  if (!(canMontarOrcamento(me) || canVender(me))) return null;

  async function criar() {
    setCriando(true);
    const id = await run(
      () => orcamentosPERepository.criar(briefing.id),
      "Orçamento criado com o escopo montado",
    );
    setCriando(false);
    if (id) void navigate({ to: "/orcamentos/$orcamentoId", params: { orcamentoId: id } });
  }

  return (
    <section className="surface-card mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
      <p className="flex items-center gap-2 text-sm">
        <Calculator className="size-5" />
        Levantamento de materiais e precificação na planilha de orçamento (cliente e informações vêm
        deste briefing).
      </p>
      <Button onClick={() => void criar()} disabled={criando}>
        <Calculator />
        Criar orçamento
      </Button>
    </section>
  );
}
