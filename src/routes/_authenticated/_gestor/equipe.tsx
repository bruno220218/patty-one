import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { useCurrentUser, useDataAction, useTeam } from "@/hooks/use-data";
import { teamRepository } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_gestor/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — Patty One" },
      { name: "description", content: "Defina quem tem permissão de gestão na Patty One." },
      { property: "og:title", content: "Equipe — Patty One" },
      { property: "og:description", content: "Defina quem tem permissão de gestão na Patty One." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { data: team, isPending } = useTeam();
  const { data: me } = useCurrentUser();
  const run = useDataAction();

  return (
    <>
      <PageHeader
        title="Equipe"
        description="Gestores veem os checklists e podem desmarcar tarefas já concluídas."
      />
      {isPending ? (
        <CardGridSkeleton />
      ) : !team || team.length === 0 ? (
        <EmptyState icon={Users} title="Ninguém por aqui" description="As pessoas aparecem aqui ao criar conta." />
      ) : (
        <ul className="surface-card divide-y divide-border">
          {team.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {m.name}
                  {m.id === me?.id && <span className="text-xs text-muted-foreground">(você)</span>}
                </p>
                <p className="text-xs text-muted-foreground">Entrou em {formatDate(m.joinedAt)}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span className="hidden sm:inline">Gestão</span>
                <Switch
                  checked={m.isGestor}
                  aria-label={`Permissão de gestão para ${m.name}`}
                  onCheckedChange={(v) =>
                    run(
                      () => teamRepository.setGestor(m.id, v),
                      v ? `${m.name} agora é gestor(a).` : `${m.name} não é mais gestor(a).`,
                    )
                  }
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
