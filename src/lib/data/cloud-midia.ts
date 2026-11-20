import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import {
  parseCoord,
  parseMedida,
  type OcupacaoLinha,
  type PeriodoOficial,
  type PontoForm,
  type StatusOcupacao,
  type StatusPonto,
} from "./midia-rules";

// The mídia tables are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

export interface TipoMidia {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface PontoMidia {
  id: string;
  codigo: string;
  nome: string;
  tipoId: string;
  tipoNome: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  referencia: string;
  latitude: number | null;
  longitude: number | null;
  faces: number;
  iluminado: boolean;
  largura: number | null;
  altura: number | null;
  status: StatusPonto;
  observacao: string;
  updatedAt: string;
}

type Row = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === "string" ? v : "");
const numOuNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

const toPonto = (r: Row): PontoMidia => ({
  id: txt(r["id"]),
  codigo: txt(r["codigo"]),
  nome: txt(r["nome"]),
  tipoId: txt(r["tipo_id"]),
  tipoNome: txt((r["tipos_midia"] as Row | null)?.["nome"]),
  endereco: txt(r["endereco"]),
  bairro: txt(r["bairro"]),
  cidade: txt(r["cidade"]),
  estado: txt(r["estado"]).trim(),
  referencia: txt(r["referencia"]),
  latitude: numOuNull(r["latitude"]),
  longitude: numOuNull(r["longitude"]),
  faces: Number(r["faces"]) || 1,
  iluminado: Boolean(r["iluminado"]),
  largura: numOuNull(r["largura"]),
  altura: numOuNull(r["altura"]),
  status: (txt(r["status"]) || "Ativo") as StatusPonto,
  observacao: txt(r["observacao"]),
  updatedAt: txt(r["updated_at"]),
});

const COLUNAS_PONTO =
  "id, codigo, nome, tipo_id, endereco, bairro, cidade, estado, referencia, latitude, longitude, faces, iluminado, largura, altura, status, observacao, updated_at, tipos_midia(nome)";

/** Values the form sends (the SIGE columns are never sent). */
function linhaDoForm(f: PontoForm) {
  const lat = parseCoord(f.latitude, "lat");
  const lng = parseCoord(f.longitude, "lng");
  const medida = (v: string) => {
    const m = parseMedida(v);
    return typeof m === "number" ? m : null;
  };
  return {
    codigo: f.codigo.trim() || null,
    nome: f.nome.trim(),
    tipo_id: f.tipoId,
    endereco: f.endereco.trim() || null,
    bairro: f.bairro.trim() || null,
    cidade: f.cidade.trim() || null,
    estado: f.estado.trim().toUpperCase() || null,
    referencia: f.referencia.trim() || null,
    latitude: typeof lat === "number" ? lat : null,
    longitude: typeof lng === "number" ? lng : null,
    faces: Math.max(1, parseInt(f.faces, 10) || 1),
    iluminado: f.iluminado,
    largura: medida(f.largura),
    altura: medida(f.altura),
    status: f.status,
    observacao: f.observacao.trim() || null,
  };
}

export const midiaRepository = {
  async tipos(): Promise<TipoMidia[]> {
    const { data, error } = await db.from("tipos_midia").select("id, nome, ativo").order("nome");
    if (error) throw dbError(error);
    return (data ?? []).map((t: Row) => ({
      id: txt(t["id"]),
      nome: txt(t["nome"]),
      ativo: Boolean(t["ativo"]),
    }));
  },

  /** Gestão only (database rule). */
  async criarTipo(nome: string): Promise<void> {
    const { error } = await db.from("tipos_midia").insert({ nome: nome.trim() });
    if (error) throw error.code === "23505" ? new Error("Esse tipo já existe.") : dbError(error);
  },

  /** A type in use is deactivated instead (it stays on the points that have it). */
  async removerTipo(id: string): Promise<"excluido" | "desativado"> {
    const { error } = await db.from("tipos_midia").delete().eq("id", id);
    if (!error) return "excluido";
    if (error.code !== "23503") throw dbError(error);
    const r = await db.from("tipos_midia").update({ ativo: false }).eq("id", id);
    if (r.error) throw dbError(r.error);
    return "desativado";
  },

  async reativarTipo(id: string): Promise<void> {
    const { error } = await db.from("tipos_midia").update({ ativo: true }).eq("id", id);
    if (error) throw dbError(error);
  },

  /** Every point (a few hundred), ordered by name. */
  async pontos(): Promise<PontoMidia[]> {
    const { data, error } = await db
      .from("pontos_midia")
      .select(COLUNAS_PONTO)
      .order("nome")
      .limit(5000);
    if (error) throw dbError(error);
    return (data ?? []).map(toPonto);
  },

  async ponto(id: string): Promise<PontoMidia> {
    const { data, error } = await db
      .from("pontos_midia")
      .select(COLUNAS_PONTO)
      .eq("id", id)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new Error("Ponto não encontrado.");
    return toPonto(data as Row);
  },

  /** Creates (no id) or updates; returns the id. */
  async salvarPonto(f: PontoForm, id?: string): Promise<string> {
    const linha = linhaDoForm(f);
    const r = id
      ? await db.from("pontos_midia").update(linha).eq("id", id).select("id").maybeSingle()
      : await db.from("pontos_midia").insert(linha).select("id").maybeSingle();
    if (r.error) {
      if (r.error.code === "23505") throw new Error("Já existe um ponto com esse código.");
      throw dbError(r.error);
    }
    if (!r.data) throw new Error("Você não tem permissão para alterar pontos de mídia.");
    return txt((r.data as Row)["id"]);
  },

  /** Gestão only (database rule). Photos' records go with it; the files stay on Drive. */
  async excluirPonto(id: string): Promise<void> {
    const { data, error } = await db.from("pontos_midia").delete().eq("id", id).select("id");
    if (error) throw dbError(error);
    if (!data?.length) throw new Error("Só a gestão exclui pontos.");
  },

  async calendario(): Promise<PeriodoOficial[]> {
    const { data, error } = await db
      .from("calendario_bissemanas")
      .select("ano, numero, codigo_sige, inicio, fim")
      .order("inicio");
    if (error) throw dbError(error);
    return (data ?? []).map((b: Row) => ({
      ano: Number(b["ano"]),
      numero: Number(b["numero"]),
      codigoSige: Number(b["codigo_sige"]),
      inicio: txt(b["inicio"]),
      fim: txt(b["fim"]),
    }));
  },

  /** Occupancy of a year; with `pontoId`, only that point. */
  async ocupacao(ano: number, pontoId?: string): Promise<OcupacaoLinha[]> {
    let q = db
      .from("pontos_ocupacao")
      .select("ponto_id, bissemana, status, cliente")
      .eq("ano", ano);
    if (pontoId) q = q.eq("ponto_id", pontoId);
    const { data, error } = await q.limit(20000);
    if (error) throw dbError(error);
    return (data ?? []).map((o: Row) => ({
      pontoId: txt(o["ponto_id"]),
      bissemana: Number(o["bissemana"]),
      status: txt(o["status"]),
      cliente: txt(o["cliente"]) || null,
    }));
  },

  /** Comercial and Gestão (database rule). "Livre" removes the mark. */
  async marcarOcupacao(
    pontoId: string,
    ano: number,
    bissemana: number,
    status: StatusOcupacao,
    cliente: string,
  ): Promise<void> {
    const { error } = await db.rpc("marcar_ocupacao", {
      p_ponto: pontoId,
      p_ano: ano,
      p_bissemana: bissemana,
      p_status: status,
      p_cliente: cliente,
    });
    if (error) throw dbError(error);
  },
};
