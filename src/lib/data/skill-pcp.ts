/**
 * Input JSON for the PCP skill (claude.ai "skill-pcp"): the open orders with their steps, the
 * day's time records and the team. Pure: the repository loads the data
 * (`operacaoRepository.entradaSkillPcp`). Tested in skill-pcp.test.ts.
 */
import {
  normalizarEtapa,
  progressoEtapa,
  situacaoEtapa,
  type BaseEstimativa,
  type Complexidade,
  type EstimativaEtapa,
  type SituacaoEtapa,
} from "./producao-rules";

/** Brasília has no daylight saving time since 2019. */
export const FUSO_PCP = "-03:00";
/** When a colaborador isn't in any team, a normal workday is assumed. */
export const HORAS_DIA_PADRAO = 8;
/** How many of a person's most-worked steps count as their specialities. */
export const MAX_ESPECIALIDADES = 6;

export interface TrechoSkill {
  inicio: string;
  fim: string | null;
  fimTipo: "pausa" | "conclusao" | null;
  motivoPausa: string;
  pessoas: number;
  iniciadoPorNome: string;
  colaboradorIds: string[];
}

export interface EtapaSkill {
  ordem: number;
  nome: string;
  concluido: boolean;
  concluidoEm: string | null;
  trechos: TrechoSkill[];
  estimativa: EstimativaEtapa | null;
}

export interface OrdemSkill {
  numero: number;
  tipo: string;
  status: string;
  prioridade: string;
  complexidade: Complexidade;
  clienteNome: string;
  servicoNome: string;
  descricao: string;
  dataPrevista: string | null;
  etapas: EtapaSkill[];
}

export interface DadosSkillPcp {
  dataReferencia: string;
  dataProgramacao: string;
  agora: Date;
  ordens: OrdemSkill[];
  colaboradores: { id: string; nome: string; ativo: boolean }[];
  equipes: { setor: string; capacidade: number; ativo: boolean; colaboradorIds: string[] }[];
  /** Production sector names, in list order. */
  setores: string[];
  /** Hours each person worked per step recently (`horas_colaborador_etapa`). */
  historico: { colaboradorId: string; etapa: string; horas: number }[];
}

