import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileDown, SearchX, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { LiberacaoEditor } from "@/components/app/liberacao-editor";
import { AprovarDialog, ReprovarDialog } from "@/components/app/liberacao-decisao";
import { LiberacaoHistorico, LiberacaoStatusPanel } from "@/components/app/liberacao-status";
import {
  useCurrentUser,
  useDataAction,
  useListasLiberacao,
  useLiberacao,
  useLiberacaoEventos,
  useLiberacoes,
} from "@/hooks/use-data";
import {
  canAprovarLiberacoes,
  canEditLiberacoes,
  filaPcp,
  LIBERACAO_MODELO_LABEL,
  liberacaoRepository,
  projectRepository,
} from "@/lib/data";
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
  const { data: todas } = useLiberacoes();
  const { data: eventos } = useLiberacaoEventos(liberacaoId);
  const { data: me } = useCurrentUser();
  const canEdit = canEditLiberacoes(me);
  const canAprovar = canAprovarLiberacoes(me);
  const isGestor = Boolean(me?.isGestor);
  const run = useDataAction();
  const { listas } = useListasLiberacao();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [aprovarOpen, setAprovarOpen] = useState(false);
  const [reprovarOpen, setReprovarOpen] = useState(false);

  const fila = useMemo(() => filaPcp(todas ?? []), [todas]);
  const posicao = fila.findIndex((l) => l.id === liberacaoId) + 1;

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

  const aprovada = lib.status === "aprovada";
  const readOnly = !canEdit || (aprovada && !isGestor);
  const canDelete = canEdit && (!aprovada || isGestor);

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
        description={`${lib.cliente} · modelo ${LIBERACAO_MODELO_LABEL[lib.modelo]} · atualizada em ${formatDateTime(lib.updatedAt)}${readOnly ? " · somente leitura" : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={pdf} className="h-10">
              <FileDown />
              Baixar PDF
            </Button>
            {canDelete && (
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

      <LiberacaoStatusPanel
        liberacao={lib}
        posicao={posicao > 0 ? posicao : undefined}
        filaTotal={fila.length}
        canAprovar={canAprovar}
        canEdit={canEdit}
        onAprovar={() => setAprovarOpen(true)}
        onReprovar={() => setReprovarOpen(true)}
      />

      <LiberacaoEditor
        listas={listas}
        key={lib.updatedAt}
        initial={lib}
        readOnly={readOnly}
        saving={saving}
        submitLabel={
          lib.status === "reprovada" ? "Salvar e reenviar para o PCP" : "Salvar liberação"
        }
        onSubmit={async (input) => {
          setSaving(true);
          await run(
            () => liberacaoRepository.update(lib.id, input),
            lib.status === "reprovada"
              ? "Liberação reenviada. Ela entrou no fim da fila do PCP."
              : "Liberação salva.",
          );
          setSaving(false);
        }}
      />

      <LiberacaoHistorico eventos={eventos} />

      <AprovarDialog
        open={aprovarOpen}
        onOpenChange={setAprovarOpen}
        liberacao={lib}
        onConfirm={(input) =>
          run(async () => {
            const project = await projectRepository.create(input);
            try {
              await liberacaoRepository.aprovar(lib.id, project.id);
            } catch (error) {
              // Don't leave an orphan project if the approval didn't go through.
              await projectRepository.remove(project.id).catch(() => undefined);
              throw error;
            }
            return project;
          }, "Liberação aprovada e projeto criado em Projetos.")
        }
      />
      <ReprovarDialog
        open={reprovarOpen}
        onOpenChange={setReprovarOpen}
        numero={lib.numero}
        onConfirm={(motivo) =>
          run(
            () => liberacaoRepository.reprovar(lib.id, motivo).then(() => true),
            "Liberação reprovada e devolvida ao comercial.",
          )
        }
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Excluir a liberação nº ${lib.numero}?`}
        description={`A liberação de "${lib.cliente}", os itens e o histórico vão para a Lixeira, onde ficam 30 dias.`}
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
