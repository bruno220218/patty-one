import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileDown, SearchX, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { LiberacaoEditor } from "@/components/app/liberacao-editor";
import { useCurrentUser, useDataAction, useLiberacao } from "@/hooks/use-data";
import { canEditLiberacoes, LIBERACAO_MODELO_LABEL, liberacaoRepository } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { downloadLiberacaoPdf } from "@/lib/liberacao-pdf";

export const Route = createFileRoute("/_authenticated/liberacoes/$liberacaoId")({
  head: () => ({
    meta: [{ title: "Liberação — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: LiberacaoPage,
});

function LiberacaoPage() {
  const { liberacaoId } = Route.useParams();
  const { data: lib, isPending } = useLiberacao(liberacaoId);
  const { data: me } = useCurrentUser();
  const canEdit = canEditLiberacoes(me);
  const run = useDataAction();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const back = (
    <Button variant="outline" asChild className="mb-6">
      <Link to="/liberacoes">
        <ArrowLeft />
        Liberações
      </Link>
    </Button>
  );

  if (isPending) return <DetailSkeleton />;
  if (!lib) {
    return (
      <>
        {back}
        <EmptyState
          icon={SearchX}
          title="Liberação não encontrada"
          description="Ela pode ter sido excluída."
        />
      </>
    );
  }

  const pdf = async () => {
    try {
      await downloadLiberacaoPdf(lib, "/patty-logo.png");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o PDF.");
    }
  };

  return (
    <>
      {back}
      <PageHeader
        title={`Liberação nº ${lib.numero}`}
        description={`${lib.cliente} · modelo ${LIBERACAO_MODELO_LABEL[lib.modelo]} · atualizada em ${formatDateTime(lib.updatedAt)}${canEdit ? "" : " · somente leitura"}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={pdf} className="h-10">
              <FileDown />
              Baixar PDF
            </Button>
            {canEdit && (
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                className="h-10 hover:bg-destructive/10 hover:text-destructive"
                aria-label="Excluir liberação"
              >
                <Trash2 />
              </Button>
            )}
          </div>
        }
      />
      <LiberacaoEditor
        key={lib.updatedAt}
        initial={lib}
        readOnly={!canEdit}
        saving={saving}
        onSubmit={async (input) => {
          setSaving(true);
          await run(() => liberacaoRepository.update(lib.id, input), "Liberação salva.");
          setSaving(false);
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Excluir a liberação nº ${lib.numero}?`}
        description={`A liberação de "${lib.cliente}" e todos os itens serão excluídos permanentemente.`}
        onConfirm={async () => {
          setDeleteOpen(false);
          const ok = await run(
            () => liberacaoRepository.remove(lib.id).then(() => true),
            "Liberação excluída.",
          );
          if (ok) navigate({ to: "/liberacoes" });
        }}
      />
    </>
  );
}
