import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";

// The table is newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

export type BriefingDestino = "criacao" | "projetos_especiais";
export type BriefingStatus = "novo" | "em_andamento" | "concluido";

export const BRIEFING_DESTINO_LABEL: Record<BriefingDestino, string> = {
  criacao: "Criação",
  projetos_especiais: "Projetos Especiais",
};

export const BRIEFING_STATUS_LABEL: Record<BriefingStatus, string> = {
  novo: "Novo",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

export interface BriefingInput {
  destino: BriefingDestino;
  cliente: string;
  contato: string;
  vendedor: string;
  titulo: string;
  descricao: string;
  objetivo: string;
  publico: string;
  formatos: string;
  identidade: string;
  referencias: string;
  observacoes: string;
  /** YYYY-MM-DD or null. */
  prazo: string | null;
}

export interface Briefing extends BriefingInput {
  id: string;
  numero: number;
  status: BriefingStatus;
  responsavelId: string | null;
  responsavelNome: string;
  concluidoEm: string | null;
  /** When someone clicked "Iniciar" (null while new, or before migration 0017). */
  iniciadoEm: string | null;
  createdBy: string | null;
  createdByNome: string;
  createdAt: string;
  updatedAt: string;
}

export const BRIEFING_VAZIO: BriefingInput = {
  destino: "criacao",
  cliente: "",
  contato: "",
  vendedor: "",
  titulo: "",
  descricao: "",
  objetivo: "",
  publico: "",
  formatos: "",
  identidade: "",
  referencias: "",
  observacoes: "",
  prazo: null,
};

interface Row {
  id: string;
  numero: number;
  destino: BriefingDestino;
  cliente: string;
  contato: string;
  vendedor: string;
  titulo: string;
  descricao: string;
  objetivo: string;
  publico: string;
  formatos: string;
  identidade: string;
  referencias: string;
  observacoes: string;
  prazo: string | null;
  status: BriefingStatus;
  responsavel_id: string | null;
  responsavel_nome: string;
  concluido_em: string | null;
  iniciado_em?: string | null;
  created_by: string | null;
  created_by_nome: string;
  created_at: string;
  updated_at: string;
}

const toBriefing = (r: Row): Briefing => ({
  id: r.id,
  numero: r.numero,
  destino: r.destino,
  cliente: r.cliente,
  contato: r.contato,
  vendedor: r.vendedor,
  titulo: r.titulo,
  descricao: r.descricao,
  objetivo: r.objetivo,
  publico: r.publico,
  formatos: r.formatos,
  identidade: r.identidade,
  referencias: r.referencias,
  observacoes: r.observacoes,
  prazo: r.prazo,
  status: r.status,
  responsavelId: r.responsavel_id,
  responsavelNome: r.responsavel_nome,
  concluidoEm: r.concluido_em,
  iniciadoEm: r.iniciado_em ?? null,
  createdBy: r.created_by,
  createdByNome: r.created_by_nome,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRow = (i: BriefingInput) => ({
  destino: i.destino,
  cliente: i.cliente.trim(),
  contato: i.contato.trim(),
  vendedor: i.vendedor.trim(),
  titulo: i.titulo.trim(),
  descricao: i.descricao.trim(),
  objetivo: i.objetivo.trim(),
  publico: i.publico.trim(),
  formatos: i.formatos.trim(),
  identidade: i.identidade.trim(),
  referencias: i.referencias.trim(),
  observacoes: i.observacoes.trim(),
  prazo: i.prazo || null,
});

function check(i: BriefingInput) {
  if (!i.titulo.trim()) throw new Error("Diga o que precisa ser feito (título).");
}

export const briefingRepository = {
  /** Null when the table doesn't exist yet. */
  async list(): Promise<Briefing[] | null> {
    const { data, error } = await db
      .from("briefings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return null;
      throw dbError(error);
    }
    return ((data ?? []) as Row[]).map(toBriefing);
  },

  async get(id: string): Promise<Briefing | null> {
    const { data, error } = await db.from("briefings").select("*").eq("id", id).maybeSingle();
    if (error) throw dbError(error);
    return data ? toBriefing(data as Row) : null;
  },

  async create(input: BriefingInput): Promise<Briefing> {
    check(input);
    const { data, error } = await db.from("briefings").insert(toRow(input)).select("*").single();
    if (error) throw dbError(error);
    return toBriefing(data as Row);
  },

  async update(id: string, input: BriefingInput): Promise<void> {
    check(input);
    const { error } = await db.from("briefings").update(toRow(input)).eq("id", id);
    if (error) throw dbError(error);
  },

  async setStatus(id: string, status: BriefingStatus): Promise<void> {
    const { error } = await db.from("briefings").update({ status }).eq("id", id);
    if (error) throw dbError(error);
  },

  async setResponsavel(id: string, responsavelId: string | null): Promise<void> {
    const { error } = await db
      .from("briefings")
      .update({ responsavel_id: responsavelId })
      .eq("id", id);
    if (error) throw dbError(error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await db.from("briefings").delete().eq("id", id);
    if (error) throw dbError(error);
  },
};

/** People of the given functions (for "responsável" pickers). */
export async function pessoasDaFuncao(funcoes: string[]): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await db.rpc("pessoas_da_funcao", { _roles: funcoes });
  if (error) {
    if (error.code === "PGRST202") return [];
    throw dbError(error);
  }
  return (data ?? []) as { id: string; nome: string }[];
}
