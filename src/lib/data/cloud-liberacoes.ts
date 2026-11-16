import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { LiberacaoRepository } from "./repositories";
import type {
  Liberacao,
  LiberacaoEvento,
  LiberacaoInput,
  LiberacaoItem,
  LiberacaoModelo,
  LiberacaoStatus,
} from "./types";
import { dbError } from "./db-errors";
import { isBlankLiberacaoItem } from "./rules";

// The liberação tables are newer than the generated database types, so this module
// talks to them through an untyped client and maps rows by hand.
const db = supabase as unknown as SupabaseClient;

const SELECT = `id, modelo, numero, cliente, responsavel, contato, endereco, projetista, vendedor,
  classificacao_venda, data_liberacao, data_entrega, bissemana, ponto_energia, horario_instalacao,
  observacoes, status, enviada_em, motivo_reprovacao, decidido_por_nome, decidido_em, project_id,
  created_at, updated_at,
  liberacao_itens(id, position, referencia, servico, insumos, acabamento, instalacao, detalhes,
    largura_cm, altura_cm, quantidade, local_instalacao)`;

interface ItemRow {
  id: string;
  position: number;
  referencia: string;
  servico: string;
  insumos: string;
  acabamento: string;
  instalacao: string;
  detalhes: string;
  largura_cm: number | string | null;
  altura_cm: number | string | null;
  quantidade: number | string | null;
  local_instalacao: string;
}

interface Row {
  id: string;
  modelo: LiberacaoModelo;
  numero: number;
  cliente: string;
  responsavel: string;
  contato: string;
  endereco: string;
  projetista: string;
  vendedor: string;
  classificacao_venda: string;
  data_liberacao: string | null;
  data_entrega: string | null;
  bissemana: string;
  ponto_energia: string;
  horario_instalacao: string;
  observacoes: string;
  status: LiberacaoStatus;
  enviada_em: string;
  motivo_reprovacao: string;
  decidido_por_nome: string;
  decidido_em: string | null;
  project_id: string | null;
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
    responsavel: row.responsavel,
    contato: row.contato,
    endereco: row.endereco,
    projetista: row.projetista,
    vendedor: row.vendedor,
    classificacaoVenda: row.classificacao_venda,
    dataLiberacao: row.data_liberacao,
    dataEntrega: row.data_entrega,
    bissemana: row.bissemana,
    pontoEnergia: row.ponto_energia,
    horarioInstalacao: row.horario_instalacao,
    observacoes: row.observacoes,
    status: row.status,
    enviadaEm: row.enviada_em,
    motivoReprovacao: row.motivo_reprovacao,
    decididoPorNome: row.decidido_por_nome,
    decididoEm: row.decidido_em,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itens: [...(row.liberacao_itens ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((i): LiberacaoItem => ({
        id: i.id,
        referencia: i.referencia,
        servico: i.servico,
        insumos: i.insumos,
        acabamento: i.acabamento,
        instalacao: i.instalacao,
        detalhes: i.detalhes,
        larguraCm: num(i.largura_cm),
        alturaCm: num(i.altura_cm),
        quantidade: num(i.quantidade),
        localInstalacao: i.local_instalacao,
      })),
  };
}

function headerRow(input: LiberacaoInput) {
  const projeto = input.modelo === "projeto";
  const row: Record<string, unknown> = {
    modelo: input.modelo,
    cliente: input.cliente.trim(),
    responsavel: input.responsavel.trim(),
    contato: input.contato.trim(),
    endereco: input.endereco.trim(),
    projetista: input.projetista.trim(),
    vendedor: input.vendedor.trim(),
    classificacao_venda: input.classificacaoVenda.trim(),
    data_liberacao: input.dataLiberacao || null,
    data_entrega: input.dataEntrega || null,
    bissemana: projeto ? "" : input.bissemana.trim(),
    ponto_energia: projeto ? input.pontoEnergia.trim() : "",
    horario_instalacao: projeto ? input.horarioInstalacao.trim() : "",
    observacoes: input.observacoes.trim(),
  };
  if (input.numero !== null) row["numero"] = input.numero;
  return row;
}

function friendly(error: { message: string; code?: string }): Error {
  if (error.code === "23505") return new Error("Já existe uma liberação com este número.");
  if (error.code === "P0001") return new Error(error.message);
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
    referencia: i.referencia.trim(),
    servico: i.servico.trim(),
    insumos: i.insumos.trim(),
    acabamento: i.acabamento.trim(),
    instalacao: i.instalacao.trim(),
    detalhes: i.detalhes.trim(),
    largura_cm: i.larguraCm,
    altura_cm: i.alturaCm,
    quantidade: i.quantidade,
    local_instalacao: i.localInstalacao.trim(),
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

  async aprovar(id, projectId) {
    const { error } = await db
      .from("liberacoes")
      .update({ status: "aprovada", project_id: projectId })
      .eq("id", id);
    if (error) throw friendly(error);
  },

  async reprovar(id, motivo) {
    const clean = motivo.trim();
    if (!clean) throw new Error("Informe o motivo da reprovação.");
    const { error } = await db
      .from("liberacoes")
      .update({ status: "reprovada", motivo_reprovacao: clean })
      .eq("id", id);
    if (error) throw friendly(error);
  },

  async eventos(id) {
    const { data, error } = await db
      .from("liberacao_eventos")
      .select("id, tipo, detalhe, autor_nome, created_at")
      .eq("liberacao_id", id)
      .order("created_at", { ascending: true });
    if (error) throw friendly(error);
    return (
      (data ?? []) as {
        id: string;
        tipo: LiberacaoEvento["tipo"];
        detalhe: string;
        autor_nome: string;
        created_at: string;
      }[]
    ).map((e) => ({
      id: e.id,
      tipo: e.tipo,
      detalhe: e.detalhe,
      autorNome: e.autor_nome,
      createdAt: e.created_at,
    }));
  },

  async remove(id) {
    const { error } = await db.from("liberacoes").delete().eq("id", id);
    if (error) throw friendly(error);
  },
};
