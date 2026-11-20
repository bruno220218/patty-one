import { useCallback, useEffect } from "react";
import { keepPreviousData, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  checklistRepository,
  fetchCurrentUser,
  liberacaoOpcoesRepository,
  lixeiraRepository,
  anexosRepository,
  briefingRepository,
  visitaRepository,
  paineisRepository,
  ciRepository,
  cadastroRepository,
  type CadastroFiltros,
  operacaoRepository,
  type OrdemFiltros,
  comercialRepository,
  financeiroRepository,
  financeiroPagarRepository,
  midiaRepository,
  type VendaFiltros,
  type HistoricoFiltros,
  pessoasDaFuncao,
  type AnexoEntidade,
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

export const useAnexos = (entidade: AnexoEntidade, entidadeId: string) =>
  useQuery({
    queryKey: ["anexos", entidade, entidadeId],
    queryFn: () => anexosRepository.list(entidade, entidadeId),
  });

export const useBriefings = () =>
  useQuery({ queryKey: ["briefings"], queryFn: () => briefingRepository.list() });
export const useBriefing = (id: string) =>
  useQuery({ queryKey: ["briefings", id], queryFn: () => briefingRepository.get(id) });

export const useVisitas = () =>
  useQuery({ queryKey: ["visitas"], queryFn: () => visitaRepository.list() });
export const useVisita = (id: string) =>
  useQuery({ queryKey: ["visitas", id], queryFn: () => visitaRepository.get(id) });

/** Names of the people with any of these functions (for "responsável" pickers). */
export const usePessoasDaFuncao = (funcoes: string[], enabled = true) =>
  useQuery({
    queryKey: ["pessoas-da-funcao", ...funcoes],
    queryFn: () => pessoasDaFuncao(funcoes),
    staleTime: 5 * 60_000,
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

export const usePaineis = () =>
  useQuery({ queryKey: ["paineis"], queryFn: () => paineisRepository.snapshot() });

export const usePainelHistorico = (painelId: string | null) =>
  useQuery({
    queryKey: ["paineis", "historico", painelId],
    queryFn: () => paineisRepository.historico(painelId as string),
    enabled: Boolean(painelId),
  });

export const useCis = () => useQuery({ queryKey: ["cis"], queryFn: () => ciRepository.list() });
export const useCi = (id: string) =>
  useQuery({ queryKey: ["cis", id], queryFn: () => ciRepository.get(id) });

// ---------- Cadastros ----------
export const cadastrosQuery = (filtros: CadastroFiltros, pagina: number) =>
  queryOptions({
    queryKey: ["cadastros", "lista", filtros, pagina],
    queryFn: () => cadastroRepository.list(filtros, pagina),
    placeholderData: keepPreviousData,
  });

export const useCadastros = (filtros: CadastroFiltros, pagina: number) =>
  useQuery(cadastrosQuery(filtros, pagina));

/** The person's id is in the key so bank details never carry over to another account. */
export const useCadastro = (id: string, comBancario: boolean, userId: string | undefined) =>
  useQuery({
    queryKey: ["cadastros", "ficha", id, comBancario, userId],
    queryFn: () => cadastroRepository.get(id, comBancario),
    enabled: Boolean(userId),
  });

// ---------- Operação (setor Produção) ----------
export const useRecursosOperacao = () =>
  useQuery({ queryKey: ["operacao", "recursos"], queryFn: () => operacaoRepository.recursos() });

export const useOrdens = (filtros: OrdemFiltros) =>
  useQuery({
    queryKey: ["operacao", "ordens", filtros],
    queryFn: () => operacaoRepository.ordens(filtros),
    placeholderData: keepPreviousData,
  });

export const useOrdem = (id: string) =>
  useQuery({
    queryKey: ["operacao", "ordem", id],
    queryFn: () => operacaoRepository.ordem(id),
    enabled: Boolean(id),
  });

export const usePlanejamento = (inicio: string, fim: string) =>
  useQuery({
    queryKey: ["operacao", "planejamento", inicio, fim],
    queryFn: () => operacaoRepository.planejamento(inicio, fim),
    placeholderData: keepPreviousData,
  });

export const useProgramacao = (data: string) =>
  useQuery({
    queryKey: ["operacao", "programacao", data],
    queryFn: () => operacaoRepository.programacao(data),
  });

// ---------- Comercial ----------
export const useEmpresas = () =>
  useQuery({
    queryKey: ["comercial", "empresas"],
    queryFn: () => comercialRepository.empresas(),
    staleTime: 5 * 60_000,
  });

export const useVendas = (filtros: VendaFiltros, pagina: number) =>
  useQuery({
    queryKey: ["comercial", "vendas", filtros, pagina],
    queryFn: () => comercialRepository.list(filtros, pagina),
    placeholderData: keepPreviousData,
  });

export const useVenda = (id: string) =>
  useQuery({
    queryKey: ["comercial", "venda", id],
    queryFn: () => comercialRepository.get(id),
    enabled: Boolean(id),
  });

export const usePedidosAbertos = (enabled = true) =>
  useQuery({
    queryKey: ["comercial", "pedidos-abertos"],
    queryFn: () => comercialRepository.pedidosAbertos(),
    enabled,
  });

export const useHistoricoComercial = (filtros: HistoricoFiltros, pagina: number) =>
  useQuery({
    queryKey: ["comercial", "historico", filtros, pagina],
    queryFn: () => comercialRepository.historico(filtros, pagina),
    placeholderData: keepPreviousData,
  });

// ---------- Mídia OOH ----------
export const useTiposMidia = () =>
  useQuery({
    queryKey: ["midia", "tipos"],
    queryFn: () => midiaRepository.tipos(),
    staleTime: 5 * 60_000,
  });

export const usePontosMidia = () =>
  useQuery({ queryKey: ["midia", "pontos"], queryFn: () => midiaRepository.pontos() });

export const usePontoMidia = (id: string) =>
  useQuery({
    queryKey: ["midia", "ponto", id],
    queryFn: () => midiaRepository.ponto(id),
    enabled: Boolean(id),
  });

/** The official calendar changes rarely. */
export const useCalendarioBissemanas = () =>
  useQuery({
    queryKey: ["midia", "calendario"],
    queryFn: () => midiaRepository.calendario(),
    staleTime: 60 * 60_000,
  });

export const useOcupacao = (ano: number, pontoId?: string) =>
  useQuery({
    queryKey: ["midia", "ocupacao", ano, pontoId ?? "todos"],
    queryFn: () => midiaRepository.ocupacao(ano, pontoId),
    placeholderData: keepPreviousData,
  });

// ---------- Financeiro (only Gestão, Direção and Financeiro can read) ----------
export const useContasReceber = (enabled = true) =>
  useQuery({
    queryKey: ["financeiro", "contas"],
    queryFn: () => financeiroRepository.contas(),
    enabled,
  });

export const useContratosAluguel = (enabled = true) =>
  useQuery({
    queryKey: ["financeiro", "aluguel"],
    queryFn: () => financeiroRepository.alugueis(),
    enabled,
  });

export const useContratosEnergia = (enabled = true) =>
  useQuery({
    queryKey: ["financeiro", "energia"],
    queryFn: () => financeiroRepository.energia(),
    enabled,
  });

export const useContasPagar = (enabled = true) =>
  useQuery({
    queryKey: ["financeiro", "pagar"],
    queryFn: () => financeiroPagarRepository.contas(),
    enabled,
  });

export const usePercentuaisVendedores = (enabled = true) =>
  useQuery({
    queryKey: ["financeiro", "percentuais"],
    queryFn: async () => ({
      percentuais: await financeiroPagarRepository.percentuais(),
      vendedores: await financeiroPagarRepository.vendedoresDosPedidos(),
    }),
    enabled,
  });
