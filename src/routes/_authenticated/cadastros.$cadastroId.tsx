import { createFileRoute } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { CadastroForm } from "@/components/app/cadastro-form";
import { useCadastro, useCurrentUser } from "@/hooks/use-data";
import { canEditarCadastros, canVerBancario } from "@/lib/data";

/** "/cadastros/novo" opens an empty form; any other id opens that cadastro. */
export const Route = createFileRoute("/_authenticated/cadastros/$cadastroId")({
  head: () => ({
    meta: [{ title: "Cadastro — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: CadastroPage,
});

function CadastroPage() {
  const { cadastroId } = Route.useParams();
  const { data: me, isPending: carregandoMe } = useCurrentUser();
  const novo = cadastroId === "novo";
  const podeBancario = canVerBancario(me);
  const {
    data: ficha,
    isPending,
    error,
  } = useCadastro(novo ? "" : cadastroId, podeBancario, novo ? undefined : me?.id);

  if (carregandoMe || (!novo && isPending)) return <CardGridSkeleton />;
  if (!novo && (error || !ficha)) {
    return (
      <EmptyState
        icon={SearchX}
        title="Cadastro não encontrado"
        description={error?.message ?? "Ele pode ter sido excluído."}
      />
    );
  }
  if (novo && !canEditarCadastros(me)) {
    return (
      <EmptyState
        icon={SearchX}
        title="Sem permissão"
        description="Só Comercial e Gestão incluem cadastros."
      />
    );
  }
  return (
    <CadastroForm
      // A new key resets the form when switching cadastro or account.
      key={`${cadastroId}-${me?.id ?? ""}`}
      ficha={novo ? null : (ficha ?? null)}
      podeEditar={canEditarCadastros(me)}
      podeBancario={podeBancario}
      podeExcluir={Boolean(me?.isGestor)}
    />
  );
}
