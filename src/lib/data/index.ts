/**
 * Single swap point for persistence. The UI depends on the repository interfaces;
 * the current implementations store data in Supabase.
 */
import { cloudChecklistRepository } from "./cloud-checklists";
import { cloudProjectRepository } from "./cloud-projects";
import { cloudLiberacaoRepository } from "./cloud-liberacoes";
import { cloudNotificationRepository } from "./cloud-notifications";

export const checklistRepository = cloudChecklistRepository;
export const projectRepository = cloudProjectRepository;
export const liberacaoRepository = cloudLiberacaoRepository;
export const notificationRepository = cloudNotificationRepository;
export { liberacaoOpcoesRepository } from "./cloud-liberacao-opcoes";
export { lixeiraRepository, type LixeiraItem } from "./cloud-lixeira";
export {
  emailDestinatariosRepository,
  emailValido,
  type EmailDestinatario,
} from "./cloud-email-destinatarios";

export type {
  ChecklistRepository,
  LiberacaoRepository,
  NotificationRepository,
  ProjectRepository,
} from "./repositories";
export * from "./types";
export {
  canAprovarLiberacoes,
  canAgendarVisita,
  canAtenderBriefing,
  canCriarBriefing,
  canRealizarVisita,
  canSolicitarVisita,
  canGerirChecklists,
  canEditLiberacoes,
  filaPcp,
  FUNCOES,
  LIBERACAO_STATUS_LABEL,
  emptyLiberacaoItem,
  formatQuantidade,
  formatTamanho,
  LIBERACAO_MODELO_INFO,
  isBlankLiberacaoItem,
  LIBERACAO_MODELO_LABEL,
  MOTIVOS_SEM_PEDIDO,
  modeloDoPedido,
  liberacaoItemCount,
  joinMultiplos,
  onlyDigits,
  splitMultiplos,
  parseCm,
  canToggleTask,
  DEFAULT_PROJECT_FILTERS,
  EMPTY_CLIENT_INFO,
  filterAndSortProjects,
  isOverdue,
  etapaAtual,
  localToday,
  groupTeamByRole,
  matchingOpenTasks,
  projectProgress,
  projectStatus,
  type DueFilter,
  type ProgressFilter,
  type ProjectFilters,
  type ProjectSort,
  type TeamRole,
} from "./rules";
export { fetchCurrentUser, teamRepository, type TeamMember } from "./team";
export {
  BISSEMANAS,
  CLASSIFICACOES_VENDA,
  MIDIA_OPTIONS,
  PROJETISTAS,
  PROJETO_OPTIONS,
  VENDEDORES,
  LISTAS_PADRAO,
  resolverListas,
  type LiberacaoOpcao,
  type LiberacaoOptionLists,
  type ListasLiberacao,
  type OpcaoCampo,
} from "./liberacao-options";
export * from "./cloud-anexos";
export * from "./cloud-briefings";
export * from "./cloud-visitas";
export * from "./cloud-paineis";
export * from "./cloud-cis";
export * from "./paineis-rules";
export * from "./cloud-cadastros";
export * from "./cadastros-rules";
export { parseCsv, toCsv, type CsvParsed } from "./csv";
export * from "./cloud-operacao";
export * from "./producao-rules";
export * from "./skill-pcp";
export * from "./planejamento-rules";
export * from "./programacao-rules";
export * from "./cloud-setores";
export * from "./cloud-comercial";
export * from "./cloud-prazos";
export * from "./status-servicos-rules";
export * from "./cloud-status-servicos";
export * from "./comercial-rules";
export * from "./cloud-midia";
export * from "./midia-rules";
export * from "./cloud-financeiro";
export * from "./financeiro-rules";
export * from "./dashboard";
export * from "./cloud-dashboard";
export * from "./estoque-rules";
export * from "./cloud-estoque";
