import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import type { MotivoSemPedido } from "./types";
import {
  alertaPrazo,
  estimarHorasEtapa,
  rotuloVeiculo,
  type AlertaPrazo,
  type AmostraTempo,
  type Complexidade,
  type EstimativaEtapa,
  type StatusOrdem,
  type TipoOrdem,
} from "./producao-rules";
import { hojeISO, type TipoAgendamento } from "./planejamento-rules";
import { nomesDosSetores, setoresRepository } from "./cloud-setores";
import {
  inicioDoDia,
  montarEntradaSkillPcp,
  type EntradaSkillPcp,
  type OrdemSkill,
} from "./skill-pcp";
import {
  grupoDaLinha,
  ordensSemProgramacao,
  type Alocacao,
  type ImagemResumo,
  type ItemResumo,
  type LinhaProgramacao,
  type SetorProgramacao,
  type StatusProgramacao,
} from "./programacao-rules";

// The operação tables are newer than the generated database types. Each table is read on
// its own and joined here, so the screens don't depend on foreign-key names.
const db = supabase as unknown as SupabaseClient;

type Row = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === "string" ? v : "");
const txtOuNull = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
/** "numero" of an embedded one-to-one row (object or one-item array), or null. */
const numeroEmbutido = (v: unknown): number | null => {
  const r = (Array.isArray(v) ? v[0] : v) as Row | null | undefined;
  return r && r["numero"] != null ? Number(r["numero"]) : null;
};

async function rows(
  query: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw dbError(error);
  return (data ?? []) as Row[];
}

// ---------- Tipos ----------

export interface Colaborador {
  id: string;
  nome: string;
  empresa: string;
  ativo: boolean;
}

export interface Veiculo {
  id: string;
  placa: string;
  apelido: string;
  modelo: string;
  marca: string;
  ativo: boolean;
  equipeId: string | null;
  observacao: string;
  /** "Apelido — PLACA". */
  rotulo: string;
}

export interface Equipe {
  id: string;
  nome: string;
  setor: string;
  capacidade: number;
  ativo: boolean;
  colaboradores: Colaborador[];
  veiculos: Veiculo[];
}

export interface ServicoCatalogo {
  id: string;
  idSige: number;
  nome: string;
  produto: string;
  etapas: string[];
  ativo: boolean;
}

