import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import type { VinhetaTipo } from "./paineis-rules";
import { localToday } from "./rules";

// The CI tables are newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

/** Tipos a CI can carry (a blocked slot is never sold). */
export type CiTipo = Exclude<VinhetaTipo, "indisponivel">;

export type CiPainelStatus = "pendente" | "aprovada" | "recusada";

export interface CiMovel {
  modalidade: "" | "convencional" | "exclusivo" | "evento";
  endereco: string;
  responsavel: string;
  somMicrofone: string;
  palcoEscada: string;
  suporteCaixas: string;
  caboEnergia: string;
}

export const CI_MOVEL_VAZIO: CiMovel = {
  modalidade: "",
  endereco: "",
  responsavel: "",
  somMicrofone: "",
  palcoEscada: "",
  suporteCaixas: "",
  caboEnergia: "",
};

export interface CiInput {
  /** YYYY-MM-DD. */
  data: string;
  representanteNome: string;
  cliente: string;
  titulo: string;
  tipo: CiTipo;
  inicio: string | null;
  fim: string | null;
  recebimento: string;
  responsavelInsercaoNome: string;
  observacao: string;
  movel: CiMovel;
  /** Panels the vinheta goes on. */
  painelIds: string[];
}

export interface CiPainel {
  id: string;
  ciId: string;
  painelId: string;
  status: CiPainelStatus;
  posicao: number | null;
  renovacao: boolean;
  motivo: string;
  decididoPorNome: string;
  decididoEm: string | null;
}

export type CiFotoStatus = "pendente" | "enviada" | "cancelada";

/** A request for the checking fotográfico to photograph the vinheta on the panels. */
export interface CiFotoPedido {
  id: string;
  status: CiFotoStatus;
  observacao: string;
  pedidoPorId: string | null;
  pedidoPorNome: string;
  pedidoEm: string;
  atendidoPorNome: string;
  atendidoEm: string | null;
}

