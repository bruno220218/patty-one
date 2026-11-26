import { z } from "zod";

/**
 * Assistente do PCP (fluxo de produção, etapa 9 ampliada): the browser only says which moment
 * and which record; the server reads the context from the database as the caller
 * (`contexto_assistente_pcp`), so nothing the browser sends reaches the AI.
 */
export const MOMENTOS_ASSISTENTE = ["prazo", "liberacao", "ordem", "programacao"] as const;
export type MomentoAssistente = (typeof MOMENTOS_ASSISTENTE)[number];

/** A record (pedido de prazo, liberação, ordem) by id, or the Programação of a day. */
export const assistenteRequestSchema = z.union([
  z.object({ momento: z.enum(["prazo", "liberacao", "ordem"]), id: z.string().uuid() }),
  z.object({ momento: z.literal("programacao"), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
]);
export type AssistenteRequest = z.infer<typeof assistenteRequestSchema>;

/** Weekly load computed by the database (`carga_producao`). */
export type CargaSemana = {
  inicio: string;
  ordens: number;
  por_tipo: Record<string, number>;
  etapas_abertas: number;
  programacao_por_setor: Record<string, number>;
};
export type CargaProducao = {
  hoje: string;
  semanas: CargaSemana[];
  atrasadas: number;
  sem_data: number;
  aguardando_liberacao: number;
  capacidade_horas_dia_por_setor: Record<string, number>;
  dias_ate_concluir_por_tipo: Record<string, { ordens: number; mediana_dias: number }>;
};

export type SugestaoPrazo = {
  dataSugerida: string | null;
  resumo: string;
  motivos: string[];
  alertas: string[];
};

export type AvaliacaoPrazo = "cabe" | "apertado" | "nao_cabe" | "sem_prazo";

export type SugestaoLiberacao = {
  resumo: string;
  faltando: string[];
  prazo: { avaliacao: AvaliacaoPrazo; comentario: string } | null;
  checklists: { ordem: number; checklist: string; motivo: string }[];
  alertas: string[];
};

export const COMPLEXIDADES_SUGERIDAS = ["Simples", "Média", "Complexa"] as const;
export const PRIORIDADES_SUGERIDAS = ["Baixa", "Normal", "Alta", "Urgente"] as const;

export type SugestaoOrdem = {
  resumo: string;
  complexidade: { valor: (typeof COMPLEXIDADES_SUGERIDAS)[number]; motivo: string } | null;
  prioridade: { valor: (typeof PRIORIDADES_SUGERIDAS)[number]; motivo: string } | null;
  etapasParadas: string[];
  conferir: string[];
  alertas: string[];
};

export type SugestaoProgramacao = {
  resumo: string;
  prioridades: { ordem: number; motivo: string }[];
  conflitos: string[];
  sugestoes: string[];
  alertas: string[];
};

type Base = { carga: CargaProducao; aviso: string | null };
export type AssistenteResposta =
  | (Base & { momento: "prazo"; sugestao: SugestaoPrazo | null })
  | (Base & { momento: "liberacao"; sugestao: SugestaoLiberacao | null })
  | (Base & { momento: "ordem"; sugestao: SugestaoOrdem | null })
  | (Base & { momento: "programacao"; sugestao: SugestaoProgramacao | null });

/** The first JSON object in a model reply (it may come wrapped in ``` fences or prose). */
export function jsonDaResposta(texto: string): unknown {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    return JSON.parse(texto.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

const texto = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lista = (v: unknown, max = 6) =>
  Array.isArray(v)
    ? v
        .map((x) => texto(x))
        .filter(Boolean)
        .slice(0, max)
    : [];

/** Reads the deadline suggestion; a date before today or not a real date becomes null. */
export function lerSugestaoPrazo(resposta: string, hoje: string): SugestaoPrazo | null {
  const j = jsonDaResposta(resposta) as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return null;
  const data = texto(j["data_sugerida"], 10);
  const valida =
    /^\d{4}-\d{2}-\d{2}$/.test(data) &&
    !Number.isNaN(Date.parse(`${data}T12:00:00Z`)) &&
    new Date(`${data}T12:00:00Z`).toISOString().slice(0, 10) === data &&
    data >= hoje;
  const s: SugestaoPrazo = {
    dataSugerida: valida ? data : null,
    resumo: texto(j["resumo"]),
    motivos: lista(j["motivos"]),
    alertas: lista(j["alertas"]),
  };
  return s.dataSugerida || s.resumo || s.motivos.length ? s : null;
}

const AVALIACOES: AvaliacaoPrazo[] = ["cabe", "apertado", "nao_cabe", "sem_prazo"];

/** Reads the liberação review; checklist names not in `checklists` are dropped. */
export function lerSugestaoLiberacao(
  resposta: string,
  checklists: string[],
): SugestaoLiberacao | null {
  const j = jsonDaResposta(resposta) as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return null;
  const p = j["prazo"] as Record<string, unknown> | undefined;
  const avaliacao = texto(p?.["avaliacao"], 20) as AvaliacaoPrazo;
  const nomes = new Map(checklists.map((c) => [c.toLocaleLowerCase("pt-BR"), c]));
  const sugeridos = Array.isArray(j["checklists"]) ? j["checklists"] : [];
  const s: SugestaoLiberacao = {
    resumo: texto(j["resumo"]),
    faltando: lista(j["faltando"], 8),
    prazo: AVALIACOES.includes(avaliacao)
      ? { avaliacao, comentario: texto(p?.["comentario"]) }
      : null,
    checklists: sugeridos
      .map((c) => c as Record<string, unknown>)
      .map((c) => ({
        ordem: Number(c["ordem"]),
        checklist: nomes.get(texto(c["checklist"], 200).toLocaleLowerCase("pt-BR")) ?? "",
        motivo: texto(c["motivo"]),
      }))
      .filter((c) => Number.isInteger(c.ordem) && c.ordem > 0 && c.checklist)
      .slice(0, 20),
    alertas: lista(j["alertas"]),
  };
  return s.resumo || s.faltando.length || s.prazo || s.checklists.length ? s : null;
}

export const ROTULO_AVALIACAO: Record<AvaliacaoPrazo, string> = {
  cabe: "O prazo cabe na carga",
  apertado: "Prazo apertado",
  nao_cabe: "O prazo não cabe na carga",
  sem_prazo: "Sem prazo definido",
};

const escolha = <T extends string>(v: unknown, opcoes: readonly T[]): T | null => {
  const t = texto(v, 20).toLocaleLowerCase("pt-BR");
  return opcoes.find((o) => o.toLocaleLowerCase("pt-BR") === t) ?? null;
};

/** Reads the order review; complexity and priority only from the app's own lists. */
export function lerSugestaoOrdem(resposta: string): SugestaoOrdem | null {
  const j = jsonDaResposta(resposta) as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return null;
  const c = j["complexidade"] as Record<string, unknown> | undefined;
  const p = j["prioridade"] as Record<string, unknown> | undefined;
  const cv = escolha(c?.["valor"], COMPLEXIDADES_SUGERIDAS);
  const pv = escolha(p?.["valor"], PRIORIDADES_SUGERIDAS);
  const s: SugestaoOrdem = {
    resumo: texto(j["resumo"]),
    complexidade: cv ? { valor: cv, motivo: texto(c?.["motivo"]) } : null,
    prioridade: pv ? { valor: pv, motivo: texto(p?.["motivo"]) } : null,
    etapasParadas: lista(j["etapas_paradas"]),
    conferir: lista(j["conferir"], 8),
    alertas: lista(j["alertas"]),
  };
  return s.resumo || s.complexidade || s.prioridade || s.etapasParadas.length || s.conferir.length
    ? s
    : null;
}

/** Reads the day review; priorities only for order numbers that were in the context. */
export function lerSugestaoProgramacao(
  resposta: string,
  ordensConhecidas: number[],
): SugestaoProgramacao | null {
  const j = jsonDaResposta(resposta) as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return null;
  const conhecidas = new Set(ordensConhecidas);
  const s: SugestaoProgramacao = {
    resumo: texto(j["resumo"]),
    prioridades: (Array.isArray(j["prioridades"]) ? j["prioridades"] : [])
      .map((x) => x as Record<string, unknown>)
      .map((x) => ({ ordem: Number(x["ordem"]), motivo: texto(x["motivo"]) }))
      .filter((x) => conhecidas.has(x.ordem))
      .slice(0, 8),
    conflitos: lista(j["conflitos"]),
    sugestoes: lista(j["sugestoes"]),
    alertas: lista(j["alertas"]),
  };
  return s.resumo || s.prioridades.length || s.conflitos.length || s.sugestoes.length ? s : null;
}
