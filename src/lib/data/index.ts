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
export * from "./paineis-rules";
