import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, LockKeyhole, Pencil, Trash2, Users } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { IconAction } from "@/components/app/icon-action";
import { RenameMemberDialog } from "@/components/app/rename-member-dialog";
import { SetPasswordDialog } from "@/components/app/set-password-dialog";
import { FuncoesChips, FuncoesPicker } from "@/components/app/funcoes-picker";
import { useCurrentUser, useDataAction, useTeam } from "@/hooks/use-data";
import {
  FUNCOES,
  groupTeamByRole,
  teamRepository,
  type TeamMember,
  type TeamRole,
} from "@/lib/data";
import { formatDate } from "@/lib/format";

const ROLE_LABEL: Record<TeamRole, string> = {
  pendente: "Aguardando aprovação",
  gestor: "Gestão",
  membro: "Colaboradores",
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
  const [settingPassword, setSettingPassword] = useState<TeamMember | null>(null);

  return (
    <>
      <PageHeader
        title="Equipe"
        description="Libere o acesso de quem criou conta e defina as funções: Comercial cria liberações, PCP e Direção aprovam, Criação, Produção e Montagem executam. Gestão tem acesso total."
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
                      {m.email && (
                        <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {m.isMember
                          ? `Entrou em ${formatDate(m.joinedAt)}`
                          : "Aguardando aprovação · confira o e-mail antes de liberar"}
                      </p>
                      <div className="mt-1">
                        <FuncoesChips funcoes={m.funcoes} />
                      </div>
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
                      <FuncoesPicker
                        personName={m.name}
                        funcoes={m.funcoes}
                        disabled={!m.isMember}
                        lockGestor={m.id === me?.id}
                        onToggle={(funcao, on) => {
                          const label = FUNCOES.find((f) => f.value === funcao)?.label ?? funcao;
                          run(
                            () =>
                              funcao === "gestor"
                                ? teamRepository.setGestor(m.id, on)
                                : teamRepository.setFuncao(m.id, funcao, on),
                            on ? `${m.name} agora é ${label}.` : `${m.name} não é mais ${label}.`,
                          );
                        }}
                      />
                      <IconAction
                        icon={LockKeyhole}
                        label={`Definir senha de ${m.name}`}
                        onClick={() => setSettingPassword(m)}
                      />
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
      <SetPasswordDialog
        open={settingPassword !== null}
        onOpenChange={(open) => !open && setSettingPassword(null)}
        personName={settingPassword?.name ?? ""}
        onSubmit={(password) => {
          const target = settingPassword;
          if (!target) return Promise.resolve(undefined);
          return run(
            () => teamRepository.setPassword(target.id, password),
            `Senha de ${target.name} definida. Passe a senha para a pessoa.`,
          );
        }}
      />
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
