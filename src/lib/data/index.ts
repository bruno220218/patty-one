/**
 * Single swap point for persistence. The UI depends on the repository interfaces;
 * the current implementations store data in Lovable Cloud.
 */
import { cloudChecklistRepository } from "./cloud-checklists";
import { cloudProjectRepository } from "./cloud-projects";

export const checklistRepository = cloudChecklistRepository;
export const projectRepository = cloudProjectRepository;

export type { ChecklistRepository, ProjectRepository } from "./repositories";
export * from "./types";
export {
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
