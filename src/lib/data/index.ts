/**
 * Single swap point for persistence. The UI depends on the repository interfaces;
 * the current implementations store data in Lovable Cloud.
 */
import { cloudChecklistRepository } from "./cloud-checklists";
import { cloudProjectRepository } from "./cloud-projects";
import { cloudNotificationRepository } from "./cloud-notifications";

export const checklistRepository = cloudChecklistRepository;
export const projectRepository = cloudProjectRepository;
export const notificationRepository = cloudNotificationRepository;

export type {
  ChecklistRepository,
  NotificationRepository,
  ProjectRepository,
} from "./repositories";
export * from "./types";
export { canToggleTask, EMPTY_CLIENT_INFO, projectProgress, projectStatus } from "./rules";
export { fetchCurrentUser, teamRepository, type TeamMember } from "./team";