export interface Ci extends Omit<CiInput, "painelIds"> {
  id: string;
  numero: number;
  /** "10/Nov" — how the spreadsheet and the panels show it. */
  rotulo: string;
  paineis: CiPainel[];
  /** Photo requests, newest first (empty before migration 0016). */
  fotoPedidos: CiFotoPedido[];
  createdBy: string | null;
  createdByNome: string;
  createdAt: string;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Same as the database's ci_rotulo(): "10/Nov". */
export function ciRotulo(numero: number, data: string): string {
  const mes = Number(data.slice(5, 7));
  return `${String(numero).padStart(2, "0")}/${MESES[mes - 1] ?? "?"}`;
}

/** Pendente while any panel waits; then concluída (some may have been refused). */
export function ciSituacao(ci: Pick<Ci, "paineis">): "aguardando" | "parcial" | "concluida" {
  const pendentes = ci.paineis.filter((p) => p.status === "pendente").length;
  if (pendentes === 0) return "concluida";
  return pendentes === ci.paineis.length ? "aguardando" : "parcial";
}

/** Nothing decided yet: the CI can still be edited or deleted. */
export const ciEditavel = (ci: Pick<Ci, "paineis">) =>
  ci.paineis.every((p) => p.status === "pendente");

interface CiPainelRow {
  id: string;
  ci_id: string;
  painel_id: string;
  status: CiPainelStatus;
  posicao: number | null;
  renovacao: boolean;
  motivo: string;
  decidido_por_nome: string;
  decidido_em: string | null;
}

interface CiRow {
  id: string;
  numero: number;
  data: string;
  representante_nome: string;
  cliente: string;
  titulo: string;
  tipo: CiTipo;
  inicio: string | null;
  fim: string | null;
  recebimento: string;
  responsavel_insercao_nome: string;
  observacao: string;
  movel: {
    modalidade?: string;
    endereco?: string;
    responsavel?: string;
    som_microfone?: string;
    palco_escada?: string;
    suporte_caixas?: string;
    cabo_energia?: string;
  } | null;
  created_by: string | null;
  created_by_nome: string;
  created_at: string;
  ci_paineis?: CiPainelRow[];
  ci_fotos_pedidos?: CiFotoPedidoRow[];
}

const toCiPainel = (r: CiPainelRow): CiPainel => ({
  id: r.id,
  ciId: r.ci_id,
  painelId: r.painel_id,
  status: r.status,
  posicao: r.posicao,
  renovacao: r.renovacao,
  motivo: r.motivo,
  decididoPorNome: r.decidido_por_nome,
  decididoEm: r.decidido_em,
});

const toMovel = (m: CiRow["movel"]): CiMovel => ({
  modalidade: (m?.modalidade as CiMovel["modalidade"]) ?? "",
  endereco: m?.endereco ?? "",
  responsavel: m?.responsavel ?? "",
  somMicrofone: m?.som_microfone ?? "",
  palcoEscada: m?.palco_escada ?? "",
  suporteCaixas: m?.suporte_caixas ?? "",
  caboEnergia: m?.cabo_energia ?? "",
});

const toCi = (r: CiRow): Ci => ({
  id: r.id,
  numero: r.numero,
  rotulo: ciRotulo(r.numero, r.data),
  data: r.data,
  representanteNome: r.representante_nome,
  cliente: r.cliente,
  titulo: r.titulo,
  tipo: r.tipo,
  inicio: r.inicio,
  fim: r.fim,
  recebimento: r.recebimento,
  responsavelInsercaoNome: r.responsavel_insercao_nome,
  observacao: r.observacao,
  movel: toMovel(r.movel),
  paineis: (r.ci_paineis ?? []).map(toCiPainel),
  fotoPedidos: (r.ci_fotos_pedidos ?? [])
    .map((f): CiFotoPedido => ({
      id: f.id,
      status: f.status,
      observacao: f.observacao,
      pedidoPorId: f.pedido_por,
      pedidoPorNome: f.pedido_por_nome,
      pedidoEm: f.pedido_em,
      atendidoPorNome: f.atendido_por_nome,
      atendidoEm: f.atendido_em,
    }))
    .sort((a, b) => b.pedidoEm.localeCompare(a.pedidoEm)),
  createdBy: r.created_by,
  createdByNome: r.created_by_nome,
  createdAt: r.created_at,
});

function toDados(i: CiInput) {
  return {
    data: i.data,
    representante_nome: i.representanteNome.trim(),
    cliente: i.cliente.trim(),
    titulo: i.titulo.trim(),
    tipo: i.tipo,
    inicio: i.inicio || "",
    fim: i.fim || "",
    recebimento: i.recebimento.trim(),
    responsavel_insercao_nome: i.responsavelInsercaoNome.trim(),
    observacao: i.observacao.trim(),
    movel: {
      modalidade: i.movel.modalidade,
      endereco: i.movel.endereco.trim(),
      responsavel: i.movel.responsavel.trim(),
      som_microfone: i.movel.somMicrofone,
      palco_escada: i.movel.palcoEscada,
      suporte_caixas: i.movel.suporteCaixas,
      cabo_energia: i.movel.caboEnergia,
    },
  };
}

function check(i: CiInput) {
  if (!i.cliente.trim()) throw new Error("Informe o cliente.");
  if (i.painelIds.length === 0) throw new Error("Marque pelo menos um painel.");
  if (i.inicio && i.fim && i.fim < i.inicio) throw new Error("O fim não pode ser antes do início.");
}

interface CiFotoPedidoRow {
  id: string;
  status: CiFotoStatus;
  observacao: string;
  pedido_por: string | null;
  pedido_por_nome: string;
  pedido_em: string;
  atendido_por_nome: string;
  atendido_em: string | null;
}

const SELECT = "*, ci_paineis(*), ci_fotos_pedidos(*)";
// Before migration 0016 the photo table doesn't exist: read the CI without it.
const SELECT_SEM_FOTO = "*, ci_paineis(*)";
const semRelacao = (code?: string) => code === "PGRST200" || code === "42P01";
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

export const ciRepository = {
  /** Null when the database update (0013) hasn't been run yet. */
  async list(): Promise<Ci[] | null> {
    const query = (cols: string) =>
      db
        .from("cis")
        .select(cols)
        .order("data", { ascending: false })
        .order("numero", { ascending: false });
    let { data, error } = await query(SELECT);
    if (error && semRelacao(error.code)) ({ data, error } = await query(SELECT_SEM_FOTO));
    if (error) {
      if (missingTable(error.code)) return null;
      throw dbError(error);
    }
    return ((data ?? []) as unknown as CiRow[]).map(toCi);
  },

  async get(id: string): Promise<Ci | null> {
    const query = (cols: string) => db.from("cis").select(cols).eq("id", id).maybeSingle();
    let { data, error } = await query(SELECT);
    if (error && semRelacao(error.code)) ({ data, error } = await query(SELECT_SEM_FOTO));
    if (error) throw dbError(error);
    return data ? toCi(data as unknown as CiRow) : null;
  },

  /** Creates (id null) or edits a CI; returns its id. */
  async salvar(id: string | null, input: CiInput): Promise<string> {
    check(input);
    const { data, error } = await db.rpc("salvar_ci", {
      _id: id,
      _dados: toDados(input),
      _paineis: input.painelIds,
    });
    if (error) throw dbError(error);
    return data as string;
  },

  async excluir(id: string): Promise<void> {
    const { error } = await db.rpc("excluir_ci", { _id: id });
    if (error) throw dbError(error);
  },

  /** Criação: puts the vinheta on the panel (lowest free slot, or renews it). Returns the slot. */
  async aprovar(ciPainelId: string): Promise<number> {
    const { data, error } = await db.rpc("aprovar_ci_painel", { _ci_painel_id: ciPainelId });
    if (error) throw dbError(error);
    return data as number;
  },

  /** Asks the checking fotográfico for photos of the vinheta on the panels. */
  async solicitarFoto(ciId: string, observacao: string): Promise<void> {
    const { error } = await db.rpc("solicitar_foto_ci", {
      _ci_id: ciId,
      _observacao: observacao.trim(),
    });
    if (error) throw dbError(error);
  },

  /** Checking: photos are up, close the request (at least one photo is required). */
  async concluirFoto(pedidoId: string): Promise<void> {
    const { error } = await db.rpc("concluir_foto_ci", { _pedido_id: pedidoId });
    if (error) throw dbError(error);
  },

  async cancelarFoto(pedidoId: string): Promise<void> {
    const { error } = await db.rpc("cancelar_foto_ci", { _pedido_id: pedidoId });
    if (error) throw dbError(error);
  },

  async recusar(ciPainelId: string, motivo: string): Promise<void> {
    if (!motivo.trim()) throw new Error("Diga o motivo da recusa.");
    const { error } = await db.rpc("recusar_ci_painel", {
      _ci_painel_id: ciPainelId,
      _motivo: motivo.trim(),
    });
    if (error) throw dbError(error);
  },
};

/** Empty CI form (today's date). */
export function ciVazia(representanteNome = ""): CiInput {
  return {
    data: localToday(),
    representanteNome,
    cliente: "",
    titulo: "",
    tipo: "venda",
    inicio: null,
    fim: null,
    recebimento: "Normal",
    responsavelInsercaoNome: "",
    observacao: "",
    movel: CI_MOVEL_VAZIO,
    painelIds: [],
  };
}

/** The open photo request of a CI, if any. */
export const fotoPendente = (ci: Pick<Ci, "fotoPedidos">) =>
  ci.fotoPedidos.find((f) => f.status === "pendente") ?? null;

/** Comercial, criação and gestão ask for photos (also enforced in the database). */
export function canPedirFoto(user: { funcoes: readonly string[] } | null | undefined) {
  return Boolean(user && user.funcoes.some((f) => ["gestor", "comercial", "criacao"].includes(f)));
}

/** Checking fotográfico and gestão take the photos (also enforced in the database). */
export function canFazerChecking(user: { funcoes: readonly string[] } | null | undefined) {
  return Boolean(user && user.funcoes.some((f) => f === "gestor" || f === "checking"));
}

/** Comercial and gestão create CIs (also enforced in the database). */
export function canCriarCi(user: { funcoes: readonly string[] } | null | undefined) {
  return Boolean(user && user.funcoes.some((f) => f === "gestor" || f === "comercial"));
}
