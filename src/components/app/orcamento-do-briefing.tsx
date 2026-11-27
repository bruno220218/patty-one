import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Calculator, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ClientePicker, selectClass } from "@/components/app/operacao-ui";
import { useCurrentUser, useDataAction, useEmpresas } from "@/hooks/use-data";
import { fluxoOrcamentoRepository, type Briefing } from "@/lib/data";

const PODE_CRIAR = ["gestor", "direcao", "comercial", "projetos_especiais"];

/**
 * Briefing de orçamento → proposta "Com Projetos" (migration 0051, fluxo do orçamento): the first
 * box of the flowchart after the briefing. Shows the link once the proposta exists.
 */
export function OrcamentoDoBriefing({ briefing }: { briefing: Briefing }) {
  const me = useCurrentUser().data;
  const empresas = useEmpresas();
  const run = useDataAction();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);
  const [empresaId, setEmpresaId] = useState("");
  const [criando, setCriando] = useState(false);

  if (briefing.destino !== "projetos_especiais") return null;

  if (briefing.vendaId) {
    return (
      <section className="surface-card mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="flex items-center gap-2 text-sm">
          <Calculator className="size-5 text-primary" />O orçamento deste briefing está na proposta:
          materiais, composição de custo e aprovação da Gestão.
        </p>
        <Button asChild variant="outline">
          <Link to="/comercial/$vendaId" params={{ vendaId: briefing.vendaId }}>
            <ExternalLink />
            Abrir orçamento
          </Link>
        </Button>
      </section>
    );
  }

  if (!me?.funcoes.some((f) => PODE_CRIAR.includes(f))) return null;

  async function criar() {
    if (!cliente || !empresaId) return;
    setCriando(true);
    const id = await run(
      () => fluxoOrcamentoRepository.criarDoBriefing(briefing.id, cliente.id, empresaId),
      "Orçamento criado: monte os itens e a composição",
    );
    setCriando(false);
    if (id) void navigate({ to: "/comercial/$vendaId", params: { vendaId: id } });
  }

  return (
    <section className="surface-card mb-6 space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm">
          <Calculator className="size-5 text-primary" />
          Levantamento de materiais e precificação: crie o orçamento (vira uma proposta com
          Projetos, que depois vai para a Gestão fechar).
        </p>
        {!aberto && (
          <Button onClick={() => setAberto(true)}>
            <Calculator />
            Criar orçamento
          </Button>
        )}
      </div>
      {aberto && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              Cliente (cadastro){briefing.cliente && ` · no briefing: ${briefing.cliente}`}
            </Label>
            <ClientePicker value={cliente} onChange={setCliente} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orc-empresa">Empresa do grupo</Label>
            <select
              id="orc-empresa"
              className={selectClass}
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
            >
              <option value="">Escolha…</option>
              {(empresas.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={criando}>
              Cancelar
            </Button>
            <Button onClick={() => void criar()} disabled={criando || !cliente || !empresaId}>
              Criar orçamento
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