export interface Produto {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface Recursos {
  colaboradores: Colaborador[];
  veiculos: Veiculo[];
  equipes: Equipe[];
  servicos: ServicoCatalogo[];
  produtos: Produto[];
}

export interface EtapaOrdem {
  id: string;
  ordem: number;
  nome: string;
  concluido: boolean;
  concluidoEm: string | null;
  concluidoPorNome: string;
  /** Worked stretches (Iniciar → Pausar/baixa), oldest first. */
  trechos: TrechoApontado[];
  /** Learned from finished steps; null = no history yet. */
  estimativa: EstimativaEtapa | null;
}

export interface TrechoApontado {
  id: string;
  inicio: string;
  fim: string | null;
  fimTipo: "pausa" | "conclusao" | null;
  motivoPausa: string;
  pessoas: number;
  iniciadoPorNome: string;
  colaboradorIds: string[];
  colaboradores: string[];
}

export interface EventoOrdem {
  id: string;
  tipo: string;
  descricao: string;
  autor: string;
  createdAt: string;
}

export interface OrdemResumo {
  id: string;
  numero: number;
  tipo: TipoOrdem;
  status: StatusOrdem;
  prioridade: string;
  descricao: string;
  dataPrevista: string | null;
  createdAt: string;
  cadastroId: string | null;
  clienteNome: string;
  servicoNome: string;
  veiculoId: string | null;
  veiculoRotulo: string;
  localInstalacao: string;
  equipe: Colaborador[];
  etapas: { concluido: boolean }[];
}

export interface OrdemFicha extends OrdemResumo {
  complexidade: Complexidade;
  servicoId: string | null;
  vendaId: string | null;
  /** Born from this liberação (0036): the pedido can't be changed here. */
  liberacaoId: string | null;
  liberacaoNumero: number | null;
  motivoSemPedido: MotivoSemPedido | "";
  /** Checklist the steps came from (0039); null = the service's or the type's default steps. */
  checklistId: string | null;
  /** The checklist has "Parâmetros fixos": the steps can't be changed. */
  etapasFixas: boolean;
  observacao: string;
  updatedAt: string;
  etapasDetalhe: EtapaOrdem[];
  eventos: EventoOrdem[];
}

export interface OrdemDaLiberacao {
  id: string;
  numero: number;
  status: StatusOrdem;
  descricao: string;
  tipo: TipoOrdem;
  checklistId: string | null;
}

/** Default checklist of the orders of each type (0039); null = the type's default steps. */
export type ChecklistsPadrao = Record<TipoOrdem, string | null>;

export interface OrdemFiltros {
  tipo: "" | TipoOrdem;
  status: "" | StatusOrdem;
  busca: string;
}

export interface OrdensPainel {
  /** Filtered, newest first. */
  ordens: OrdemResumo[];
  alertas: (OrdemResumo & { alerta: AlertaPrazo })[];
  resumo: { aguardando: number; andamento: number; atrasadas: number; concluidas: number };
}

export interface OrdemInput {
  tipo: TipoOrdem;
  status: StatusOrdem;
  prioridade: string;
  complexidade: Complexidade;
  cadastroId: string;
  /** Pedido de venda (Comercial); "" = sem vínculo. */
  vendaId: string;
  /** Required without a pedido (new order or pedido removed). */
  motivoSemPedido: MotivoSemPedido | "";
  /** "" = the service's or the type's steps (sent in `etapas`); else the database copies the checklist. */
  checklistId: string;
  servicoId: string;
  descricao: string;
  dataPrevista: string;
  localInstalacao: string;
  veiculoId: string;
  observacao: string;
  equipe: string[];
  etapas: string[];
}

export interface Agendamento {
  id: string;
  titulo: string;
  tipo: TipoAgendamento;
  dataInicio: string;
  dataFim: string;
  horaInicio: string | null;
  horaFim: string | null;
  veiculoId: string | null;
  veiculo: Veiculo | null;
  equipeId: string | null;
  equipe: Equipe | null;
  ordemId: string | null;
  ordem: OrdemResumo | null;
  colaboradores: Colaborador[];
  observacao: string;
  imagens: ImagemResumo[];
}

export interface AgendamentoInput {
  titulo: string;
  tipo: TipoAgendamento;
  dataInicio: string;
  dataFim: string;
  horaInicio: string;
  horaFim: string;
  veiculoId: string;
  ordemId: string;
  equipeId: string;
  equipe: string[];
  observacao: string;
}

export interface ServicoProgramado {
  id: string;
  data: string;
  dataOriginal: string;
  setor: SetorProgramacao;
  cadastroId: string | null;
  cliente: string;
  produto: string;
  servico: string;
  detalhamento: string;
  pontoId: string | null;
  local: string;
  quantidade: number;
  equipeId: string | null;
  equipeNome: string;
  liderId: string | null;
  liderNome: string;
  veiculoId: string | null;
  veiculoNome: string;
  ordemId: string | null;
  ordemNumero: number | null;
  horaInicio: string | null;
  horaFim: string | null;
  status: StatusProgramacao;
  observacao: string;
  posicao: number;
  reagendamentos: number;
  conflitoConfirmado: boolean;
  ajudantes: Colaborador[];
  imagens: ImagemResumo[];
}

export interface PlanejamentoPeriodo {
  agendamentos: Agendamento[];
  /** Open orders due in the period that have no appointment yet. */
  ordensSemAgendamento: OrdemResumo[];
  /** Orders that can still be linked to an appointment. */
  ordensAbertas: OrdemResumo[];
  programacao: ServicoProgramado[];
  recursos: Recursos;
}

export interface ProgramacaoDia {
  itens: ServicoProgramado[];
  pendencias: ServicoProgramado[];
  /** Past days' services still "Programado"/"Em andamento" (nobody gave them a final status). */
  semBaixa: ServicoProgramado[];
  /** Open production orders with no service from today on and no current appointment. */
  ordensAProgramar: OrdemResumo[];
  agendamentos: Agendamento[];
  ordensAbertas: { id: string; numero: number; descricao: string }[];
  recursos: Recursos;
}

// ---------- Conversões ----------

const toColaborador = (r: Row): Colaborador => ({
  id: txt(r["id"]),
  nome: txt(r["nome"]),
  empresa: txt(r["empresa"]),
  ativo: r["ativo"] !== false,
});

const toVeiculo = (r: Row): Veiculo => {
  const v = {
    placa: txt(r["placa"]),
    apelido: txt(r["apelido"]),
    modelo: txt(r["modelo"]),
  };
  return {
    id: txt(r["id"]),
    ...v,
    marca: txt(r["marca"]),
    ativo: r["status"] === "ATIVO",
    equipeId: txtOuNull(r["equipe_id"]),
    observacao: txt(r["observacao"]),
    rotulo: rotuloVeiculo(v),
  };
};

const toServico = (r: Row): ServicoCatalogo => ({
  id: txt(r["id"]),
  idSige: num(r["id_sige"]),
  nome: txt(r["nome"]),
  produto: txt(r["produto"]),
  etapas: Array.isArray(r["etapas"])
    ? (r["etapas"] as unknown[]).filter((e): e is string => typeof e === "string")
    : [],
  ativo: r["ativo"] !== false,
});

const toProduto = (r: Row): Produto => ({
  id: txt(r["id"]),
  nome: txt(r["nome"]),
  ativo: r["ativo"] !== false,
});

const porId = <T extends { id: string }>(lista: T[]) => new Map(lista.map((x) => [x.id, x]));

async function imagensDe(
  entidade: "programacao" | "agendamento",
  ids: string[],
): Promise<Map<string, ImagemResumo[]>> {
  const mapa = new Map<string, ImagemResumo[]>();
  if (!ids.length) return mapa;
  const lista = await rows(
    db
      .from("anexos")
      .select("id, entidade_id, nome, url")
      .eq("entidade", entidade)
      .in("entidade_id", ids)
      .order("created_at"),
  );
  for (const r of lista) {
    const chave = txt(r["entidade_id"]);
    mapa.set(chave, [
      ...(mapa.get(chave) ?? []),
      { id: txt(r["id"]), nome: txt(r["nome"]), url: txt(r["url"]) },
    ]);
  }
  return mapa;
}

/** Every record (active and inactive); screens filter as needed. */
async function carregarRecursos(): Promise<Recursos> {
  const [cols, veics, eqs, eqCols, eqVeics, servs, prods] = await Promise.all([
    rows(db.from("producao_colaboradores").select("id, nome, empresa, ativo").order("nome")),
    rows(
      db
        .from("producao_veiculos")
        .select("id, placa, apelido, modelo, marca, status, equipe_id, observacao")
        .order("placa"),
    ),
    rows(
      db
        .from("producao_equipes")
        .select("id, nome, setor, capacidade_horas_dia, ativo")
        .order("setor")
        .order("nome"),
    ),
    rows(db.from("producao_equipe_colaboradores").select("equipe_id, colaborador_id")),
    rows(db.from("producao_equipe_veiculos").select("equipe_id, veiculo_id")),
    rows(
      db
        .from("producao_servicos")
        .select("id, id_sige, nome, produto, etapas, ativo")
        .order("nome"),
    ),
    rows(db.from("programacao_produtos").select("id, nome, ativo").order("nome")),
  ]);
  const colaboradores = cols.map(toColaborador);
  const veiculos = veics.map(toVeiculo);
  const colMap = porId(colaboradores);
  const veiMap = porId(veiculos);
  const equipes: Equipe[] = eqs.map((r) => {
    const id = txt(r["id"]);
    return {
      id,
      nome: txt(r["nome"]),
      setor: txt(r["setor"]),
      capacidade: num(r["capacidade_horas_dia"]),
      ativo: r["ativo"] !== false,
      colaboradores: eqCols
        .filter((x) => x["equipe_id"] === id)
        .map((x) => colMap.get(txt(x["colaborador_id"])))
        .filter((c): c is Colaborador => Boolean(c)),
      veiculos: eqVeics
        .filter((x) => x["equipe_id"] === id)
        .map((x) => veiMap.get(txt(x["veiculo_id"])))
        .filter((v): v is Veiculo => Boolean(v)),
    };
  });
  return {
    colaboradores,
    veiculos,
    equipes,
    servicos: servs.map(toServico),
    produtos: prods.map(toProduto),
  };
}

/** Light rows of orders joined with client, service, vehicle, team and steps. */
async function carregarOrdens(
  query: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
  recursos: Recursos,
): Promise<OrdemResumo[]> {
  const base = await rows(query);
  if (!base.length) return [];
  const ids = base.map((r) => txt(r["id"]));
  const cadIds = [...new Set(base.map((r) => txt(r["cadastro_id"])).filter(Boolean))];
  const [etapas, equipe, cads] = await Promise.all([
    rows(db.from("ordens_producao_etapas").select("ordem_id, concluido").in("ordem_id", ids)),
    rows(db.from("ordens_producao_equipe").select("ordem_id, colaborador_id").in("ordem_id", ids)),
    cadIds.length
      ? rows(db.from("cadastros").select("id, nome").in("id", cadIds))
      : Promise.resolve([] as Row[]),
  ]);
  const cadNome = new Map(cads.map((c) => [txt(c["id"]), txt(c["nome"])]));
  const servMap = porId(recursos.servicos);
  const veiMap = porId(recursos.veiculos);
  const colMap = porId(recursos.colaboradores);
  return base.map((r) => {
    const id = txt(r["id"]);
    const veiculoId = txtOuNull(r["veiculo_id"]);
    const cadastroId = txtOuNull(r["cadastro_id"]);
    return {
      id,
      numero: num(r["numero"]),
      tipo: r["tipo"] as TipoOrdem,
      status: r["status"] as StatusOrdem,
      prioridade: txt(r["prioridade"]),
      descricao: txt(r["descricao"]),
      dataPrevista: txtOuNull(r["data_prevista"]),
      createdAt: txt(r["created_at"]),
      cadastroId,
      clienteNome: cadastroId ? (cadNome.get(cadastroId) ?? "") : "",
      servicoNome: servMap.get(txt(r["servico_id"]))?.nome ?? "",
      veiculoId,
      veiculoRotulo: veiculoId ? (veiMap.get(veiculoId)?.rotulo ?? "") : "",
      localInstalacao: txt(r["local_instalacao"]),
      equipe: equipe
        .filter((e) => e["ordem_id"] === id)
        .map((e) => colMap.get(txt(e["colaborador_id"])))
        .filter((c): c is Colaborador => Boolean(c)),
      etapas: etapas
        .filter((e) => e["ordem_id"] === id)
        .map((e) => ({ concluido: e["concluido"] === true })),
    };
  });
}

/** Finished steps with timed work, newest first (see `amostras_tempo_etapas`, 0035). */
async function carregarAmostrasTempo(): Promise<(AmostraTempo & { etapaId: string })[]> {
  const lista = await rows(db.rpc("amostras_tempo_etapas", { limite: 2000 }));
  return lista.map((a) => ({
    etapaId: txt(a["etapa_id"]),
    servicoId: txtOuNull(a["servico_id"]),
    etapa: txt(a["etapa"]),
    complexidade: (txt(a["complexidade"]) || "Média") as Complexidade,
    concluidoEm: txtOuNull(a["concluido_em"]),
    horas: num(a["horas"]),
    maiorTrechoHoras: num(a["maior_trecho_horas"]),
  }));
}

/** `.in()` in batches, so a long id list doesn't overflow the request URL. */
async function rowsEmLotes(
  ids: string[],
  consulta: (lote: string[]) => PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>,
): Promise<Row[]> {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) lotes.push(ids.slice(i, i + 100));
  return (await Promise.all(lotes.map((l) => rows(consulta(l))))).flat();
}

