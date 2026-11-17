import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { OpcoesListCard } from "@/components/app/opcoes-list-card";
import { useDataAction, useListasLiberacao } from "@/hooks/use-data";
import {
  LIBERACAO_MODELO_INFO,
  liberacaoOpcoesRepository,
  type LiberacaoOpcao,
  type OpcaoCampo,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/_gestor/listas")({
  head: () => ({
    meta: [{ title: "Listas da liberação — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: ListasPage,
});

type Grupo = { modelo: LiberacaoOpcao["modelo"]; campo: OpcaoCampo; titulo: string };

const GRUPOS: Record<"projeto" | "midia" | "pessoas", Grupo[]> = {
  projeto: [
    { modelo: "projeto", campo: "servico", titulo: "Serviço" },
    { modelo: "projeto", campo: "insumos", titulo: LIBERACAO_MODELO_INFO.projeto.insumos },
    { modelo: "projeto", campo: "acabamento", titulo: "Acabamento" },
    { modelo: "projeto", campo: "instalacao", titulo: "Instalação" },
  ],
  midia: [
    { modelo: "midia", campo: "servico", titulo: "Serviço" },
    { modelo: "midia", campo: "insumos", titulo: LIBERACAO_MODELO_INFO.midia.insumos },
    { modelo: "midia", campo: "acabamento", titulo: "Acabamento" },
    { modelo: "midia", campo: "instalacao", titulo: "Instalação" },
  ],
  pessoas: [
    { modelo: "todos", campo: "projetista", titulo: "Projetistas / layoutistas" },
    { modelo: "todos", campo: "vendedor", titulo: "Vendedores" },
  ],
};

function ListasPage() {
  const { data: opcoes, isPending } = useListasLiberacao();
  const run = useDataAction();
  const [removing, setRemoving] = useState<LiberacaoOpcao | null>(null);
  const ativo = opcoes !== null && opcoes !== undefined;

  const of = (g: Grupo) =>
    (opcoes ?? [])
      .filter((o) => o.modelo === g.modelo && o.campo === g.campo)
      .sort((a, b) => a.position - b.position);

  const card = (g: Grupo) => (
    <OpcoesListCard
      key={`${g.modelo}-${g.campo}`}
      titulo={g.titulo}
      opcoes={of(g)}
      disabled={!ativo}
      onAdd={(valor) =>
        run(
          () => liberacaoOpcoesRepository.add(g.modelo, g.campo, valor).then(() => true),
          `"${valor.trim()}" adicionado em ${g.titulo}.`,
        )
      }
      onRename={(id, valor) =>
        run(() => liberacaoOpcoesRepository.rename(id, valor).then(() => true), "Opção renomeada.")
      }
      onReorder={(ids) => run(() => liberacaoOpcoesRepository.reorder(ids).then(() => true))}
      onRemove={setRemoving}
    />
  );

  return (
    <>
      <Button variant="outline" asChild className="mb-6">
        <Link to="/liberacoes">
          <ArrowLeft />
          Liberações
        </Link>
      </Button>
      <PageHeader
        title="Listas da liberação"
        description="Opções sugeridas nos campos do formulário. Mudanças valem para as próximas liberações; o que já foi preenchido não muda."
      />

      {!isPending && !ativo && (
        <p className="surface-card mb-4 flex items-start gap-2 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          As listas editáveis ainda não foram ativadas no banco. Enquanto isso, o formulário usa as
          listas padrão das planilhas.
        </p>
      )}

      {isPending ? (
        <CardGridSkeleton />
      ) : (
        <Tabs defaultValue="projeto">
          <TabsList className="mb-4">
            <TabsTrigger value="projeto">Projetos</TabsTrigger>
            <TabsTrigger value="midia">Mídia</TabsTrigger>
            <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
          </TabsList>
          {(["projeto", "midia", "pessoas"] as const).map((aba) => (
            <TabsContent key={aba} value={aba}>
              <div className="grid gap-4 md:grid-cols-2">{GRUPOS[aba].map(card)}</div>
            </TabsContent>
          ))}
        </Tabs>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remover "${removing?.valor ?? ""}"?`}
        description="A opção deixa de ser sugerida no formulário. Liberações que já usam esse texto continuam iguais."
        confirmLabel="Remover"
        onConfirm={async () => {
          const target = removing;
          setRemoving(null);
          if (target) {
            await run(() => liberacaoOpcoesRepository.remove(target.id), "Opção removida.");
          }
        }}
      />
    </>
  );
}
