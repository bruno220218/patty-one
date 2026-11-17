import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { BriefingForm } from "@/components/app/briefing-form";
import { useCurrentUser, useDataAction } from "@/hooks/use-data";
import { BRIEFING_VAZIO, briefingRepository, canCriarBriefing } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/briefings/novo")({
  head: () => ({
    meta: [{ title: "Novo briefing — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: NovoBriefingPage,
});

function NovoBriefingPage() {
  const { data: me, isPending } = useCurrentUser();
  const run = useDataAction();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const back = (
    <Button variant="outline" asChild className="mb-6">
      <Link to="/briefings">
        <ArrowLeft />
        Briefings
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
        title="Novo briefing"
        description="Depois de salvar, anexe referências, logos, fotos e áudios."
      />
      <BriefingForm
        initial={{ ...BRIEFING_VAZIO, vendedor: me?.name ?? "" }}
        readOnly={false}
        saving={saving}
        submitLabel="Criar briefing"
        onSubmit={async (input) => {
          setSaving(true);
          const created = await run(
            () => briefingRepository.create(input),
            "Briefing criado e enviado para a equipe.",
          );
          setSaving(false);
          if (created) {
            void navigate({ to: "/briefings/$briefingId", params: { briefingId: created.id } });
          }
        }}
      />
    </>
  );
}
