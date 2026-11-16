import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { LiberacaoEditor } from "@/components/app/liberacao-editor";
import { useCurrentUser, useDataAction } from "@/hooks/use-data";
import {
  canEditLiberacoes,
  LIBERACAO_MODELO_LABEL,
  liberacaoRepository,
  localToday,
  type LiberacaoInput,
  type LiberacaoModelo,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/liberacoes/nova")({
  validateSearch: (search: Record<string, unknown>): { modelo: LiberacaoModelo } => ({
    modelo: search["modelo"] === "midia" ? "midia" : "projeto",
  }),
  head: () => ({
    meta: [{ title: "Nova liberação — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: NovaLiberacaoPage,
});

function NovaLiberacaoPage() {
  const { modelo } = Route.useSearch();
  const { data: me, isPending } = useCurrentUser();
  const run = useDataAction();
  const navigate = useNavigate();
  const [numero, setNumero] = useState<number | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    liberacaoRepository
      .nextNumero()
      .then((n) => alive && setNumero(n))
      .catch(() => alive && setNumero(null));
    return () => {
      alive = false;
    };
  }, []);

  const back = (
    <Button variant="outline" asChild className="mb-6">
      <Link to="/liberacoes">
        <ArrowLeft />
        Liberações
      </Link>
    </Button>
  );

  if (isPending || numero === undefined) return <DetailSkeleton />;
  if (!canEditLiberacoes(me)) {
    return (
      <>
        {back}
        <EmptyState
          icon={Lock}
          title="Sem permissão"
          description="Somente comercial e gestão criam liberações."
        />
      </>
    );
  }

  const initial: LiberacaoInput = {
    modelo,
    numero,
    cliente: "",
    responsavel: "",
    contato: "",
    endereco: "",
    projetista: "",
    vendedor: "",
    classificacaoVenda: "",
    dataLiberacao: localToday(),
    dataEntrega: null,
    bissemana: "",
    pontoEnergia: "",
    horarioInstalacao: "",
    observacoes: "",
    itens: [],
  };

  return (
    <>
      {back}
      <PageHeader
        title={`Nova liberação · ${LIBERACAO_MODELO_LABEL[modelo]}`}
        description="Preencha como na planilha. Ao salvar, ela entra no fim da fila do PCP para aprovação. Os campos sugerem as opções de sempre, mas aceitam qualquer texto."
      />
      <LiberacaoEditor
        key={modelo}
        initial={initial}
        readOnly={false}
        saving={saving}
        onSubmit={async (input) => {
          setSaving(true);
          const created = await run(
            () => liberacaoRepository.create(input),
            "Liberação criada e enviada para a fila do PCP.",
          );
          setSaving(false);
          if (created) {
            navigate({ to: "/liberacoes/$liberacaoId", params: { liberacaoId: created.id } });
          }
        }}
      />
    </>
  );
}
