import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { LiberacaoRepository } from "./repositories";
import type { Liberacao, LiberacaoInput, LiberacaoItem, LiberacaoModelo } from "./types";
import { dbError } from "./db-errors";
import { isBlankLiberacaoItem } from "./rules";

// The liberação tables are newer than the generated database types, so this module
// talks to them through an untyped client and maps rows by hand.
const db = supabase as unknown as SupabaseClient;

const SELECT = `id, modelo, numero, cliente, vendedor, projetista, data_liberacao, data_entrega,
  responsavel, telefone, endereco, bissemana, numero_placa, created_at, updated_at,
  liberacao_itens(id, position, servico, material, acabamento, instalacao, detalhes,
    largura_cm, altura_cm, checked)`;

interface ItemRow {
  id: string;
  position: number;
  servico: string;
  material: string;
  acabamento: string;
  instalacao: string;
  detalhes: string;
  largura_cm: number | string | null;
  altura_cm: number | string | null;
  checked: boolean;
}

interface Row {
  id: string;
  modelo: LiberacaoModelo;
  numero: number;
  cliente: string;
  vendedor: string;
  projetista: string;
  data_liberacao: string | null;
  data_entrega: string | null;
  responsavel: string;
  telefone: string;
  endereco: string;
  bissemana: string;
  numero_placa: string;
  created_at: string;
  updated_at: string;
  liberacao_itens: ItemRow[] | null;
}

const num = (v: number | string | null) => (v === null || v === "" ? null : Number(v));

function toLiberacao(row: Row): Liberacao {
  return {
    id: row.id,
    modelo: row.modelo,
    numero: row.numero,
    cliente: row.cliente,
    vendedor: row.vendedor,
    projetista: row.projetista,
    dataLiberacao: row.data_liberacao,
    dataEntrega: row.data_entrega,
    responsavel: row.responsavel,
    telefone: row.telefone,
    endereco: row.endereco,
    bissemana: row.bissemana,
    numeroPlaca: row.numero_placa,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itens: [...(row.liberacao_itens ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i): LiberacaoItem => ({
        id: i.id,
        servico: i.servico,
        material: i.material,
        acabamento: i.acabamento,
        instalacao: i.instalacao,
        detalhes: i.detalhes,
        larguraCm: num(i.largura_cm),
        alturaCm: num(i.altura_cm),
        checked: i.checked,
      })),
  };
}

function headerRow(input: LiberacaoInput) {
  const projeto = input.modelo === "projeto";
  const row: Record<string, unknown> = {
    modelo: input.modelo,
    cliente: input.cliente.trim(),
    vendedor: input.vendedor.trim(),
    projetista: input.projetista.trim(),
    data_liberacao: input.dataLiberacao || null,
    data_entrega: input.dataEntrega || null,
    responsavel: projeto ? input.responsavel.trim() : "",
    telefone: projeto ? input.telefone.trim() : "",
    endereco: projeto ? input.endereco.trim() : "",
    bissemana: projeto ? "" : input.bissemana.trim(),
    numero_placa: projeto ? "" : input.numeroPlaca.trim(),
  };
  if (input.numero !== null) row["numero"] = input.numero;
  return row;
}

function friendly(error: { message: string; code?: string }): Error {
  if (error.code === "23505") return new Error("Já existe uma liberação com este número.");
  if (error.code === "42P01" || error.code === "PGRST205") {
    return new Error("As liberações ainda não foram ativadas no banco de dados.");
  }
  return dbError(error);
}

async function saveItems(liberacaoId: string, itens: LiberacaoItem[]): Promise<void> {
  const kept = itens.filter((i) => !isBlankLiberacaoItem(i));
  const keepIds = kept.map((i) => i.id).filter((id): id is string => Boolean(id));

  // Remove rows that were deleted in the editor.
  let del = db.from("liberacao_itens").delete().eq("liberacao_id", liberacaoId);
  if (keepIds.length) del = del.not("id", "in", `(${keepIds.join(",")})`);
  const removed = await del;
  if (removed.error) throw friendly(removed.error);

  const rows = kept.map((i, position) => ({
    ...(i.id ? { id: i.id } : {}),
    liberacao_id: liberacaoId,
    position,
    servico: i.servico.trim(),
    material: i.material.trim(),
    acabamento: i.acabamento.trim(),
    instalacao: i.instalacao.trim(),
    detalhes: i.detalhes.trim(),
    largura_cm: i.larguraCm,
    altura_cm: i.alturaCm,
    checked: i.checked,
  }));
  const existing = rows.filter((r) => "id" in r);
  const fresh = rows.filter((r) => !("id" in r));
  if (existing.length) {
    const { error } = await db.from("liberacao_itens").upsert(existing);
    if (error) throw friendly(error);
  }
  if (fresh.length) {
    const { error } = await db.from("liberacao_itens").insert(fresh);
    if (error) throw friendly(error);
  }
}

export const cloudLiberacaoRepository: LiberacaoRepository = {
  async list() {
    const { data, error } = await db
      .from("liberacoes")
      .select(SELECT)
      .order("numero", { ascending: false });
    if (error) throw friendly(error);
    return ((data ?? []) as Row[]).map(toLiberacao);
  },

  async get(id) {
    const { data, error } = await db.from("liberacoes").select(SELECT).eq("id", id).maybeSingle();
    if (error) throw friendly(error);
    return data ? toLiberacao(data as Row) : null;
  },

  async nextNumero() {
    const { data, error } = await db
      .from("liberacoes")
      .select("numero")
      .order("numero", { ascending: false })
      .limit(1);
    if (error) throw friendly(error);
    const last = (data as { numero: number }[] | null)?.[0]?.numero ?? 0;
    return last + 1;
  },

  async create(input) {
    if (!input.cliente.trim()) throw new Error("Informe o nome do cliente.");
    const { data, error } = await db
      .from("liberacoes")
      .insert(headerRow(input))
      .select("id")
      .single();
    if (error) throw friendly(error);
    const id = (data as { id: string }).id;
    await saveItems(id, input.itens);
    const created = await this.get(id);
    if (!created) throw new Error("Registro não encontrado.");
    return created;
  },

  async update(id, input) {
    if (!input.cliente.trim()) throw new Error("Informe o nome do cliente.");
    const { error } = await db.from("liberacoes").update(headerRow(input)).eq("id", id);
    if (error) throw friendly(error);
    await saveItems(id, input.itens);
    const updated = await this.get(id);
    if (!updated) throw new Error("Registro não encontrado.");
    return updated;
  },

  async remove(id) {
    const { error } = await db.from("liberacoes").delete().eq("id", id);
    if (error) throw friendly(error);
  },
};