async function carregarColaboradoresDosTrechos(apontamentos: Row[]): Promise<Row[]> {
  return rowsEmLotes(
    apontamentos.map((a) => txt(a["id"])),
    (lote) =>
      db
        .from("ordens_producao_apontamento_colaboradores")
        .select("apontamento_id, colaborador_id")
        .in("apontamento_id", lote),
  );
}

/** Steps of one order with their timed stretches and the learned estimate. */
function montarEtapas(
  etapas: Row[],
  apontamentos: Row[],
  apCols: Row[],
  recursos: Recursos,
  amostras: (AmostraTempo & { etapaId: string })[],
  ordem: { servicoId: string | null; complexidade: Complexidade },
): EtapaOrdem[] {
  const colMap = porId(recursos.colaboradores);
  return etapas.map((e) => ({
    id: txt(e["id"]),
    ordem: num(e["ordem"]),
    nome: txt(e["nome"]),
    concluido: e["concluido"] === true,
    concluidoEm: txtOuNull(e["concluido_em"]),
    concluidoPorNome: txt(e["concluido_por_nome"]),
    trechos: apontamentos
      .filter((a) => a["etapa_id"] === e["id"])
      .map((a) => {
        const ids = apCols
          .filter((c) => c["apontamento_id"] === a["id"])
          .map((c) => txt(c["colaborador_id"]));
        return {
          id: txt(a["id"]),
          inicio: txt(a["inicio"]),
          fim: txtOuNull(a["fim"]),
          fimTipo: (txtOuNull(a["fim_tipo"]) as TrechoApontado["fimTipo"]) ?? null,
          motivoPausa: txt(a["motivo_pausa"]),
          pessoas: num(a["pessoas"]) || 1,
          iniciadoPorNome: txt(a["iniciado_por_nome"]),
          colaboradorIds: ids,
          colaboradores: ids.map((id) => colMap.get(id)?.nome ?? "").filter(Boolean),
        };
      }),
    estimativa: estimarHorasEtapa(
      { servicoId: ordem.servicoId, etapa: txt(e["nome"]), complexidade: ordem.complexidade },
      // A step that's already finished shouldn't estimate itself.
      amostras.filter((s) => s.etapaId !== e["id"]),
    ),
  }));
}

/** Finished orders and the ones still waiting for their liberação don't go into planning. */
const ORDENS_FORA_DO_PLANEJAMENTO = '("Concluída","Cancelada","Aguardando liberação")';

const ORDEM_COLUNAS =
  "id, numero, tipo, status, prioridade, descricao, data_prevista, created_at, updated_at, cadastro_id, servico_id, veiculo_id, local_instalacao, venda_id, observacao";

async function carregarAgendamentos(
  query: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
  recursos: Recursos,
): Promise<Agendamento[]> {
  const base = await rows(query);
  if (!base.length) return [];
  const ids = base.map((r) => txt(r["id"]));
  const ordemIds = [...new Set(base.map((r) => txt(r["ordem_id"])).filter(Boolean))];
  const [membros, imagens, ordens] = await Promise.all([
    rows(
      db
        .from("planejamento_agendamento_equipe")
        .select("agendamento_id, colaborador_id")
        .in("agendamento_id", ids),
    ),
    imagensDe("agendamento", ids),
    ordemIds.length
      ? carregarOrdens(
          db.from("ordens_producao").select(ORDEM_COLUNAS).in("id", ordemIds),
          recursos,
        )
      : Promise.resolve([] as OrdemResumo[]),
  ]);
  const colMap = porId(recursos.colaboradores);
  const veiMap = porId(recursos.veiculos);
  const eqMap = porId(recursos.equipes);
  const ordMap = porId(ordens);
  return base.map((r) => {
    const id = txt(r["id"]);
    const veiculoId = txtOuNull(r["veiculo_id"]);
    const equipeId = txtOuNull(r["equipe_id"]);
    const ordemId = txtOuNull(r["ordem_id"]);
    return {
      id,
      titulo: txt(r["titulo"]),
      tipo: r["tipo"] as TipoAgendamento,
      dataInicio: txt(r["data_inicio"]),
      dataFim: txt(r["data_fim"]),
      horaInicio: txtOuNull(r["hora_inicio"]),
      horaFim: txtOuNull(r["hora_fim"]),
      veiculoId,
      veiculo: veiculoId ? (veiMap.get(veiculoId) ?? null) : null,
      equipeId,
      equipe: equipeId ? (eqMap.get(equipeId) ?? null) : null,
      ordemId,
      ordem: ordemId ? (ordMap.get(ordemId) ?? null) : null,
      colaboradores: membros
        .filter((m) => m["agendamento_id"] === id)
        .map((m) => colMap.get(txt(m["colaborador_id"])))
        .filter((c): c is Colaborador => Boolean(c)),
      observacao: txt(r["observacao"]),
      imagens: imagens.get(id) ?? [],
    };
  });
}

const SERVICO_COLUNAS =
  "id, data, data_original, setor, cadastro_id, cliente, produto, servico, detalhamento, ponto_id, local, quantidade, equipe_id, lider_id, veiculo_id, ordem_id, hora_inicio, hora_fim, status, observacao, posicao, reagendamentos, conflito_confirmado";

