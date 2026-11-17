import { useCallback, useEffect } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  checklistRepository,
  fetchCurrentUser,
  liberacaoOpcoesRepository,
  lixeiraRepository,
  emailDestinatariosRepository,
  liberacaoRepository,
  resolverListas,
  notificationRepository,
  projectRepository,
  teamRepository,
} from "@/lib/data";

// Queries run client-side only: the signed-in session lives in the browser.
export const checklistsQuery = () =>
  queryOptions({ queryKey: ["checklists"], queryFn: () => checklistRepository.list() });

export const checklistQuery = (id: string) =>
  queryOptions({ queryKey: ["checklists", id], queryFn: () => checklistRepository.get(id) });

export const projectsQuery = (archived: boolean) =>
  queryOptions({
    queryKey: ["projects", { archived }],
    queryFn: () => projectRepository.list({ archived }),
  });

export const projectQuery = (id: string) =>
  queryOptions({ queryKey: ["projects", id], queryFn: () => projectRepository.get(id) });

export const liberacoesQuery = () =>
  queryOptions({ queryKey: ["liberacoes"], queryFn: () => liberacaoRepository.list() });

export const liberacaoQuery = (id: string) =>
  queryOptions({ queryKey: ["liberacoes", id], queryFn: () => liberacaoRepository.get(id) });

export const useLiberacoes = () => useQuery(liberacoesQuery());
export const useLiberacao = (id: string) => useQuery(liberacaoQuery(id));

/** Option lists for the liberação form: editable table, or the built-in lists as fallback. */
export const useListasLiberacao = () => {
  const query = useQuery({
    queryKey: ["liberacao-opcoes"],
    queryFn: () => liberacaoOpcoesRepository.list(),
    staleTime: 5 * 60_000,
  });
  return { ...query, listas: resolverListas(query.data) };
};

export const useTodosEventosLiberacao = () =>
  useQuery({
    queryKey: ["liberacoes", "eventos"],
    queryFn: () => liberacaoRepository.todosEventos(),
  });

export const useLiberacaoEventos = (id: string) =>
  useQuery({
    queryKey: ["liberacoes", id, "eventos"],
    queryFn: () => liberacaoRepository.eventos(id),
  });

export const useLixeira = () =>
  useQuery({ queryKey: ["lixeira"], queryFn: () => lixeiraRepository.list() });

export const useEmailDestinatarios = (enabled = true) =>
  useQuery({
    queryKey: ["email-destinatarios"],
    queryFn: () => emailDestinatariosRepository.list(),
    enabled,
  });

export const useChecklists = () => useQuery(checklistsQuery());
export const useChecklist = (id: string) => useQuery(checklistQuery(id));
export const useProjects = (archived: boolean) => useQuery(projectsQuery(archived));
export const useProject = (id: string) => useQuery(projectQuery(id));

/** Runs a data operation, refreshes cached data and reports errors as toasts. */
export function useDataAction() {
  const queryClient = useQueryClient();
  return useCallback(
    async <T>(fn: () => Promise<T>, successMessage?: string): Promise<T | undefined> => {
      try {
        const result = await fn();
        await queryClient.invalidateQueries();
        if (successMessage) toast.success(successMessage);
        return result;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Algo deu errado. Tente novamente.");
        return undefined;
      }
    },
    [queryClient],
  );
}

export const currentUserQuery = () =>
  queryOptions({ queryKey: ["me"], queryFn: () => fetchCurrentUser(), staleTime: 60_000 });

export const teamQuery = () =>
  queryOptions({ queryKey: ["team"], queryFn: () => teamRepository.list() });

export const useCurrentUser = () => useQuery(currentUserQuery());
export const useTeam = () => useQuery(teamQuery());

export const notificationsQuery = () =>
  queryOptions({ queryKey: ["notifications"], queryFn: () => notificationRepository.list() });

/** The signed-in person's notifications, kept live via Realtime (with polling as a fallback). */
export function useNotifications(userId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const active = Boolean(userId) && enabled;

  useEffect(() => {
    if (!active || !userId) return;
    return notificationRepository.subscribe(userId, () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
  }, [active, userId, queryClient]);

  return useQuery({ ...notificationsQuery(), enabled: active, refetchInterval: 60_000 });
}
