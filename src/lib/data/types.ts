/** Domain types. These describe the records; storage details live in the repositories. */

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string;
  /** Approved by a gestor to see team data (gestores are always members). */
  isMember: boolean;
  isGestor: boolean;
  /** Comercial: can create and edit liberações (as can gestores). */
  isComercial: boolean;
}

export interface ChecklistTask {
  id: string;
  title: string;
}

export interface Checklist {
  id: string;
  name: string;
  description: string;
  /** When true, projects created from this checklist get their tasks locked. */
  fixedParams: boolean;
  tasks: ChecklistTask[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonRef {
  /** Null when the person was removed from the team; the name is kept. */
  id: string | null;
  name: string;
}

export interface ProjectTask {
  id: string;
  title: string;
  /** ISO timestamp of completion, or null when not done (set by the server). */
  completedAt: string | null;
  /** Who completed the task (set by the server), or null. */
  completedBy: PersonRef | null;
}

export interface ProjectBlocker {
  id: string;
  description: string;
  /** AI-suggested next steps, or null when not generated yet / failed. */
  suggestion: string | null;
  createdByName: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  /** Due date as YYYY-MM-DD, or null. */
  dueDate: string | null;
  /** Checklist this project was created from (informational only, never synced). */
  sourceChecklistId: string | null;
  /** Inherited from the checklist's "Parâmetros fixos" at creation time. */
  locked: boolean;
  archived: boolean;
  archivedAt: string | null;
  tasks: ProjectTask[];
  blockers: ProjectBlocker[];
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistInput {
  name: string;
  description: string;
  fixedParams: boolean;
}

export interface ProjectInput {
  name: string;
  description: string;
  dueDate: string | null;
}

export interface NewProjectInput extends ProjectInput {
  /** null = empty project */
  checklistId: string | null;
}

export type MoveDirection = "up" | "down";

export type ProjectStatus = "not_started" | "in_progress" | "done";

export type LiberacaoModelo = "projeto" | "midia";

/**
 * One row of a liberação: Nº PAINEL/ORÇAMENTO | SERVIÇO | INSUMOS | ACABAMENTO | INSTALAÇÃO |
 * DETALHES | LARGURA | ALTURA | QTDA | LOCAL DE INSTALAÇÃO.
 */
export interface LiberacaoItem {
  /** Null for rows not saved yet. */
  id: string | null;
  /** Nº do painel (Mídia) ou Nº do orçamento (Projetos). */
  referencia: string;
  servico: string;
  insumos: string;
  acabamento: string;
  instalacao: string;
  detalhes: string;
  /** Width in cm, or null. */
  larguraCm: number | null;
  /** Height in cm, or null. */
  alturaCm: number | null;
  quantidade: number | null;
  localInstalacao: string;
}

/** Liberação header + items. Model-specific fields stay blank when not used. */
export interface LiberacaoInput {
  modelo: LiberacaoModelo;
  numero: number | null;
  cliente: string;
  responsavel: string;
  contato: string;
  /** Endereço com local de referência. */
  endereco: string;
  /** Layoutista / projetista. */
  projetista: string;
  vendedor: string;
  classificacaoVenda: string;
  /** YYYY-MM-DD or null. */
  dataLiberacao: string | null;
  /** YYYY-MM-DD or null. */
  dataEntrega: string | null;
  /** Modelo Mídia. */
  bissemana: string;
  /** Modelo Projetos (observações). */
  pontoEnergia: string;
  horarioInstalacao: string;
  observacoes: string;
  itens: LiberacaoItem[];
}

export interface Liberacao extends LiberacaoInput {
  id: string;
  numero: number;
  createdAt: string;
  updatedAt: string;
}