async function carregarServicos(
  query: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
  recursos: Recursos,
  comImagens = true,
): Promise<ServicoProgramado[]> {
  const base = await rows(query);
  if (!base.length) return [];
  const ids = base.map((r) => txt(r["id"]));
  const ordemIds = [...new Set(base.map((r) => txt(r["ordem_id"])).filter(Boolean))];
  const cadIds = [
    ...new Set(
      base
        .filter((r) => !r["cliente"])
        .map((r) => txt(r["cadastro_id"]))
        .filter(Boolean),
    ),
  ];
  const [ajudantes, imagens, ordens, cads] = await Promise.all([
    rows(
      db
        .from("programacao_servicos_ajudantes")
        .select("servico_id, colaborador_id")
        .in("servico_id", ids),
    ),
    comImagens ? imagensDe("programacao", ids) : Promise.resolve(new Map<string, ImagemResumo[]>()),
    ordemIds.length
      ? rows(db.from("ordens_producao").select("id, numero").in("id", ordemIds))
      : Promise.resolve([] as Row[]),
    cadIds.length
      ? rows(db.from("cadastros").select("id, nome").in("id", cadIds))
      : Promise.resolve([] as Row[]),
  ]);
  const colMap = porId(recursos.colaboradores);
  const veiMap = porId(recursos.veiculos);
  const eqMap = porId(recursos.equipes);
  const ordNum = new Map(ordens.map((o) => [txt(o["id"]), num(o["numero"])]));
  const cadNome = new Map(cads.map((c) => [txt(c["id"]), txt(c["nome"])]));
  return base.map((r) => {
    const id = txt(r["id"]);
    const equipeId = txtOuNull(r["equipe_id"]);
    const liderId = txtOuNull(r["lider_id"]);
    const veiculoId = txtOuNull(r["veiculo_id"]);
    const ordemId = txtOuNull(r["ordem_id"]);
    const cadastroId = txtOuNull(r["cadastro_id"]);
    return {
      id,
      data: txt(r["data"]),
      dataOriginal: txt(r["data_original"]),
      setor: r["setor"] as SetorProgramacao,
      cadastroId,
      cliente: txt(r["cliente"]) || (cadastroId ? (cadNome.get(cadastroId) ?? "") : ""),
      produto: txt(r["produto"]),
      servico: txt(r["servico"]),
      detalhamento: txt(r["detalhamento"]),
      pontoId: txtOuNull(r["ponto_id"]),
      local: txt(r["local"]),
      quantidade: num(r["quantidade"]) || 1,
      equipeId,
      equipeNome: equipeId ? (eqMap.get(equipeId)?.nome ?? "") : "",
      liderId,
      liderNome: liderId ? (colMap.get(liderId)?.nome ?? "") : "",
      veiculoId,
      veiculoNome: veiculoId ? (veiMap.get(veiculoId)?.rotulo ?? "") : "",
      ordemId,
      ordemNumero: ordemId ? (ordNum.get(ordemId) ?? null) : null,
      horaInicio: txtOuNull(r["hora_inicio"]),
      horaFim: txtOuNull(r["hora_fim"]),
      status: r["status"] as StatusProgramacao,
      observacao: txt(r["observacao"]),
      posicao: num(r["posicao"]),
      reagendamentos: num(r["reagendamentos"]),
      conflitoConfirmado: r["conflito_confirmado"] === true,
      ajudantes: ajudantes
        .filter((a) => a["servico_id"] === id)
        .map((a) => colMap.get(txt(a["colaborador_id"])))
        .filter((c): c is Colaborador => Boolean(c)),
      imagens: imagens.get(id) ?? [],
    };
  });
}

/** Grid row of a saved service. */
export function linhaDoServico(s: ServicoProgramado): LinhaProgramacao {
  return {
    chave: s.id,
    id: s.id,
    data: s.data,
    setor: s.setor,
    cadastroId: s.cadastroId ?? "",
    cliente: s.cliente,
    produto: s.produto,
    servico: s.servico,
    detalhamento: s.detalhamento,
    pontoId: s.pontoId ?? "",
    local: s.local,
    quantidade: String(s.quantidade).replace(".", ","),
    equipeId: s.equipeId ?? "",
    liderId: s.liderId ?? "",
    ajudantes: s.ajudantes.map((a) => a.id),
    veiculoId: s.veiculoId ?? "",
    ordemId: s.ordemId ?? "",
    horaInicio: s.horaInicio?.slice(0, 5) ?? "",
    horaFim: s.horaFim?.slice(0, 5) ?? "",
    status: s.status,
    observacao: s.observacao,
    conflitoConfirmado: s.conflitoConfirmado,
  };
}

/** Appointment as a resource allocation (for the shared-resource warnings). */
export function alocacaoDoAgendamento(a: Agendamento): Alocacao {
  return {
    id: `ag-${a.id}`,
    grupo: a.equipeId ? `equipe:${a.equipeId}` : `ag:${a.id}`,
    descricao: `Cronograma: ${a.titulo}`,
    dataInicio: a.dataInicio,
    dataFim: a.dataFim,
    horaInicio: a.horaInicio,
    horaFim: a.horaFim,
    colaboradores: a.colaboradores.map((c) => c.id),
    veiculoId: a.veiculoId,
  };
}

/** Item of the daily summary / WhatsApp text. */
export function itemResumoDoServico(s: ServicoProgramado): ItemResumo {
  return {
    id: s.id,
    origem: "programacao",
    equipeId: s.equipeId,
    liderId: s.liderId,
    liderNome: s.liderNome || null,
    equipeNome: s.equipeNome || null,
    ajudantesNomes: s.ajudantes.map((a) => a.nome),
    veiculoId: s.veiculoId,
    veiculoNome: s.veiculoNome || null,
    cliente: s.cliente || null,
    servico: s.servico,
    produto: s.produto || null,
    detalhamento: s.detalhamento || null,
    observacao: s.observacao || null,
    local: s.local || null,
    quantidade: s.quantidade,
    status: s.status,
    setor: s.setor,
    horaInicio: s.horaInicio,
    imagens: s.imagens,
    conflitoConfirmado: s.conflitoConfirmado,
  };
}

/** Appointment shown in the daily summary next to the programmed services. */
export function itemResumoDoAgendamento(a: Agendamento): ItemResumo {
  const nomes = a.colaboradores.map((c) => c.nome);
  return {
    id: `ag-${a.id}`,
    origem: "agendamento",
    equipeId: a.equipeId,
    equipeNome: a.equipe?.nome ?? nomes[0] ?? null,
    liderNome: null,
    ajudantesNomes: a.equipe?.nome ? nomes : nomes.slice(1),
    veiculoId: a.veiculoId,
    veiculoNome: a.veiculo?.rotulo ?? null,
    cliente: a.ordem?.clienteNome || null,
    servico: a.titulo,
    produto: null,
    detalhamento: null,
    observacao: a.observacao || null,
    local: a.ordem?.localInstalacao || null,
    quantidade: 1,
    status: "Programado",
    setor: a.equipe?.setor ?? "Agendamento",
    horaInicio: a.horaInicio,
    imagens: a.imagens,
  };
}

