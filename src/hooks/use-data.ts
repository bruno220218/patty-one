import { useCallback } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { checklistRepository, projectRepository } from "@/lib/data";

// Data lives in the browser, so queries run client-side only (never during SSR).
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
