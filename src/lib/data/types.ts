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
  /** Every function (role) the person has, besides basic access. */
  funcoes: Funcao[];
  /** Production sectors the person works in (names; empty before migration 0031). */
  setores?: string[];
}

/** Team functions. "gestor" = Gestão (everything). */
export type Funcao =
  | "gestor"
  | "comercial"
  | "pcp"
  | "direcao"
  | "criacao"
  | "projetos_especiais"
  | "producao"
  | "montagem"
  | "checking"
  | "financeiro";

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

/** Client/job details of a project (comunicação visual). Empty strings mean "not filled". */
export interface ProjectClientInfo {
  serviceType: string;
  ledColor: string;
  paintColors: string;
  adhesiveType: string;
  /** Haverá laminação? null = não informado. */
  lamination: boolean | null;
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
  clientInfo: ProjectClientInfo;
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
  clientInfo: ProjectClientInfo;
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

/** aguardando = na fila do PCP · reprovada = em edição pelo comercial · aprovada = virou projeto */
export type LiberacaoStatus = "aguardando" | "reprovada" | "aprovada";

export interface Liberacao extends LiberacaoInput {
  id: string;
  numero: number;
  status: LiberacaoStatus;
  /** When it (re)entered the PCP queue; the queue is ordered by this. */
  enviadaEm: string;
  motivoReprovacao: string;
  decididoPorNome: string;
  decididoEm: string | null;
  /** Project created when it was approved. */
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LiberacaoEvento {
  id: string;
  tipo: "criada" | "reprovada" | "reenviada" | "aprovada" | "email_enviado" | "comentario";
  detalhe: string;
  autorNome: string;
  createdAt: string;
}

/** In-app notification (today: a team member completed a project task). */
export type NotificationTipo =
  | "tarefa_concluida"
  | "liberacao_nova"
  | "liberacao_reenviada"
  | "liberacao_reprovada"
  | "liberacao_aprovada"
  | "liberacao_comentario"
  | "briefing_novo"
  | "briefing_andamento"
  | "briefing_concluido"
  | "visita_nova"
  | "visita_agendada"
  | "visita_realizada"
  | "visita_cancelada"
  | "rgb_vencendo"
  | "rgb_vence_hoje"
  | "rgb_vencida"
  | "ci_nova"
  | "ci_vinheta_entrou"
  | "ci_recusada"
  | "ci_foto_solicitada"
  | "ci_foto_enviada"
  | "ci_checkout_solicitada"
  | "ci_checkout_enviada";

/** In-app notification: a task was completed, or a liberação moved in the approval flow. */
export interface AppNotification {
  id: string;
  tipo: NotificationTipo;
  /** Null when the project was deleted; the snapshot names are kept. */
  projectId: string | null;
  actorName: string;
  /** Project name, or the liberação's client for liberação notices. */
  projectName: string;
  taskTitle: string;
  liberacaoId: string | null;
  liberacaoNumero: number | null;
  /** Rejection reason, for "liberacao_reprovada"; extra line for briefings/visitas. */
  detalhe: string;
  /** App path to open (briefings and visitas). */
  link: string;
  /** Briefing/visita number. */
  refNumero: number | null;
  createdAt: string;
  readAt: string | null;
}
