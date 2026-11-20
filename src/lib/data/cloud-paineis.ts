import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import type { VinhetaTipo } from "./paineis-rules";

// The painéis tables are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

export interface Painel {
  id: string;
  codigo: string;
  nome: string;
  espacos: number;
  duracaoPadrao: number;
  loopPadrao: string;
  insercoesPadrao: number;
  ordem: number;
  /** Where the panel's media live (Drive folder; PA01 uses vnnox). Empty when not set. */
  midiasLink: string;
}

export interface VinhetaInput {
  posicao: number;
  cliente: string;
  ci: string;
  tipo: VinhetaTipo;
  /** YYYY-MM-DD or null. */
  inicio: string | null;
  fim: string | null;
  representanteNome: string;
  duracaoSeg: number;
  loop: string;
  insercoesDia: number;
  observacao: string;
}

export interface Vinheta extends VinhetaInput {
  id: string;
  painelId: string;
  /** Set when the representative's name matches someone on the team. */
  representanteId: string | null;
  createdByNome: string;
  createdAt: string;
  updatedByNome: string;
  updatedAt: string;
}

export type PainelHistoricoAcao = "criada" | "alterada" | "retirada" | "importada";

export interface PainelHistoricoItem {
  id: string;
  painelId: string | null;
  vinhetaId: string | null;
  acao: PainelHistoricoAcao;
  cliente: string;
  posicao: number | null;
  /** Changed fields: { fim: { de: "2026-11-28", para: "2026-12-28" } }. */
  mudancas: Record<string, { de: unknown; para: unknown }>;
  feitoPorNome: string;
  createdAt: string;
}

export interface PaineisSnapshot {
  paineis: Painel[];
  /** Only the vinhetas currently on the panels (retired ones live in the history). */
  vinhetas: Vinheta[];
}

interface PainelRow {
  id: string;
  codigo: string;
  nome: string;
  espacos: number;
  duracao_padrao: number;
  loop_padrao: string;
  insercoes_padrao: number;
  ordem: number;
  /** Missing until migration 0022 runs. */
  midias_link?: string;
}

interface VinhetaRow {
  id: string;
  painel_id: string;
  posicao: number;
  cliente: string;
  ci: string;
  tipo: VinhetaTipo;
  inicio: string | null;
  fim: string | null;
  representante_nome: string;
  representante_id: string | null;
  duracao_seg: number;
  loop: string;
  insercoes_dia: number;
  observacao: string;
  created_by_nome: string;
  created_at: string;
  updated_by_nome: string;
  updated_at: string;
}

interface HistoricoRow {
  id: string;
  painel_id: string | null;
  vinheta_id: string | null;
  acao: PainelHistoricoAcao;
  cliente: string;
  posicao: number | null;
  mudancas: Record<string, { de: unknown; para: unknown }> | null;
  feito_por_nome: string;
  created_at: string;
}

const toPainel = (r: PainelRow): Painel => ({
  id: r.id,
  codigo: r.codigo,
  nome: r.nome,
  espacos: r.espacos,
  duracaoPadrao: r.duracao_padrao,
  loopPadrao: r.loop_padrao,
  insercoesPadrao: r.insercoes_padrao,
  ordem: r.ordem,
  midiasLink: r.midias_link ?? "",
});

const toVinheta = (r: VinhetaRow): Vinheta => ({
  id: r.id,
  painelId: r.painel_id,
  posicao: r.posicao,
  cliente: r.cliente,
  ci: r.ci,
  tipo: r.tipo,
  inicio: r.inicio,
  fim: r.fim,
  representanteNome: r.representante_nome,
  representanteId: r.representante_id,
  duracaoSeg: r.duracao_seg,
  loop: r.loop,
  insercoesDia: r.insercoes_dia,
  observacao: r.observacao,
  createdByNome: r.created_by_nome,
  createdAt: r.created_at,
  updatedByNome: r.updated_by_nome,
  updatedAt: r.updated_at,
});

const toHistorico = (r: HistoricoRow): PainelHistoricoItem => ({
  id: r.id,
  painelId: r.painel_id,
  vinhetaId: r.vinheta_id,
  acao: r.acao,
  cliente: r.cliente,
  posicao: r.posicao,
  mudancas: r.mudancas ?? {},
  feitoPorNome: r.feito_por_nome || "Alguém da equipe",
  createdAt: r.created_at,
});

const validDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function toRow(i: VinhetaInput) {
  const cliente =
    i.tipo === "indisponivel" && !i.cliente.trim() ? "Indisponível" : i.cliente.trim();
  if (!cliente) throw new Error("Informe o cliente (nome da vinheta).");
  const inicio = validDate(i.inicio);
  const fim = validDate(i.fim);
  if (inicio && fim && fim < inicio) throw new Error("O fim não pode ser antes do início.");
  return {
    posicao: i.posicao,
    cliente,
    ci: i.ci.trim(),
    tipo: i.tipo,
    inicio,
    fim,
    representante_nome: i.representanteNome.trim(),
    duracao_seg: Math.max(1, Math.round(i.duracaoSeg) || 1),
    loop: i.loop.trim().toLowerCase() || "4x",
    insercoes_dia: Math.max(0, Math.round(i.insercoesDia) || 0),
    observacao: i.observacao.trim(),
  };
}

/** Unique-slot violations come back as a message people can act on. */
function slotError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new Error("Esse espaço acabou de ser ocupado. Atualize a página e escolha outro.");
  }
  return dbError(error);
}

const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

export const paineisRepository = {
  /** Null when the database update hasn't been run yet. */
  async snapshot(): Promise<PaineisSnapshot | null> {
    const [paineis, vinhetas] = await Promise.all([
      db.from("paineis").select("*").order("ordem"),
      db.from("painel_vinhetas").select("*").is("retirada_em", null).order("posicao"),
    ]);
    if (paineis.error) {
      if (missingTable(paineis.error.code)) return null;
      throw dbError(paineis.error);
    }
    if (vinhetas.error) throw dbError(vinhetas.error);
    return {
      paineis: ((paineis.data ?? []) as PainelRow[]).map(toPainel),
      vinhetas: ((vinhetas.data ?? []) as VinhetaRow[]).map(toVinheta),
    };
  },

  async historico(painelId: string, limit = 100): Promise<PainelHistoricoItem[]> {
    const { data, error } = await db
      .from("painel_historico")
      .select("*")
      .eq("painel_id", painelId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw dbError(error);
    return ((data ?? []) as HistoricoRow[]).map(toHistorico);
  },

  /** Puts a vinheta on a panel; `extras` puts the same one on other panels (first free slot). */
  async criar(
    painelId: string,
    input: VinhetaInput,
    extras: { painelId: string; posicao: number }[] = [],
  ): Promise<void> {
    const base = toRow(input);
    const rows = [
      { ...base, painel_id: painelId },
      ...extras.map((e) => ({ ...base, painel_id: e.painelId, posicao: e.posicao })),
    ];
    const { error } = await db.from("painel_vinhetas").insert(rows);
    if (error) throw slotError(error);
  },

  async atualizar(id: string, input: VinhetaInput): Promise<void> {
    const { error } = await db.from("painel_vinhetas").update(toRow(input)).eq("id", id);
    if (error) throw slotError(error);
  },

  /** Takes the vinheta off the panel; it stays in the history. */
  async retirar(id: string): Promise<void> {
    const { error } = await db
      .from("painel_vinhetas")
      .update({ retirada_em: new Date().toISOString() })
      .eq("id", id);
    if (error) throw dbError(error);
  },

  /** Criação/gestão: link of the panel's media (empty clears it). Checked again in the database. */
  async salvarLinkMidias(painelId: string, link: string): Promise<void> {
    const { error } = await db.rpc("salvar_link_midias_painel", {
      _painel_id: painelId,
      _link: link.trim(),
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        throw new Error("Os links das mídias ainda não foram ativados no banco de dados.");
      }
      if (["23514", "42501", "P0002"].includes(error.code ?? "")) throw new Error(error.message);
      throw dbError(error);
    }
  },

  /** Creates due-date notices that are still pending. Safe to call any number of times. */
  async gerarAvisos(): Promise<void> {
    const { error } = await db.rpc("gerar_avisos_paineis");
    if (error && error.code !== "PGRST202") throw dbError(error);
  },
};
