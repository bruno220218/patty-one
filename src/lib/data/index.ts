/**
 * Single swap point for persistence. To move to a database, provide new
 * implementations of ChecklistRepository / ProjectRepository and export them here.
 */
import { localChecklistRepository } from "./checklist-repository";
import { createLocalProjectRepository } from "./project-repository";

export const checklistRepository = localChecklistRepository;
export const projectRepository = createLocalProjectRepository(checklistRepository);

export type { ChecklistRepository } from "./checklist-repository";
export type { ProjectRepository } from "./project-repository";
export * from "./types";
export { projectProgress, projectStatus } from "./rules";
