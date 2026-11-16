/**
 * Single swap point for persistence. The UI depends on the repository interfaces;
 * the current implementations store data in Lovable Cloud.
 */
import { cloudChecklistRepository } from "./cloud-checklists";
import { cloudProjectRepository } from "./cloud-projects";
import { cloudLiberacaoRepository } from "./cloud-liberacoes";

export const checklistRepository = cloudChecklistRepository;
export const projectRepository = cloudProjectRepository;
export const liberacaoRepository = cloudLiberacaoRepository;

export type { ChecklistRepository, LiberacaoRepository, ProjectRepository } from "./repositories";
export * from "./types";
export {
  canAprovarLiberacoes,
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
  filterAndSortProjects,
  groupTeamByRole,
  isOverdue,
  localToday,
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
  type LiberacaoOptionLists,
} from "./liberacao-options";