const linhaParaDb = (l: LinhaProgramacao, posicao: number) => ({
  id: l.id ?? "",
  data: l.data,
  setor: l.setor,
  cadastro_id: l.cadastroId,
  cliente: l.cliente,
  produto: l.produto,
  servico: l.servico,
  detalhamento: l.detalhamento,
  ponto_id: l.pontoId,
  local: l.local,
  quantidade: (l.quantidade || "1").replace(",", "."),
  equipe_id: l.equipeId,
  lider_id: l.liderId,
  ajudantes: l.ajudantes,
  veiculo_id: l.veiculoId,
  ordem_id: l.ordemId,
  hora_inicio: l.horaInicio,
  hora_fim: l.horaFim,
  status: l.status,
  observacao: l.observacao,
  posicao,
  conflito_confirmado: l.conflitoConfirmado,
});

const RESULTADO_EXCLUSAO: Record<string, string> = {
  desativado: "Já tinha histórico: foi desativado e saiu das listas.",
  excluido: "Excluído.",
};

// ---------- Repositório ----------

export const operacaoRepository = {
  recursos: carregarRecursos,

  // ----- Ordens de produção -----
  async ordens(filtros: OrdemFiltros): Promise<OrdensPainel> {
    const recursos = await carregarRecursos();
    const todas = await carregarOrdens(
      db
        .from("ordens_producao")
        .select(ORDEM_COLUNAS)
        .order("numero", { ascending: false })
        .limit(3000),
      recursos,
    );
    const hoje = new Date().toISOString().slice(0, 10);
    const termo = filtros.busca.trim().toLocaleLowerCase("pt-BR");
    const ordens = todas.filter(
      (o) =>
        (!filtros.tipo || o.tipo === filtros.tipo) &&
        (!filtros.status || o.status === filtros.status) &&
        (!termo ||
          String(o.numero) === termo ||
          [o.descricao, o.clienteNome, o.servicoNome].some((v) =>
            v.toLocaleLowerCase("pt-BR").includes(termo),
          )),
    );
    const alertas = todas
      .flatMap((o) => {
        const alerta = alertaPrazo(o.dataPrevista, o.status, hoje);
        return alerta ? [{ ...o, alerta }] : [];
      })
      .sort((a, b) => (a.dataPrevista ?? "").localeCompare(b.dataPrevista ?? ""));
    return {
      ordens,
      alertas,
      resumo: {
        aguardando: todas.filter((o) => o.status === "Aguardando").length,
        andamento: todas.filter((o) => o.status === "Em andamento").length,
        atrasadas: alertas.filter((o) => o.alerta.tipo === "atrasada").length,
        concluidas: todas.filter((o) => o.status === "Concluída").length,
      },
    };
  },

  async ordem(id: string): Promise<OrdemFicha> {
    const recursos = await carregarRecursos();
    const [lista, base, etapas, eventos, apontamentos, amostras] = await Promise.all([
      carregarOrdens(db.from("ordens_producao").select(ORDEM_COLUNAS).eq("id", id), recursos),
      rows(
        db
          .from("ordens_producao")
          .select(
            "servico_id, venda_id, observacao, updated_at, complexidade, liberacao_id, motivo_sem_pedido, checklist_id, etapas_fixas, liberacoes(numero)",
          )
          .eq("id", id),
      ),
      rows(db.from("ordens_producao_etapas").select("*").eq("ordem_id", id).order("ordem")),
      rows(
        db
          .from("ordens_producao_eventos")
          .select("*")
          .eq("ordem_id", id)
          .order("created_at", { ascending: false }),
      ),
      rows(db.from("ordens_producao_apontamentos").select("*").eq("ordem_id", id).order("inicio")),
      carregarAmostrasTempo(),
    ]);
    const resumo = lista[0];
    const extra = base[0];
    if (!resumo || !extra) throw new Error("Ordem de produção não encontrada.");
    const apCols = await carregarColaboradoresDosTrechos(apontamentos);
    const servicoId = txtOuNull(extra["servico_id"]);
    const complexidade = (txt(extra["complexidade"]) || "Média") as Complexidade;
    return {
      ...resumo,
      complexidade,
      servicoId,
      vendaId: txtOuNull(extra["venda_id"]),
      liberacaoId: txtOuNull(extra["liberacao_id"]),
      liberacaoNumero: numeroEmbutido(extra["liberacoes"]),
      motivoSemPedido: (txt(extra["motivo_sem_pedido"]) || "") as MotivoSemPedido | "",
      checklistId: txtOuNull(extra["checklist_id"]),
      etapasFixas: extra["etapas_fixas"] === true,
      observacao: txt(extra["observacao"]),
      updatedAt: txt(extra["updated_at"]),
      etapasDetalhe: montarEtapas(etapas, apontamentos, apCols, recursos, amostras, {
        servicoId,
        complexidade,
      }),
      eventos: eventos.map((e) => ({
        id: txt(e["id"]),
        tipo: txt(e["tipo"]),
        descricao: txt(e["descricao"]),
        autor: txt(e["created_by_nome"]),
        createdAt: txt(e["created_at"]),
      })),
    };
  },

  async salvarOrdem(dados: OrdemInput, id?: string): Promise<string> {
    const { data, error } = await db.rpc("salvar_ordem_producao", {
      dados: {
        tipo: dados.tipo,
        status: dados.status,
        prioridade: dados.prioridade,
        complexidade: dados.complexidade,
        cadastro_id: dados.cadastroId,
        venda_id: dados.vendaId,
        motivo_sem_pedido: dados.vendaId ? "" : dados.motivoSemPedido,
        checklist_id: dados.checklistId,
        servico_id: dados.servicoId,
        descricao: dados.descricao,
        data_prevista: dados.dataPrevista,
        local_instalacao: dados.localInstalacao,
        veiculo_id: dados.veiculoId,
        observacao: dados.observacao,
        equipe: dados.equipe,
        etapas: dados.etapas,
      },
      ...(id ? { ordem_uuid: id } : {}),
    });
    if (error) throw dbError(error);
    return data as string;
  },

  /** Orders born from a liberação (one per pedido item), in item order. */
  async ordensDaLiberacao(liberacaoId: string): Promise<OrdemDaLiberacao[]> {
    const lista = await rows(
      db
        .from("ordens_producao")
        .select("id, numero, status, descricao, tipo, checklist_id")
        .eq("liberacao_id", liberacaoId)
        .order("numero"),
    );
    return lista.map((o) => ({
      id: txt(o["id"]),
      numero: num(o["numero"]),
      status: o["status"] as StatusOrdem,
      descricao: txt(o["descricao"]),
      tipo: o["tipo"] as TipoOrdem,
      checklistId: txtOuNull(o["checklist_id"]),
    }));
  },

  /** Replaces all steps with the checklist's (null = the service's or the type's); only before the order starts. */
  async trocarChecklist(ordemId: string, checklistId: string | null): Promise<void> {
    const { error } = await db.rpc("trocar_checklist_ordem", {
      ordem_uuid: ordemId,
      checklist_uuid: checklistId,
    });
    if (error) throw dbError(error);
  },

  async checklistsPadrao(): Promise<ChecklistsPadrao> {
    const lista = await rows(db.from("ordens_checklist_padrao").select("tipo, checklist_id"));
    const padrao: ChecklistsPadrao = { Instalação: null, Impressão: null };
    for (const p of lista) {
      const tipo = p["tipo"] as TipoOrdem;
      if (tipo in padrao) padrao[tipo] = txtOuNull(p["checklist_id"]);
    }
    return padrao;
  },

  async definirChecklistPadrao(tipo: TipoOrdem, checklistId: string | null): Promise<void> {
    const { error } = await db.rpc("definir_checklist_padrao", {
      p_tipo: tipo,
      p_checklist: checklistId,
    });
    if (error) throw dbError(error);
  },

  async marcarEtapa(etapaId: string, concluida: boolean): Promise<void> {
    const { error } = await db.rpc("atualizar_etapa_producao", { etapa_uuid: etapaId, concluida });
    if (error) throw dbError(error);
  },

  /**
   * Input JSON for the PCP skill: open orders plus every order with time recorded on
   * `dataReferencia` (Brasília), the active team and what each person worked on lately.
   */
  async entradaSkillPcp(dataReferencia: string, dataProgramacao: string): Promise<EntradaSkillPcp> {
    const inicio = inicioDoDia(dataReferencia);
    const inicioISO = new Date(inicio).toISOString();
    const fimISO = new Date(inicio + 86_400_000).toISOString();
    const [recursos, setores, ativas, doDia, amostras, historico] = await Promise.all([
      carregarRecursos(),
      setoresRepository.list(),
      rows(db.from("ordens_producao").select("id").in("status", ["Aguardando", "Em andamento"])),
      rows(
        db
          .from("ordens_producao_apontamentos")
          .select("ordem_id")
          .lt("inicio", fimISO)
          .or(`fim.is.null,fim.gte."${inicioISO}"`),
      ),
      carregarAmostrasTempo(),
      rows(db.rpc("horas_colaborador_etapa", { dias: 180 })),
    ]);
    const ids = [
      ...new Set([...ativas.map((r) => txt(r["id"])), ...doDia.map((r) => txt(r["ordem_id"]))]),
    ].filter(Boolean);
    const lotes: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) lotes.push(ids.slice(i, i + 100));
    const [resumos, extras, etapas, apontamentos] = await Promise.all([
      Promise.all(
        lotes.map((l) =>
          carregarOrdens(db.from("ordens_producao").select(ORDEM_COLUNAS).in("id", l), recursos),
        ),
      ).then((r) => r.flat()),
      rowsEmLotes(ids, (l) =>
        db.from("ordens_producao").select("id, servico_id, complexidade").in("id", l),
      ),
      rowsEmLotes(ids, (l) =>
        db.from("ordens_producao_etapas").select("*").in("ordem_id", l).order("ordem"),
      ),
      rowsEmLotes(ids, (l) =>
        db.from("ordens_producao_apontamentos").select("*").in("ordem_id", l).order("inicio"),
      ),
    ]);
    const apCols = await carregarColaboradoresDosTrechos(apontamentos);
    const extraPorId = new Map(extras.map((x) => [txt(x["id"]), x]));
    const ordens: OrdemSkill[] = resumos.map((o) => {
      const extra = extraPorId.get(o.id);
      const servicoId = txtOuNull(extra?.["servico_id"]);
      const complexidade = (txt(extra?.["complexidade"]) || "Média") as Complexidade;
      return {
        numero: o.numero,
        tipo: o.tipo,
        status: o.status,
        prioridade: o.prioridade,
        complexidade,
        clienteNome: o.clienteNome,
        servicoNome: o.servicoNome,
        descricao: o.descricao,
        dataPrevista: o.dataPrevista,
        etapas: montarEtapas(
          etapas.filter((e) => e["ordem_id"] === o.id),
          apontamentos.filter((a) => a["ordem_id"] === o.id),
          apCols,
          recursos,
          amostras,
          { servicoId, complexidade },
        ),
      };
    });
    return montarEntradaSkillPcp({
      dataReferencia,
      dataProgramacao,
      agora: new Date(),
      ordens,
      colaboradores: recursos.colaboradores,
      equipes: recursos.equipes.map((e) => ({
        setor: e.setor,
        capacidade: e.capacidade,
        ativo: e.ativo,
        colaboradorIds: e.colaboradores.map((c) => c.id),
      })),
      setores: nomesDosSetores(setores),
      historico: historico.map((h) => ({
        colaboradorId: txt(h["colaborador_id"]),
        etapa: txt(h["etapa"]),
        horas: num(h["horas"]),
      })),
    });
  },

  /** Starts timing a step; no colaboradores = the order's team. */
  async iniciarEtapa(etapaId: string, colaboradores: string[] = []): Promise<void> {
    const { error } = await db.rpc("iniciar_etapa_producao", {
      etapa_uuid: etapaId,
      colaboradores: colaboradores.length ? colaboradores : null,
    });
    if (error) throw dbError(error);
  },

  async pausarEtapa(etapaId: string, motivo: string): Promise<void> {
    const { error } = await db.rpc("pausar_etapa_producao", { etapa_uuid: etapaId, motivo });
    if (error) throw dbError(error);
  },

  async excluirOrdem(id: string): Promise<void> {
    const { data, error } = await db.from("ordens_producao").delete().eq("id", id).select("id");
    if (error) throw dbError(error);
    if (!data?.length) throw new Error("Só Gestão e PCP excluem ordens.");
  },

  // ----- Planejamento (cronograma) -----
  async planejamento(inicio: string, fim: string): Promise<PlanejamentoPeriodo> {
    const recursos = await carregarRecursos();
    const [agendamentos, ordensAbertas, vinculadas, programacao] = await Promise.all([
      carregarAgendamentos(
        db
          .from("planejamento_agendamentos")
          .select("*")
          .lte("data_inicio", fim)
          .gte("data_fim", inicio)
          .order("data_inicio")
          .order("hora_inicio", { nullsFirst: true }),
        recursos,
      ),
      carregarOrdens(
        db
          .from("ordens_producao")
          .select(ORDEM_COLUNAS)
          .not("status", "in", ORDENS_FORA_DO_PLANEJAMENTO)
          .order("numero", { ascending: false })
          .limit(500),
        recursos,
      ),
      rows(db.from("planejamento_agendamentos").select("ordem_id").not("ordem_id", "is", null)),
      carregarServicos(
        db
          .from("programacao_servicos")
          .select(SERVICO_COLUNAS)
          .gte("data", inicio)
          .lte("data", fim)
          .order("data")
          .order("posicao")
          .limit(2000),
        recursos,
        false,
      ),
    ]);
    const comAgendamento = new Set(vinculadas.map((v) => txt(v["ordem_id"])));
    const livres = ordensAbertas.filter((o) => !comAgendamento.has(o.id));
    return {
      agendamentos,
      ordensAbertas: livres,
      ordensSemAgendamento: livres.filter(
        (o) => o.dataPrevista && o.dataPrevista >= inicio && o.dataPrevista <= fim,
      ),
      programacao,
      recursos,
    };
  },

  async salvarAgendamento(dados: AgendamentoInput, id?: string): Promise<string> {
    const { data, error } = await db.rpc("salvar_planejamento", {
      dados: {
        titulo: dados.titulo.trim(),
        tipo: dados.tipo,
        data_inicio: dados.dataInicio,
        data_fim: dados.dataFim,
        hora_inicio: dados.horaInicio,
        hora_fim: dados.horaFim,
        veiculo_id: dados.veiculoId,
        ordem_id: dados.ordemId,
        equipe_id: dados.equipeId,
        equipe: dados.equipe,
        observacao: dados.observacao.trim(),
      },
      ...(id ? { agendamento_uuid: id } : {}),
    });
    if (error) throw dbError(error);
    return data as string;
  },

  async excluirAgendamento(id: string): Promise<void> {
    const { error } = await db.rpc("excluir_planejamento", { agendamento_uuid: id });
    if (error) throw dbError(error);
  },

  // ----- Programação de serviços -----
  async programacao(data: string): Promise<ProgramacaoDia> {
    const recursos = await carregarRecursos();
    const hoje = hojeISO();
    const [itens, pendencias, agendamentos, ordens, semBaixa, abertas, comServico, comAgenda] =
      await Promise.all([
        carregarServicos(
          db
            .from("programacao_servicos")
            .select(SERVICO_COLUNAS)
            .eq("data", data)
            .order("setor")
            .order("posicao"),
          recursos,
        ),
        carregarServicos(
          db
            .from("programacao_servicos")
            .select(SERVICO_COLUNAS)
            .in("status", ["Não realizado", "Aguardando equipe"])
            .order("data")
            .limit(500),
          recursos,
          false,
        ),
        carregarAgendamentos(
          db
            .from("planejamento_agendamentos")
            .select("*")
            .lte("data_inicio", data)
            .gte("data_fim", data),
          recursos,
        ),
        rows(
          db
            .from("ordens_producao")
            .select("id, numero, descricao")
            .not("status", "in", ORDENS_FORA_DO_PLANEJAMENTO)
            .order("numero", { ascending: false })
            .limit(300),
        ),
        carregarServicos(
          db
            .from("programacao_servicos")
            .select(SERVICO_COLUNAS)
            .lt("data", hoje)
            .in("status", ["Programado", "Em andamento"])
            .order("data")
            .limit(500),
          recursos,
          false,
        ),
        carregarOrdens(
          db
            .from("ordens_producao")
            .select(ORDEM_COLUNAS)
            .not("status", "in", ORDENS_FORA_DO_PLANEJAMENTO)
            .order("numero", { ascending: false })
            .limit(300),
          recursos,
        ),
        rows(
          db
            .from("programacao_servicos")
            .select("ordem_id")
            .gte("data", hoje)
            .not("ordem_id", "is", null),
        ),
        rows(
          db
            .from("planejamento_agendamentos")
            .select("ordem_id")
            .gte("data_fim", hoje)
            .not("ordem_id", "is", null),
        ),
      ]);
    return {
      itens,
      pendencias,
      semBaixa,
      ordensAProgramar: ordensSemProgramacao(
        abertas,
        [...comServico, ...comAgenda].map((r) => txt(r["ordem_id"])),
      ).sort((a, b) => (a.dataPrevista ?? "9999").localeCompare(b.dataPrevista ?? "9999")),
      agendamentos,
      ordensAbertas: ordens.map((o) => ({
        id: txt(o["id"]),
        numero: num(o["numero"]),
        descricao: txt(o["descricao"]),
      })),
      recursos,
    };
  },

  /** Saves the grid (in order) and deletes the removed rows. Returns how many were saved. */
  async salvarProgramacao(linhas: LinhaProgramacao[], excluir: string[]): Promise<number> {
    const { data, error } = await db.rpc("salvar_programacao_lote", {
      linhas: linhas.map((l, i) => linhaParaDb(l, i + 1)),
      excluir,
    });
    if (error) throw dbError(error);
    return Number(data) || 0;
  },

  /** Ids of the services with this service/sector on these dates (to find rows just created). */
  async idsDosServicos(datas: string[], servico: string, setor: string): Promise<string[]> {
    const r = await rows(
      db
        .from("programacao_servicos")
        .select("id, data")
        .in("data", datas)
        .eq("servico", servico.trim())
        .eq("setor", setor)
        .order("data"),
    );
    return r.map((x) => txt(x["id"]));
  },

  /** Quick add from the service form; returns the new person's id. */
  async criarColaborador(nome: string): Promise<string> {
    const limpo = nome.trim();
    if (!limpo) throw new Error("Informe o nome do funcionário.");
    const { data, error } = await db
      .from("producao_colaboradores")
      .insert({ nome: limpo, ativo: true })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um funcionário com este nome.");
      throw dbError(error);
    }
    return txt((data as Row)["id"]);
  },

  /** Quick add from the service form; returns the new vehicle's id. */
  async criarVeiculo(placa: string, apelido: string): Promise<string> {
    const p = placa.trim().toLocaleUpperCase("pt-BR").replace(/\s+/g, "");
    if (!p) throw new Error("Informe a placa do veículo.");
    const { data, error } = await db
      .from("producao_veiculos")
      .insert({ placa: p, apelido: apelido.trim() || null, status: "ATIVO" })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um veículo com esta placa.");
      throw dbError(error);
    }
    return txt((data as Row)["id"]);
  },

  /** Moves one service (same id and links) to another date/team. */
  async reagendarServico(linha: LinhaProgramacao, posicao: number): Promise<void> {
    const { error } = await db.rpc("salvar_programacao_lote", {
      linhas: [linhaParaDb(linha, posicao)],
      excluir: [],
    });
    if (error) throw dbError(error);
  },

  async mudarStatusServico(id: string, status: StatusProgramacao): Promise<void> {
    const { error } = await db.rpc("atualizar_status_programacao", {
      servico_uuid: id,
      novo_status: status,
    });
    if (error) throw dbError(error);
  },

  /** Services and appointments already saved on these dates, for the warnings before saving. */
  async alocacoesExistentes(datas: string[], ignorarServicos: string[] = []): Promise<Alocacao[]> {
    const unicas = [...new Set(datas.filter(Boolean))].sort();
    if (!unicas.length) return [];
    const inicio = unicas[0]!;
    const fim = unicas[unicas.length - 1]!;
    const [servicos, agendamentos] = await Promise.all([
      rows(
        db
          .from("programacao_servicos")
          .select(
            "id, data, setor, servico, cliente, equipe_id, lider_id, veiculo_id, hora_inicio, hora_fim, conflito_confirmado",
          )
          .in("data", unicas),
      ),
      rows(
        db
          .from("planejamento_agendamentos")
          .select("id, titulo, equipe_id, data_inicio, data_fim, hora_inicio, hora_fim, veiculo_id")
          .lte("data_inicio", fim)
          .gte("data_fim", inicio),
      ),
    ]);
    const servIds = servicos.map((x) => txt(x["id"]));
    const agIds = agendamentos.map((x) => txt(x["id"]));
    const [ajudantes, membros] = await Promise.all([
      servIds.length
        ? rows(
            db
              .from("programacao_servicos_ajudantes")
              .select("servico_id, colaborador_id")
              .in("servico_id", servIds),
          )
        : Promise.resolve([] as Row[]),
      agIds.length
        ? rows(
            db
              .from("planejamento_agendamento_equipe")
              .select("agendamento_id, colaborador_id")
              .in("agendamento_id", agIds),
          )
        : Promise.resolve([] as Row[]),
    ]);
    const ignorar = new Set(ignorarServicos);
    return [
      ...servicos
        .filter((s) => !ignorar.has(txt(s["id"])))
        .map((s): Alocacao => {
          const id = txt(s["id"]);
          const liderId = txtOuNull(s["lider_id"]);
          return {
            id,
            grupo: grupoDaLinha({ id, equipeId: txtOuNull(s["equipe_id"]), liderId }),
            descricao: `${txt(s["setor"])}: ${txt(s["servico"])}${s["cliente"] ? ` — ${txt(s["cliente"])}` : ""}`,
            dataInicio: txt(s["data"]),
            dataFim: txt(s["data"]),
            horaInicio: txtOuNull(s["hora_inicio"]),
            horaFim: txtOuNull(s["hora_fim"]),
            colaboradores: [
              ...new Set(
                [
                  liderId,
                  ...ajudantes
                    .filter((a) => a["servico_id"] === id)
                    .map((a) => txt(a["colaborador_id"])),
                ].filter((x): x is string => Boolean(x)),
              ),
            ],
            veiculoId: txtOuNull(s["veiculo_id"]),
            confirmado: s["conflito_confirmado"] === true,
          };
        }),
      ...agendamentos.map((a): Alocacao => {
        const id = txt(a["id"]);
        return {
          id: `ag-${id}`,
          grupo: a["equipe_id"] ? `equipe:${txt(a["equipe_id"])}` : `ag:${id}`,
          descricao: `Cronograma: ${txt(a["titulo"])}`,
          dataInicio: txt(a["data_inicio"]),
          dataFim: txt(a["data_fim"]),
          horaInicio: txtOuNull(a["hora_inicio"]),
          horaFim: txtOuNull(a["hora_fim"]),
          colaboradores: membros
            .filter((m) => m["agendamento_id"] === id)
            .map((m) => txt(m["colaborador_id"])),
          veiculoId: txtOuNull(a["veiculo_id"]),
          confirmado: false,
        };
      }),
    ];
  },

  // ----- Cadastros da operação (Gestão e PCP) -----
  async salvarEquipe(
    dados: {
      nome: string;
      setor: string;
      capacidade: number;
      ativo: boolean;
      colaboradores: string[];
      veiculos: string[];
    },
    id?: string,
  ): Promise<void> {
    const { error } = await db.rpc("salvar_equipe_producao", {
      dados: {
        nome: dados.nome.trim(),
        setor: dados.setor.trim(),
        capacidade_horas_dia: dados.capacidade,
        ativo: dados.ativo,
        colaboradores: dados.colaboradores,
        veiculos: dados.veiculos,
      },
      ...(id ? { equipe_uuid: id } : {}),
    });
    if (error) throw dbError(error);
  },

  async salvarVeiculo(
    dados: {
      placa: string;
      apelido: string;
      modelo: string;
      marca: string;
      equipeId: string;
      observacao: string;
      ativo: boolean;
    },
    id?: string,
  ): Promise<void> {
    const linha = {
      placa: dados.placa,
      apelido: dados.apelido.trim() || null,
      modelo: dados.modelo.trim() || null,
      marca: dados.marca.trim() || null,
      equipe_id: dados.equipeId || null,
      observacao: dados.observacao.trim() || null,
      status: dados.ativo ? "ATIVO" : "INATIVO",
    };
    const { error } = id
      ? await db.from("producao_veiculos").update(linha).eq("id", id)
      : await db.from("producao_veiculos").insert(linha);
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um veículo com esta placa.");
      throw dbError(error);
    }
  },

  /** Returns a message: deleted, or deactivated when it has history. */
  async excluirVeiculo(id: string): Promise<string> {
    const { data, error } = await db.rpc("excluir_veiculo", { p_id: id });
    if (error) throw dbError(error);
    return RESULTADO_EXCLUSAO[String(data)] ?? "Pronto.";
  },

  async salvarColaborador(
    dados: { nome: string; empresa: string; ativo: boolean },
    id?: string,
  ): Promise<void> {
    const linha = {
      nome: dados.nome.trim(),
      empresa: dados.empresa.trim() || null,
      ativo: dados.ativo,
    };
    if (!linha.nome) throw new Error("Informe o nome do colaborador.");
    const { error } = id
      ? await db.from("producao_colaboradores").update(linha).eq("id", id)
      : await db.from("producao_colaboradores").insert(linha);
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um colaborador com este nome.");
      throw dbError(error);
    }
  },

  async excluirColaborador(id: string): Promise<string> {
    const { data, error } = await db.rpc("excluir_colaborador", { p_id: id });
    if (error) throw dbError(error);
    return RESULTADO_EXCLUSAO[String(data)] ?? "Pronto.";
  },

  async salvarProduto(dados: { nome: string; ativo: boolean }, id?: string): Promise<void> {
    const linha = { nome: dados.nome.trim(), ativo: dados.ativo };
    if (!linha.nome) throw new Error("Informe o nome do produto.");
    const { error } = id
      ? await db.from("programacao_produtos").update(linha).eq("id", id)
      : await db.from("programacao_produtos").insert(linha);
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um produto com este nome.");
      throw dbError(error);
    }
  },

  async salvarServico(
    dados: { nome: string; produto: string; ativo: boolean },
    id?: string,
  ): Promise<void> {
    const nome = dados.nome.trim();
    if (!nome) throw new Error("Informe o nome do serviço.");
    if (id) {
      const { error } = await db
        .from("producao_servicos")
        .update({ nome, produto: dados.produto.trim() || null, ativo: dados.ativo })
        .eq("id", id);
      if (error) throw dbError(error);
      return;
    }
    const { error } = await db.rpc("criar_servico_producao", {
      p_nome: nome,
      ...(dados.produto.trim() ? { p_produto: dados.produto.trim() } : {}),
    });
    if (error) throw dbError(error);
  },

  async excluirItemCatalogo(tipo: "produto" | "servico", id: string): Promise<string> {
    const { data, error } = await db.rpc("excluir_item_catalogo_programacao", {
      p_tipo: tipo,
      p_id: id,
    });
    if (error) throw dbError(error);
    return RESULTADO_EXCLUSAO[String(data)] ?? "Pronto.";
  },
};
