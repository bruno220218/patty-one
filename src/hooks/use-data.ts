import { useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  checklistRepository,
  fetchCurrentUser,
  liberacaoRepository,
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
