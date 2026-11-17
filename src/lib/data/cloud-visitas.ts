import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";

// The table is newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

export type VisitaStatus = "solicitada" | "agendada" | "realizada" | "cancelada";

export const VISITA_STATUS_LABEL: Record<VisitaStatus, string> = {
  solicitada: "Aguardando agenda",
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

export type SimNao = "sim" | "nao" | null;

/** The technical-visit form (same fields as the paper model "VISITA TÉCNICA/MEDIDAS"). */
export interface Vistoria {
  avaliacaoObra: string;
  localMedida: string[];
  limpeza: SimNao;
  retiradaMaterialVelho: boolean;
  trabalhoAltura: SimNao;
  escadaAltura: string;
  cintoSeguranca: SimNao;
  munckAltura: string;
  superficies: string[];
  andaime: SimNao;
  andaimeJogos: string;
  andaimeSapata: string;
  andaimeTabuas: string;
  andaimeRodinhas: string;
  piso: string[];
  voltagem: string[];
  tomada: SimNao;
  extensao: SimNao;
  pontoEnergia: SimNao;
  tamanhoExtensao: string;
  dificuldades: string;
}

export const VISTORIA_VAZIA: Vistoria = {
  avaliacaoObra: "",
  localMedida: [],
  limpeza: null,
  retiradaMaterialVelho: false,
  trabalhoAltura: null,
  escadaAltura: "",
  cintoSeguranca: null,
  munckAltura: "",
  superficies: [],
  andaime: null,
  andaimeJogos: "",
  andaimeSapata: "",
  andaimeTabuas: "",
  andaimeRodinhas: "",
  piso: [],
  voltagem: [],
  tomada: null,
  extensao: null,
  pontoEnergia: null,
  tamanhoExtensao: "",
  dificuldades: "",
};

export const LOCAL_MEDIDA = ["Interna", "Externa"];
export const SUPERFICIES = [
  "Vidro",
  "Madeira",
  "Concreto",
  "Metal",
  "Drywall",
  "Alumínio",
  "Gesso",
  "Bloco",
  "Tijolo",
];
export const PISOS = ["Inclinado", "Plano", "Reto", "Escorregadio"];
export const VOLTAGENS = ["127 V", "220 V"];

/** Fills missing keys (old rows, partial JSON) with defaults. */
export function normalizarVistoria(raw: unknown): Vistoria {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<Vistoria>;
  const out = { ...VISTORIA_VAZIA };
  for (const k of Object.keys(VISTORIA_VAZIA) as (keyof Vistoria)[]) {
    const val = v[k];
    const def = VISTORIA_VAZIA[k];
    if (Array.isArray(def)) {
      if (Array.isArray(val)) (out as Record<string, unknown>)[k] = val.map(String);
    } else if (typeof def === "boolean") {
      if (typeof val === "boolean") (out as Record<string, unknown>)[k] = val;
    } else if (def === null) {
      if (val === "sim" || val === "nao") (out as Record<string, unknown>)[k] = val;
    } else if (typeof val === "string") {
      (out as Record<string, unknown>)[k] = val;
    }
  }
  return out;
}

export interface VisitaSolicitacao {
  cliente: string;
  contato: string;
  endereco: string;
  referenciaLocal: string;
  vendedor: string;
  /** YYYY-MM-DD or null. */
  dataSugerida: string | null;
  descricao: string;
}

export const SOLICITACAO_VAZIA: VisitaSolicitacao = {
  cliente: "",
  contato: "",
  endereco: "",
  referenciaLocal: "",
  vendedor: "",
  dataSugerida: null,
  descricao: "",
};

export interface Visita extends VisitaSolicitacao {
  id: string;
  numero: number;
  status: VisitaStatus;
  agendadaPara: string | null;
  responsavelId: string | null;
  responsavelNome: string;
  agendadoPorNome: string;
  vistoria: Vistoria;
  realizadaEm: string | null;
  realizadaPorNome: string;
  motivoCancelamento: string;
  createdBy: string | null;
  createdByNome: string;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  numero: number;
  cliente: string;
  contato: string;
  endereco: string;
  referencia_local: string;
  vendedor: string;
  data_sugerida: string | null;
  descricao: string;
  status: VisitaStatus;
  agendada_para: string | null;
  responsavel_id: string | null;
  responsavel_nome: string;
  agendado_por_nome: string;
  vistoria: unknown;
  realizada_em: string | null;
  realizada_por_nome: string;
  motivo_cancelamento: string;
  created_by: string | null;
  created_by_nome: string;
  created_at: string;
  updated_at: string;
}

const toVisita = (r: Row): Visita => ({
  id: r.id,
  numero: r.numero,
  cliente: r.cliente,
  contato: r.contato,
  endereco: r.endereco,
  referenciaLocal: r.referencia_local,
  vendedor: r.vendedor,
  dataSugerida: r.data_sugerida,
  descricao: r.descricao,
  status: r.status,
  agendadaPara: r.agendada_para,
  responsavelId: r.responsavel_id,
  responsavelNome: r.responsavel_nome,
  agendadoPorNome: r.agendado_por_nome,
  vistoria: normalizarVistoria(r.vistoria),
  realizadaEm: r.realizada_em,
  realizadaPorNome: r.realizada_por_nome,
  motivoCancelamento: r.motivo_cancelamento,
  createdBy: r.created_by,
  createdByNome: r.created_by_nome,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const solicitacaoRow = (s: VisitaSolicitacao) => ({
  cliente: s.cliente.trim(),
  contato: s.contato.trim(),
  endereco: s.endereco.trim(),
  referencia_local: s.referenciaLocal.trim(),
  vendedor: s.vendedor.trim(),
  data_sugerida: s.dataSugerida || null,
  descricao: s.descricao.trim(),
});

function check(s: VisitaSolicitacao) {
  if (!s.cliente.trim()) throw new Error("Informe o cliente.");
  if (!s.endereco.trim()) throw new Error("Informe o endereço da visita.");
}

async function upd(id: string, values: Record<string, unknown>) {
  const { error } = await db.from("visitas").update(values).eq("id", id);
  if (error) throw dbError(error);
}

export const visitaRepository = {
  /** Null when the table doesn't exist yet. */
  async list(): Promise<Visita[] | null> {
    const { data, error } = await db
      .from("visitas")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return null;
      throw dbError(error);
    }
    return ((data ?? []) as Row[]).map(toVisita);
  },

  async get(id: string): Promise<Visita | null> {
    const { data, error } = await db.from("visitas").select("*").eq("id", id).maybeSingle();
    if (error) throw dbError(error);
    return data ? toVisita(data as Row) : null;
  },

  async create(s: VisitaSolicitacao): Promise<Visita> {
    check(s);
    const { data, error } = await db.from("visitas").insert(solicitacaoRow(s)).select("*").single();
    if (error) throw dbError(error);
    return toVisita(data as Row);
  },

  async updateSolicitacao(id: string, s: VisitaSolicitacao): Promise<void> {
    check(s);
    await upd(id, solicitacaoRow(s));
  },

  /** PCP: date/time + who goes. */
  async agendar(id: string, agendadaPara: string, responsavelId: string): Promise<void> {
    if (!agendadaPara) throw new Error("Informe a data e a hora.");
    if (!responsavelId) throw new Error("Escolha quem vai fazer a visita.");
    await upd(id, {
      agendada_para: new Date(agendadaPara).toISOString(),
      responsavel_id: responsavelId,
      status: "agendada",
    });
  },

  async salvarVistoria(id: string, vistoria: Vistoria): Promise<void> {
    await upd(id, { vistoria });
  },

  async concluir(id: string, vistoria: Vistoria): Promise<void> {
    await upd(id, { vistoria });
    await upd(id, { status: "realizada" });
  },

  async cancelar(id: string, motivo: string): Promise<void> {
    if (!motivo.trim()) throw new Error("Informe o motivo do cancelamento.");
    await upd(id, { status: "cancelada", motivo_cancelamento: motivo.trim() });
  },

  /** PCP/gestão: back to "aguardando agenda" (e.g. after a cancellation). */
  async reabrir(id: string): Promise<void> {
    await upd(id, { status: "solicitada" });
  },

  async remove(id: string): Promise<void> {
    const { error } = await db.from("visitas").delete().eq("id", id);
    if (error) throw dbError(error);
  },
};
