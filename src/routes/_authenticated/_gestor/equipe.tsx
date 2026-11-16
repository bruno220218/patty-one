import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, Pencil, ShieldCheck, Trash2, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { IconAction } from "@/components/app/icon-action";
import { RenameMemberDialog } from "@/components/app/rename-member-dialog";
import { useCurrentUser, useDataAction, useTeam } from "@/hooks/use-data";
import { groupTeamByRole, teamRepository, type TeamMember, type TeamRole } from "@/lib/data";
import { formatDate } from "@/lib/format";

const ROLE_LABEL: Record<TeamRole, string> = {
  pendente: "Aguardando aprovação",
  gestor: "Gestão",
  membro: "Membros",
};

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
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [renaming, setRenaming] = useState<TeamMember | null>(null);

  return (
    <>
      <PageHeader
        title="Equipe"
        description="Libere o acesso de quem criou conta. Gestores também veem os checklists e podem desmarcar tarefas já concluídas."
      />
      {isPending ? (
        <CardGridSkeleton />
      ) : !team || team.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Ninguém por aqui"
          description="As pessoas aparecem aqui ao criar conta."
        />
      ) : (
        <div className="surface-card divide-y divide-border">
          {groupTeamByRole(team).map((group) => (
            <section key={group.role} aria-labelledby={`equipe-${group.role}`}>
              <h2
                id={`equipe-${group.role}`}
                className="flex items-center gap-2 bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:rounded-t-[inherit]"
              >
                {ROLE_LABEL[group.role]}
                <span className="font-normal">· {group.people.length}</span>
              </h2>
              <ul className="divide-y divide-border">
                {group.people.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {m.name}
                        {m.id === me?.id && (
                          <span className="text-xs text-muted-foreground">(você)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.isMember
                          ? `Entrou em ${formatDate(m.joinedAt)}`
                          : "Aguardando aprovação"}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                        <span className="hidden sm:inline">Acesso</span>
                        <Switch
                          checked={m.isMember}
                          disabled={m.id === me?.id}
                          aria-label={`Acesso à equipe para ${m.name}`}
                          onCheckedChange={(v) =>
                            run(
                              () => teamRepository.setAccess(m.id, v),
                              v
                                ? `Acesso liberado para ${m.name}.`
                                : `${m.name} não tem mais acesso.`,
                            )
                          }
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="hidden sm:inline">Gestão</span>
                        <Switch
                          checked={m.isGestor}
                          disabled={!m.isMember}
                          aria-label={`Permissão de gestão para ${m.name}`}
                          onCheckedChange={(v) =>
                            run(
                              () => teamRepository.setGestor(m.id, v),
                              v
                                ? `${m.name} agora é gestor(a).`
                                : `${m.name} não é mais gestor(a).`,
                            )
                          }
                        />
                      </label>
                      <IconAction
                        icon={Pencil}
                        label={`Renomear ${m.name}`}
                        onClick={() => setRenaming(m)}
                      />
                      {m.id === me?.id ? (
                        <span className="h-8 w-8" aria-hidden />
                      ) : (
                        <IconAction
                          icon={Trash2}
                          label={`Remover ${m.name} da equipe`}
                          danger
                          onClick={() => setRemoving(m)}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <RenameMemberDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        currentName={renaming?.name ?? ""}
        onSubmit={(name) => {
          const target = renaming;
          if (!target) return Promise.resolve(undefined);
          return run(
            () => teamRepository.rename(target.id, name),
            `${target.name} agora se chama ${name}.`,
          );
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remover ${removing?.name ?? ""} da equipe?`}
        description="A conta desta pessoa será excluída e ela não poderá mais entrar. As tarefas que ela concluiu e os bloqueios que registrou continuam mostrando o nome dela. Se voltar a criar conta, precisará de nova aprovação."
        confirmLabel="Remover"
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target)
            run(
              () => teamRepository.remove(target.id),
              `${target.name} foi removido(a) da equipe.`,
            );
        }}
      />
    </>
  );
}
