import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { BriefingForm } from "@/components/app/briefing-form";
import { useCurrentUser, useDataAction } from "@/hooks/use-data";
import {
  BRIEFING_ACCEPT,
  BRIEFING_DESTINO_LABEL,
  BRIEFING_FORMATOS,
  BRIEFING_VAZIO,
  briefingArquivoPermitido,
  briefingRepository,
  canCriarBriefing,
  type BriefingDestino,
} from "@/lib/data";
import { ArquivosPicker } from "@/components/app/arquivos-picker";
import { anexarArquivo } from "@/lib/drive-upload";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/briefings/novo")({
  // ?destino=criacao|projetos_especiais: each menu entry creates only its own kind (default: criacao).
  validateSearch: (search: Record<string, unknown>): { destino: BriefingDestino } => ({
    destino: search["destino"] === "projetos_especiais" ? "projetos_especiais" : "criacao",
  }),
  head: () => ({
    meta: [{ title: "Novo briefing — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: NovoBriefingPage,
});

function NovoBriefingPage() {
  const { destino } = Route.useSearch();
  const { data: me, isPending } = useCurrentUser();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const queryClient = useQueryClient();
  const run = useDataAction();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const back = (
    <Button variant="outline" asChild className="mb-6">
      <Link to="/briefings" search={{ destino }}>
        <ArrowLeft />
        Briefings {BRIEFING_DESTINO_LABEL[destino]}
      </Link>
    </Button>
  );

  if (isPending) return <DetailSkeleton />;
  if (!canCriarBriefing(me)) {
    return (
      <>
        {back}
        <EmptyState
          icon={Lock}
          title="Somente comercial ou gestão"
          description="Peça para o comercial criar o briefing."
        />
      </>
    );
  }

  return (
    <>
      {back}
      <PageHeader
        title={`Novo briefing — ${BRIEFING_DESTINO_LABEL[destino]}`}
        description="Os arquivos escolhidos vão para o Google Drive assim que o briefing for criado."
      />
      <ArquivosPicker
        id="briefing-arquivos"
        titulo="Arquivos do briefing"
        descricao={`Referências, logos e fotos do cliente (${BRIEFING_FORMATOS}).`}
        accept={BRIEFING_ACCEPT}
        permitido={briefingArquivoPermitido}
        formatos={BRIEFING_FORMATOS}
        arquivos={arquivos}
        onChange={setArquivos}
      />
      <div className="h-6" />
      <BriefingForm
        initial={{ ...BRIEFING_VAZIO, destino, vendedor: me?.name ?? "" }}
        readOnly={false}
        saving={saving}
        submitLabel="Criar briefing"
        onSubmit={async (input) => {
          setSaving(true);
          const created = await run(
            () => briefingRepository.create(input),
            "Briefing criado e enviado para a equipe.",
          );
          if (created) {
            // Files go to Drive after the briefing exists (its folder is named after it).
            for (const file of arquivos) {
              const t = toast.loading(`Enviando "${file.name}" para o Drive…`);
              try {
                await anexarArquivo(file, "briefing", created.id);
                toast.success(`"${file.name}" enviado para o Drive.`, { id: t });
              } catch (e) {
                toast.error(
                  `O briefing foi criado, mas "${file.name}" não subiu: ${e instanceof Error ? e.message : "erro no envio"}. Anexe de novo no briefing.`,
                  { id: t, duration: 10_000 },
                );
              }
            }
            await queryClient.invalidateQueries({ queryKey: ["anexos", "briefing", created.id] });
          }
          setSaving(false);
          if (created) {
            void navigate({ to: "/briefings/$briefingId", params: { briefingId: created.id } });
          }
        }}
      />
    </>
  );
}
