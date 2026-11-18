import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { CiForm } from "@/components/app/ci-form";
import { useCurrentUser, useDataAction, usePaineis } from "@/hooks/use-data";
import { canCriarCi, ciRepository, ciVazia } from "@/lib/data";
import { useNomesCi } from "@/components/app/ci-nomes";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { anexarArquivo } from "@/lib/drive-upload";

export const Route = createFileRoute("/_authenticated/cis/nova")({
  head: () => ({
    meta: [{ title: "Nova CI — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: NovaCiPage,
});

function NovaCiPage() {
  const { data: me, isPending: mePending } = useCurrentUser();
  const { data: snap, isPending } = usePaineis();
  const nomes = useNomesCi();
  const run = useDataAction();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const back = (
    <Button variant="outline" asChild className="mb-6">
      <Link to="/cis">
        <ArrowLeft />
        CIs
      </Link>
    </Button>
  );

  if (isPending || mePending) return <DetailSkeleton />;
  if (!canCriarCi(me)) {
    return (
      <>
        {back}
        <EmptyState
          icon={Lock}
          title="Só o comercial e a gestão criam CIs"
          description="Peça a quem vendeu a vinheta."
        />
      </>
    );
  }

  // Comercial starts with their own first name as representative, like the paper CI.
  const primeiroNome =
    me && !me.isGestor && !me.name.includes("@") ? (me.name.split(" ")[0] ?? "") : "";

  return (
    <div className="max-w-4xl">
      {back}
      <PageHeader
        title="Nova CI de vinheta"
        description="Ao salvar, cada painel marcado fica com a vinheta aguardando entrada e a Criação recebe o aviso."
      />
      <CiForm
        initial={ciVazia(primeiroNome)}
        paineis={snap?.paineis ?? []}
        representantes={nomes.representantes}
        responsaveis={nomes.responsaveis}
        submitLabel="Criar CI"
        onCancel={() => navigate({ to: "/cis" })}
        comArquivo
        onSubmit={async (input, arquivos) => {
          const id = await run(
            () => ciRepository.salvar(null, input),
            "CI criada. A Criação foi avisada.",
          );
          if (!id) return;
          // The vinheta goes to Drive after the CI exists (its folder is named after the CI).
          for (const file of arquivos) {
            const t = toast.loading(`Enviando "${file.name}" para o Drive…`);
            try {
              await anexarArquivo(file, "ci", id);
              toast.success(`"${file.name}" enviado para o Drive.`, { id: t });
            } catch (e) {
              toast.error(
                `A CI foi criada, mas "${file.name}" não subiu: ${e instanceof Error ? e.message : "erro no envio"}. Anexe de novo na CI.`,
                { id: t, duration: 10_000 },
              );
            }
          }
          await queryClient.invalidateQueries({ queryKey: ["anexos", "ci", id] });
          await navigate({ to: "/cis/$ciId", params: { ciId: id } });
        }}
      />
    </div>
  );
}