const SITUACAO_JSON: Record<SituacaoEtapa, string> = {
  Pendente: "pendente",
  "Em andamento": "em_andamento",
  Pausada: "pausada",
  Concluída: "concluida",
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const horasEntre = (a: number, b: number) => Math.max(0, b - a) / 3_600_000;

/** Start of the day in Brasília, in ms. */
export function inicioDoDia(data: string): number {
  return Date.parse(`${data}T00:00:00${FUSO_PCP}`);
}

/** The next day, skipping Sunday. */
export function proximoDiaUtil(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function codigoOS(numero: number): string {
  return `OS-${numero}`;
}

/** Person-hours worked on a step up to `ate` (ms). */
function horasAte(trechos: TrechoSkill[], ate: number, agora: number): number {
  return trechos.reduce((soma, t) => {
    const fim = Math.min(t.fim ? Date.parse(t.fim) : agora, ate);
    return soma + horasEntre(Date.parse(t.inicio), fim) * t.pessoas;
  }, 0);
}

function progressoEm(etapa: EtapaSkill, ate: number, agora: number): number | null {
  const concluida = Boolean(
    etapa.concluido && etapa.concluidoEm && Date.parse(etapa.concluidoEm) <= ate,
  );
  return progressoEtapa(
    concluida,
    horasAte(etapa.trechos, ate, agora),
    etapa.estimativa?.horas ?? null,
  );
}

/** The sector a step belongs to, by name ("Serralheria" → Serralheria); outdoor work → Externa. */
export function setorDaEtapa(nome: string, setores: string[]): string | null {
  const etapa = normalizarEtapa(nome);
  const achado = setores.find((s) => {
    const setor = normalizarEtapa(s);
    return setor && (etapa.includes(setor) || setor.includes(etapa));
  });
  if (achado) return achado;
  if (dependeDoClima(nome)) return setores.find((s) => normalizarEtapa(s) === "externa") ?? null;
  return null;
}

/** Outdoor steps (installation, posting) depend on the weather. */
export function dependeDoClima(nome: string): boolean {
  return /instala|externa|colagem/.test(normalizarEtapa(nome));
}

/** Paused because something was missing ("Falta de material", "faltou chapa…"). */
export function faltaMaterial(motivo: string): boolean {
  return /materia|falt|insumo|chapa|vinil|lona|compra/.test(normalizarEtapa(motivo));
}

const PRIORIDADE_PESO: Record<string, number> = { Urgente: 0, Alta: 1, Normal: 2, Baixa: 3 };

export function montarEntradaSkillPcp(d: DadosSkillPcp) {
  const agora = d.agora.getTime();
  const inicio = inicioDoDia(d.dataReferencia);
  const fimDia = inicio + 86_400_000;
  const corte = Math.min(agora, fimDia);
  const nomeColab = new Map(d.colaboradores.map((c) => [c.id, c.nome]));

  // ----- Apontamentos do dia: one row per OS + step + person -----
  type Linha = {
    os: string;
    etapa: string;
    colaborador_id: string | null;
    colaborador: string;
    horas_gastas: number;
    progresso_anterior: number | null;
    progresso_atual: number | null;
    situacao: string;
    observacao: string;
  };
  const linhas = new Map<string, Linha>();
  for (const o of d.ordens) {
    for (const e of o.etapas) {
      const situacaoAgora = situacaoEtapa({
        concluido: e.concluido,
        trechos: e.trechos,
      });
      const concluidaHoje = Boolean(
        e.concluidoEm && Date.parse(e.concluidoEm) >= inicio && Date.parse(e.concluidoEm) < fimDia,
      );
      const motivosHoje = e.trechos
        .filter(
          (t) =>
            t.fimTipo === "pausa" &&
            t.fim &&
            Date.parse(t.fim) >= inicio &&
            Date.parse(t.fim) < fimDia &&
            t.motivoPausa,
        )
        .map((t) => t.motivoPausa);
      const observacao = [
        ...new Set(motivosHoje),
        ...(concluidaHoje ? ["Etapa concluída (baixa)"] : []),
      ].join("; ");
      for (const t of e.trechos) {
        const horas = horasEntre(
          Math.max(Date.parse(t.inicio), inicio),
          Math.min(t.fim ? Date.parse(t.fim) : agora, fimDia),
        );
        if (horas <= 0) continue;
        const pessoas = t.colaboradorIds.length
          ? t.colaboradorIds.map((id) => ({ id, nome: nomeColab.get(id) ?? "", horas }))
          : [{ id: null, nome: t.iniciadoPorNome, horas: horas * t.pessoas }];
        for (const p of pessoas) {
          const chave = `${o.numero}|${e.ordem}|${p.id ?? p.nome}`;
          const atual = linhas.get(chave);
          if (atual) {
            atual.horas_gastas += p.horas;
            continue;
          }
          linhas.set(chave, {
            os: codigoOS(o.numero),
            etapa: e.nome,
            colaborador_id: p.id,
            colaborador: p.nome,
            horas_gastas: p.horas,
            progresso_anterior: progressoEm(e, inicio, agora),
            progresso_atual: progressoEm(e, corte, agora),
            situacao: SITUACAO_JSON[situacaoAgora],
            observacao,
          });
        }
      }
    }
  }
  const apontamentosHoje = [...linhas.values()].map((l) => ({
    ...l,
    horas_gastas: r2(l.horas_gastas),
  }));

  // ----- Carteira: open orders, nearest deadline first -----
  const carteira = d.ordens
    .filter((o) => o.status === "Aguardando" || o.status === "Em andamento")
    .sort(
      (a, b) =>
        (a.dataPrevista ?? "9999").localeCompare(b.dataPrevista ?? "9999") ||
        (PRIORIDADE_PESO[a.prioridade] ?? 2) - (PRIORIDADE_PESO[b.prioridade] ?? 2) ||
        a.numero - b.numero,
    )
    .map((o) => ({
      os: codigoOS(o.numero),
      cliente: o.clienteNome,
      tipo_servico: o.servicoNome || o.descricao,
      descricao: o.descricao,
      tipo: o.tipo,
      data_entrega: o.dataPrevista,
      prioridade: o.prioridade.toLocaleLowerCase("pt-BR"),
      complexidade: o.complexidade.toLocaleLowerCase("pt-BR"),
      situacao: o.status.toLocaleLowerCase("pt-BR"),
      etapas: [...o.etapas]
        .sort((a, b) => a.ordem - b.ordem)
        .map((e) => {
          const situacao = situacaoEtapa(e);
          const gastas = horasAte(e.trechos, agora, agora);
          const estimadas = e.estimativa?.horas ?? null;
          const ultimaPausa = [...e.trechos].reverse().find((t) => t.fimTipo === "pausa");
          const motivo = situacao === "Pausada" ? (ultimaPausa?.motivoPausa ?? "") : "";
          return {
            ordem: e.ordem,
            nome: e.nome,
            setor: setorDaEtapa(e.nome, d.setores),
            situacao: SITUACAO_JSON[situacao],
            progresso: progressoEtapa(e.concluido, gastas, estimadas),
            horas_estimadas: estimadas,
            horas_gastas: r2(gastas),
            horas_restantes: e.concluido
              ? 0
              : estimadas !== null
                ? r2(Math.max(0, estimadas - gastas))
                : null,
            estimativa: e.estimativa
              ? { amostras: e.estimativa.amostras, base: e.estimativa.base as BaseEstimativa }
              : null,
            material_ok: !(situacao === "Pausada" && faltaMaterial(motivo)),
            clima_dependente: dependeDoClima(e.nome),
            ...(motivo ? { motivo_pausa: motivo } : {}),
          };
        }),
    }));

  // ----- Equipe: active people, sector and hours from their teams -----
  const especialidades = new Map<string, { etapa: string; horas: number }[]>();
  for (const h of d.historico) {
    const lista = especialidades.get(h.colaboradorId) ?? [];
    const igual = lista.find((x) => normalizarEtapa(x.etapa) === normalizarEtapa(h.etapa));
    if (igual) igual.horas += h.horas;
    else lista.push({ etapa: h.etapa, horas: h.horas });
    especialidades.set(h.colaboradorId, lista);
  }
  const equipe = d.colaboradores
    .filter((c) => c.ativo)
    .map((c) => {
      const times = d.equipes.filter((t) => t.ativo && t.colaboradorIds.includes(c.id));
      const setores = [...new Set(times.map((t) => t.setor))];
      return {
        id: c.id,
        nome: c.nome,
        setor: setores[0] ?? null,
        setores,
        especialidades: (especialidades.get(c.id) ?? [])
          .sort((a, b) => b.horas - a.horas)
          .slice(0, MAX_ESPECIALIDADES)
          .map((x) => x.etapa),
        horas_disponiveis: times.length
          ? Math.max(...times.map((t) => t.capacidade))
          : HORAS_DIA_PADRAO,
        ausente: false,
      };
    })
    // By sector (people without one last), then name.
    .sort(
      (a, b) =>
        Number(a.setor === null) - Number(b.setor === null) ||
        (a.setor ?? "").localeCompare(b.setor ?? "", "pt-BR") ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );

  return {
    data_referencia: d.dataReferencia,
    data_programacao: d.dataProgramacao,
    gerado_em: new Date(agora).toISOString(),
    premissas: [
      "progresso = horas gastas / horas estimadas, limitado a 95% até a baixa; 100% só com a baixa. null = sem estimativa ainda.",
      "horas_estimadas = mediana das últimas etapas iguais já concluídas (mesmo serviço e complexidade quando há 3 ou mais amostras; senão um grupo mais amplo, indicado em estimativa.base). null = sem histórico.",
      "horas_gastas e horas_disponiveis são horas por pessoa somadas (horas-homem).",
      `horas_disponiveis = capacidade diária da equipe de planejamento da pessoa; sem equipe, ${HORAS_DIA_PADRAO} h.`,
      "ausente ainda não é registrado no sistema: confirme as faltas antes de programar.",
      "especialidades = etapas que a pessoa mais trabalhou nos últimos 180 dias.",
      "material_ok = false quando a etapa está pausada por falta de material; clima_dependente = etapa de instalação/externa/colagem.",
      "setor da etapa deduzido pelo nome; null quando não bate com nenhum setor cadastrado.",
    ],
    equipe_disponivel: equipe,
    apontamentos_hoje: apontamentosHoje,
    carteira_ordens: carteira,
  };
}

export type EntradaSkillPcp = ReturnType<typeof montarEntradaSkillPcp>;
