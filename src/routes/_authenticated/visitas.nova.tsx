import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { VisitaForm } from "@/components/app/visita-form";
import { useCurrentUser, useDataAction } from "@/hooks/use-data";
import { canSolicitarVisita, SOLICITACAO_VAZIA, visitaRepository } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/visitas/nova")({
  head: () => ({
    meta: [{ title: "Solicitar visita — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: NovaVisitaPage,
});

function NovaVisitaPage() {
  const { data: me, isPending } = useCurrentUser();
  const run = useDataAction();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const back = (
    <Button variant="outline" asChild className="mb-6">
      <Link to="/visitas">
        <ArrowLeft />
        Visitas técnicas
      </Link>
    </Button>
  );

  if (isPending) return <DetailSkeleton />;
  if (!canSolicitarVisita(me)) {
    return (
      <>
        {back}
        <EmptyState
          icon={Lock}
          title="Somente comercial ou gestão"
          description="Peça para o comercial solicitar a visita."
        />
      </>
    );
  }

  return (
    <>
      {back}
      <PageHeader
        title="Solicitar visita técnica"
        description="O PCP recebe o pedido e agenda a data e quem vai fazer a visita."
      />
      <VisitaForm
        initial={{ ...SOLICITACAO_VAZIA, vendedor: me?.name ?? "" }}
        readOnly={false}
        saving={saving}
        submitLabel="Enviar para o PCP"
        onSubmit={async (s) => {
          setSaving(true);
          const created = await run(
            () => visitaRepository.create(s),
            "Visita solicitada. O PCP foi avisado.",
          );
          setSaving(false);
          if (created)
            void navigate({ to: "/visitas/$visitaId", params: { visitaId: created.id } });
        }}
      />
    </>
  );
}
