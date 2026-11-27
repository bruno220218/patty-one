import { z } from "zod";

/**
 * Orquestrador: one question, answered by consulting the sector agents (each follows its skill).
 * Pure definitions shared by the page and the server; tested in orquestrador-schema.test.ts.
 */

/** Where a sector's data comes from today. null = not in Patty One yet (answers without AI). */
export type FonteDados = "pcp" | "comercial";

export interface DefinicaoSetor {
  id: SetorId;
  nome: string;
  /** Tool name the orchestrator calls. */
  ferramenta: string;
  descricao: string;
  fonte: FonteDados | null;
}

export const SETOR_IDS = [
  "pcp",
  "comercial",
  "orcamentos",
  "criacao",
  "projetos",
  "compras",
  "externa",
  "mapeamento",
] as const;
export type SetorId = (typeof SETOR_IDS)[number];

export const SETORES: DefinicaoSetor[] = [
  {
    id: "pcp",
    nome: "PCP",
    ferramenta: "consultar_pcp",
    descricao:
      "PCP: ordens de produção abertas, etapas, apontamentos do dia, capacidade das equipes, atrasos e prazos de OS.",
    fonte: "pcp",
  },
  {
    id: "comercial",
    nome: "Comercial",
    ferramenta: "consultar_comercial",
    descricao:
      "Comercial: renovação de CI e outdoors perto do vencimento, propostas sem resposta, pedidos a liberar (checklist), visitas técnicas e pós-venda.",
    fonte: "comercial",
  },
  {
    id: "orcamentos",
    nome: "Orçamentos",
    ferramenta: "consultar_orcamentos",
    descricao: "Orçamentos: fila de orçamentos, previsão de entrega, medidas que faltam.",
    fonte: null,
  },
  {
    id: "criacao",
    nome: "Criação",
    ferramenta: "consultar_criacao",
    descricao:
      "Criação: briefings de layout/vinheta, saída de serviços, painéis RGB, impressão 3D.",
    fonte: null,
  },
  {
    id: "projetos",
    nome: "Projetos",
    ferramenta: "consultar_projetos",
    descricao:
      "Projetos: conferência de medidas e material, projeto estrutural, corte CNC, layout técnico.",
    fonte: null,
  },
  {
    id: "compras",
    nome: "Compras e Estoque",
    ferramenta: "consultar_compras_estoque",
    descricao: "Compras e Estoque: estoque mínimo, compras por OS, prazo de fornecedor.",
    fonte: null,
  },
  {
    id: "externa",
    nome: "Externa",
    ferramenta: "consultar_externa",
    descricao: "Externa (instalação e colagem): checklist de saída, clima, comprovação de entrega.",
    fonte: null,
  },
  {
    id: "mapeamento",
    nome: "Mapeamento",
    ferramenta: "consultar_mapeamento",
    descricao:
      "Mapeamento: pontos de outdoor livres por bi-semana, corte de liberação, roteiro de colagem.",
    fonte: null,
  },
];

export const setorPorFerramenta = new Map(SETORES.map((s) => [s.ferramenta, s]));

/** The sectors whose data the page should load and send. */
export const FONTES: FonteDados[] = ["pcp", "comercial"];

/** Max size of the data the page sends (characters of JSON). */
export const MAX_DADOS_CHARS = 1_500_000;

const dadosSchema = z.record(z.string(), z.unknown()).nullable().optional();

export const orquestradorRequestSchema = z.object({
  mensagem: z.string().trim().min(1).max(2000),
  /** Earlier turns of this conversation, oldest first, so follow-ups make sense. */
  historico: z
    .array(
      z.object({
        papel: z.enum(["usuario", "assistente"]),
        texto: z.string().max(4000),
      }),
    )
    .max(8)
    .default([]),
  usuario: z
    .object({ nome: z.string().max(120), funcoes: z.array(z.string().max(40)).max(12) })
    .default({ nome: "", funcoes: [] }),
  /** Loaded by the page as the signed-in person (RLS applies); null = no access or failed. */
  dados: z.object({ pcp: dadosSchema, comercial: dadosSchema }).default({}),
});
export type OrquestradorRequest = z.input<typeof orquestradorRequestSchema>;
export type OrquestradorPedido = z.output<typeof orquestradorRequestSchema>;

export type SituacaoSetor = "respondeu" | "sem_dados" | "sem_acesso" | "erro";

export interface ConsultaSetor {
  setor: SetorId;
  nome: string;
  situacao: SituacaoSetor;
}

export interface OrquestradorResposta {
  resposta: string;
  consultas: ConsultaSetor[];
  aviso: string | null;
  /** How long the server took, to compare speed. */
  segundos?: number;
}

/** What a sector tool returns to the orchestrator when it doesn't call the AI. */
export function respostaSemAgente(setor: DefinicaoSetor, situacao: SituacaoSetor): string {
  switch (situacao) {
    case "sem_dados":
      return `SEM_DADOS: o setor ${setor.nome} ainda não tem dados no Patty One. Diga ao usuário que essa parte ainda não dá para responder pelo sistema.`;
    case "sem_acesso":
      return `SEM_ACESSO: os dados do setor ${setor.nome} não estão disponíveis para este usuário (sem permissão ou não carregaram). Diga isso ao usuário, sem inventar.`;
    case "erro":
      return `ERRO: o setor ${setor.nome} não respondeu agora. Diga ao usuário que essa parte ficou sem resposta.`;
    case "respondeu":
      return "";
  }
}

/**
 * True when the AI provider refused for lack of quota (HTTP 429 / RESOURCE_EXHAUSTED), also when
 * the SDK wrapped it after its retries (`lastError`, `errors`).
 */
export function semCota(e: unknown, profundidade = 0): boolean {
  if (!e || typeof e !== "object" || profundidade > 3) return false;
  const x = e as { statusCode?: unknown; message?: unknown; lastError?: unknown; errors?: unknown };
  if (x.statusCode === 429) return true;
  if (typeof x.message === "string" && /quota|RESOURCE_EXHAUSTED/i.test(x.message)) return true;
  if (semCota(x.lastError, profundidade + 1)) return true;
  return Array.isArray(x.errors) && x.errors.some((y) => semCota(y, profundidade + 1));
}

export const MENSAGEM_SEM_COTA =
  "A cota grátis de IA de hoje acabou. Ela volta de madrugada; tente de novo amanhã.";

/** Removes the skill file's front matter (name/description). */
export function textoDaSkill(markdown: string): string {
  return markdown.replace(/^---[\s\S]*?---\s*/, "").trim();
}

/** Same sector consulted more than once in a turn: keep the last situation. */
export function juntarConsultas(consultas: ConsultaSetor[]): ConsultaSetor[] {
  const porSetor = new Map<SetorId, ConsultaSetor>();
  for (const c of consultas) porSetor.set(c.setor, c);
  return SETORES.filter((s) => porSetor.has(s.id)).map((s) => porSetor.get(s.id)!);
}
