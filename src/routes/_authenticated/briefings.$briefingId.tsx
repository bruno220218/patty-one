import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Play, RotateCcw, SearchX, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { BriefingForm } from "@/components/app/briefing-form";
import { BriefingStatusBadge } from "@/components/app/briefing-status";
import { AnexosPanel } from "@/components/app/anexos-panel";
import { OrcamentoDoBriefing } from "@/components/app/orcamento-do-briefing";
import { useBriefing, useCurrentUser, useDataAction, usePessoasDaFuncao } from "@/hooks/use-data";
import {
  BRIEFING_DESTINO_LABEL,
  briefingRepository,
  BRIEFING_ACCEPT,
  BRIEFING_FORMATOS,
  briefingArquivoPermitido,
  canAtenderBriefing,
  canCriarBriefing,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/briefings/$briefingId")({
  head: () => ({
    meta: [{ title: "Briefing — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: BriefingPage,
});

const SEM_RESPONSAVEL = "__ninguem__";

function BriefingPage() {
  const { briefingId } = Route.useParams();
  const { data: b, isPending } = useBriefing(briefingId);
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const atende = canAtenderBriefing(me);
  const { data: pessoas } = usePessoasDaFuncao(
    b ? [b.destino, "gestor"] : [],
    Boolean(b) && atende,
  );

  const back = (
    <Button variant="outline" asChild className="mb-6">
      <Link to="/briefings" search={b ? { destino: b.destino } : {}}>
        <ArrowLeft />
        {b ? `Briefings ${BRIEFING_DESTINO_LABEL[b.destino]}` : "Briefings"}
      </Link>
    </Button>
  );

  if (isPending) return <DetailSkeleton />;
  if (!b) {
    return (
      <>
        {back}
        <EmptyState
          icon={SearchX}
          title="Briefing não encontrado"
          description="Ele pode ter sido excluído."
        />
      </>
    );
  }

  const isGestor = Boolean(me?.isGestor);
  const concluido = b.status === "concluido";
  const podeEditar = canCriarBriefing(me) && (!concluido || isGestor);
  const podeApagar = isGestor || (b.createdBy === me?.id && !concluido);

  return (
    <>
      {back}
      <PageHeader
        title={`Briefing nº ${b.numero}`}
        description={`${b.titulo} · ${BRIEFING_DESTINO_LABEL[b.destino]} · criado por ${b.createdByNome || "alguém"} em ${formatDateTime(b.createdAt)}`}
        action={
          podeApagar ? (
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="h-10 hover:bg-destructive/10 hover:text-destructive"
              aria-label="Excluir briefing"
            >
              <Trash2 />
            </Button>
          ) : undefined
        }
      />

      <OrcamentoDoBriefing briefing={b} />

      <section className="surface-card mb-6 flex flex-col gap-4 p-5 md:flex-row md:items-center">
        <div className="min-w-0 flex-1 space-y-1">
          <BriefingStatusBadge status={b.status} />
          <p className="text-sm text-muted-foreground">
            {b.status === "novo"
              ? `Aguardando alguém da ${BRIEFING_DESTINO_LABEL[b.destino]} assumir.`
              : b.status === "em_andamento"
                ? `Sendo feito por ${b.responsavelNome || "alguém da equipe"}${b.iniciadoEm ? ` desde ${formatDateTime(b.iniciadoEm)}` : ""}.`
                : `Concluído${b.responsavelNome ? ` por ${b.responsavelNome}` : ""}${b.concluidoEm ? ` em ${formatDateTime(b.concluidoEm)}` : ""}.`}
          </p>
        </div>
        {atende && (
          <div className="flex flex-wrap items-center gap-2">
            {!concluido && (
              <Select
                value={b.responsavelId ?? SEM_RESPONSAVEL}
                onValueChange={(v) =>
                  run(
                    () => briefingRepository.setResponsavel(b.id, v === SEM_RESPONSAVEL ? null : v),
                    "Responsável atualizado.",
                  )
                }
              >
                <SelectTrigger className="h-10 w-[13rem]" aria-label="Responsável">
                  <UserRound className="h-4 w-4 opacity-60" />
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
                  {b.responsavelId && !(pessoas ?? []).some((p) => p.id === b.responsavelId) && (
                    <SelectItem value={b.responsavelId}>{b.responsavelNome}</SelectItem>
                  )}
                  {(pessoas ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {b.status === "novo" && (
              <Button
                className="h-10"
                onClick={() =>
                  run(
                    () => briefingRepository.setStatus(b.id, "em_andamento"),
                    "Briefing iniciado. O comercial e a gestão foram avisados.",
                  )
                }
              >
                <Play />
                Iniciar
              </Button>
            )}
            {b.status === "em_andamento" && (
              <Button
                className="h-10"
                onClick={() =>
                  run(() => briefingRepository.setStatus(b.id, "concluido"), "Briefing concluído.")
                }
              >
                <CheckCircle2 />
                Concluir
              </Button>
            )}
            {concluido && (
              <Button
                variant="outline"
                className="h-10"
                onClick={() =>
                  run(
                    () => briefingRepository.setStatus(b.id, "em_andamento"),
                    "Briefing reaberto.",
                  )
                }
              >
                <RotateCcw />
                Reabrir
              </Button>
            )}
          </div>
        )}
      </section>

      <BriefingForm
        key={b.updatedAt}
        initial={b}
        readOnly={!podeEditar}
        saving={saving}
        submitLabel="Salvar briefing"
        onSubmit={async (input) => {
          setSaving(true);
          await run(() => briefingRepository.update(b.id, input), "Briefing salvo.");
          setSaving(false);
        }}
      />

      <AnexosPanel
        entidade="briefing"
        entidadeId={b.id}
        className="mt-6"
        titulo="Arquivos do briefing"
        aviso={`Referências, logos e fotos do cliente (${BRIEFING_FORMATOS}). Vão para o Google Drive da empresa.`}
        accept={BRIEFING_ACCEPT}
        permitido={briefingArquivoPermitido}
        formatos={BRIEFING_FORMATOS}
        rotuloBotao="Enviar arquivo"
      />

      <AnexosPanel
        entidade="briefing_entrega"
        entidadeId={b.id}
        className="mt-4"
        titulo={`Entrega da ${BRIEFING_DESTINO_LABEL[b.destino]}`}
        aviso={`O que foi produzido (${BRIEFING_FORMATOS}). Fica na pasta do briefing › Entrega da criação.`}
        canAdd={atende}
        accept={BRIEFING_ACCEPT}
        permitido={briefingArquivoPermitido}
        formatos={BRIEFING_FORMATOS}
        rotuloBotao="Enviar entrega"
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Excluir o briefing nº ${b.numero}?`}
        description="Ele vai para a Lixeira, onde fica 30 dias."
        onConfirm={async () => {
          setDeleteOpen(false);
          const ok = await run(
            () => briefingRepository.remove(b.id).then(() => true),
            "Briefing excluído.",
          );
          if (ok) void navigate({ to: "/briefings", search: { destino: b.destino } });
        }}
      />
    </>
  );
}
