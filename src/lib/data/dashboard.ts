/**
 * Dashboard: sections, who sees them and how each card reads `dashboard_resumo()` (migration
 * 0037). The decisions behind every number are in docs/dashboard-indicadores.md; the ids here
 * are the codes used there.
 */
import type { Funcao } from "./types";

// ---------- What dashboard_resumo() returns ----------

export interface OcupacaoBissemana {
  ano: number;
  numero: number;
  inicio: string;
  fim: string;
  faces: number;
  ocupadas: number;
  reservadas: number;
  livres: number;
}

export interface PropostaVencendo {
  id: string;
  numero: number;
  cliente: string | null;
  validade: string;
  valor: number;
}

export interface DashboardResumo {
  hoje: string;
  mes_inicio: string;
  anterior_inicio: string;
  anterior_fim: string;
  comercial: {
    pedidos_mes: {
      valor: number;
      quantidade: number;
      valor_anterior: number;
      quantidade_anterior: number;
    };
    propostas_abertas: { quantidade: number; valor: number };
    conversao: {
      aprovadas: number;
      recusadas: number;
      aprovadas_anterior: number;
      recusadas_anterior: number;
    };
    propostas_vencendo: { quantidade: number; lista: PropostaVencendo[] };
  };
  producao: {
    ordens_atrasadas: number;
    ordens_andamento: { aguardando: number; em_andamento: number };
    servicos_hoje: { total: number; concluidos: number };
    nao_realizados: number;
  };
  projetos: {
    em_andamento: number;
    atrasados: number;
    bloqueios: number;
    liberacoes_fila: { quantidade: number; mais_antiga_em: string | null };
  };
  midia: {
    /** Null when today's bi-week isn't in the calendar. */
    atual: OcupacaoBissemana | null;
    proxima: OcupacaoBissemana | null;
    pontos_manutencao: number;
  };
  /** Null without permission for the Financeiro (can_financeiro). */
  financeiro: {
    receber_vencido: { valor: number; quantidade: number };
    receber_7_dias: { valor: number; quantidade: number };
    pagar_7_dias: { vencido: number; proximos: number };
    recebido_mes: { valor: number; valor_anterior: number };
  } | null;
}

// ---------- Layout ----------

export interface Indicador {
  id: string;
  titulo: string;
  /** What the number means, shown under the card. */
  descricao: string;
  /** Highlight card (the first of the section). */
  destaque?: boolean;
}

export interface SecaoDashboard {
  id: "comercial" | "producao" | "projetos" | "midia" | "financeiro";
  titulo: string;
  /** Opens the module the numbers come from. */
  link: string;
  /** Functions that see the section (gestão always does). */
  funcoes: Funcao[];
  indicadores: Indicador[];
}

export const SECOES_DASHBOARD: SecaoDashboard[] = [
  {
    id: "comercial",
    titulo: "Comercial",
    link: "/comercial",
    funcoes: ["direcao", "comercial"],
    indicadores: [
      {
        id: "pedidos-mes",
        titulo: "Pedidos no mês",
        descricao: "Valor dos pedidos criados no mês, sem os cancelados.",
        destaque: true,
      },
      {
        id: "propostas-abertas",
        titulo: "Propostas em aberto",
        descricao: "Propostas em Rascunho ou Enviada.",
      },
      {
        id: "conversao",
        titulo: "Conversão de propostas",
        descricao: "Aprovadas entre as decididas no mês (aprovadas ou recusadas).",
      },
      {
        id: "propostas-vencendo",
        titulo: "Propostas vencendo",
        descricao: "Em aberto, com validade nos próximos 7 dias.",
      },
    ],
  },
  {
    id: "producao",
    titulo: "Produção e PCP",
    link: "/producao",
    funcoes: ["direcao", "pcp"],
    indicadores: [
      {
        id: "ordens-atrasadas",
        titulo: "Ordens atrasadas",
        descricao: "Não concluídas, com data prevista já passada.",
        destaque: true,
      },
      {
        id: "ordens-andamento",
        titulo: "Ordens em andamento",
        descricao: "Ordens Aguardando ou Em andamento.",
      },
      {
        id: "servicos-hoje",
        titulo: "Serviços de hoje",
        descricao: "Concluídos / total na Programação Produção de hoje.",
      },
      {
        id: "nao-realizados",
        titulo: "Não realizados na semana",
        descricao: "Não realizado ou Aguardando equipe, de segunda a domingo.",
      },
    ],
  },
  {
    id: "projetos",
    titulo: "Projetos e liberações",
    link: "/projetos",
    funcoes: ["direcao", "pcp"],
    indicadores: [
      {
        id: "projetos-andamento",
        titulo: "Projetos em andamento",
        descricao: "Projetos ativos que ainda têm tarefa aberta.",
        destaque: true,
      },
      {
        id: "projetos-atrasados",
        titulo: "Projetos atrasados",
        descricao: "Não concluídos, com prazo de entrega já passado.",
      },
      {
        id: "bloqueios",
        titulo: "Bloqueios abertos",
        descricao: "Bloqueios ainda não resolvidos nos projetos ativos.",
      },
      {
        id: "liberacoes-fila",
        titulo: "Liberações aguardando",
        descricao: "Na fila do PCP, esperando aprovação.",
      },
    ],
  },
  {
    id: "midia",
    titulo: "Mídia OOH",
    link: "/midia-ooh",
    funcoes: ["direcao", "comercial"],
    indicadores: [
      {
        id: "ocupacao-bissemana",
        titulo: "Ocupação da bi-semana",
        descricao: "Faces ocupadas ou reservadas entre as faces dos pontos ativos.",
        destaque: true,
      },
      {
        id: "faces-livres",
        titulo: "Faces livres",
        descricao: "Faces dos pontos ativos sem reserva na bi-semana atual.",
      },
      {
        id: "proxima-bissemana",
        titulo: "Próxima bi-semana",
        descricao: "Quanto da próxima bi-semana já está vendido.",
      },
      {
        id: "pontos-manutencao",
        titulo: "Pontos em manutenção",
        descricao: "Pontos com situação Em manutenção.",
      },
    ],
  },
  {
    id: "financeiro",
    titulo: "Financeiro",
    link: "/financeiro",
    funcoes: ["direcao", "financeiro"],
    indicadores: [
      {
        id: "receber-vencido",
        titulo: "A receber vencido",
        descricao: "Contas a receber em aberto com vencimento já passado.",
        destaque: true,
      },
      {
        id: "receber-7-dias",
        titulo: "A receber em 7 dias",
        descricao: "Contas a receber em aberto que vencem até daqui a 7 dias.",
      },
      {
        id: "pagar-7-dias",
        titulo: "A pagar em 7 dias",
        descricao: "Contas a pagar em aberto, vencidas ou vencendo em 7 dias.",
      },
      {
        id: "recebido-mes",
        titulo: "Recebido no mês",
        descricao: "Total recebido no mês, pela data do recebimento.",
      },
    ],
  },
];

/** Sections the person sees: gestão sees all; the others need one of the section's functions. */
export function secoesVisiveis(funcoes: Funcao[], isGestor: boolean): SecaoDashboard[] {
  return SECOES_DASHBOARD.filter((s) => isGestor || s.funcoes.some((f) => funcoes.includes(f)));
}

/** Gestão and Direção open the app on the Dashboard; everyone else on Projetos. */
export function abreNoDashboard(funcoes: Funcao[], isGestor: boolean): boolean {
  return isGestor || funcoes.includes("direcao");
}

// ---------- Reading a card ----------

export interface Variacao {
  texto: string;
  sentido: "sobe" | "desce" | "igual";
}

export interface ValorCartao {
  principal: string;
  detalhe?: string | undefined;
  variacao?: Variacao | undefined;
}

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const inteiro = (n: number) => n.toLocaleString("pt-BR");
const plural = (n: number, um: string, varios: string) => `${inteiro(n)} ${n === 1 ? um : varios}`;

/** "↑ 12%" against the same stretch of last month; nothing to compare with when it was zero. */
export function variacaoPercentual(atual: number, anterior: number): Variacao | undefined {
  if (!anterior) return undefined;
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  if (pct === 0) return { texto: "= mês anterior", sentido: "igual" };
  return { texto: `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}%`, sentido: pct > 0 ? "sobe" : "desce" };
}

/** Approved ÷ decided, in %; null when nothing was decided. */
export function taxaConversao(aprovadas: number, recusadas: number): number | null {
  const decididas = aprovadas + recusadas;
  return decididas === 0 ? null : Math.round((aprovadas / decididas) * 100);
}

/** Conversion change in percentage points; nothing when one of the months had no decisions. */
export function variacaoPontos(
  atual: number | null,
  anterior: number | null,
): Variacao | undefined {
  if (atual === null || anterior === null) return undefined;
  const pp = atual - anterior;
  if (pp === 0) return { texto: "= mês anterior", sentido: "igual" };
  return {
    texto: `${pp > 0 ? "↑" : "↓"} ${Math.abs(pp)} p.p.`,
    sentido: pp > 0 ? "sobe" : "desce",
  };
}

/** Whole days between two dates "YYYY-MM-DD" (b − a). */
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "a mais antiga há 3 dias" from the oldest liberação in the queue. */
export function esperaMaisAntiga(maisAntigaEm: string | null, hoje: string): string | undefined {
  if (!maisAntigaEm) return undefined;
  const dia = new Date(maisAntigaEm).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const dias = Math.max(0, diasEntre(dia, hoje));
  if (dias === 0) return "a mais antiga é de hoje";
  return `a mais antiga há ${plural(dias, "dia", "dias")}`;
}

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function ocupacao(o: OcupacaoBissemana | null): ValorCartao {
  if (!o) return { principal: "—", detalhe: "Bi-semana fora do calendário" };
  const pct = o.faces === 0 ? 0 : Math.round(((o.ocupadas + o.reservadas) / o.faces) * 100);
  return {
    principal: `${pct}%`,
    detalhe: `${plural(o.ocupadas, "ocupada", "ocupadas")} · ${plural(o.reservadas, "reservada", "reservadas")} · bi-semana ${o.numero} (${dataCurta(o.inicio)} a ${dataCurta(o.fim)})`,
  };
}

/** What a card shows. Null for an unknown id or a section the resumo didn't bring. */
export function valorDoIndicador(id: string, r: DashboardResumo): ValorCartao | null {
  const c = r.comercial;
  const p = r.producao;
  const pr = r.projetos;
  const m = r.midia;
  const f = r.financeiro;
  switch (id) {
    case "pedidos-mes":
      return {
        principal: moeda(c.pedidos_mes.valor),
        detalhe: plural(c.pedidos_mes.quantidade, "pedido", "pedidos"),
        variacao: variacaoPercentual(c.pedidos_mes.valor, c.pedidos_mes.valor_anterior),
      };
    case "propostas-abertas":
      return {
        principal: inteiro(c.propostas_abertas.quantidade),
        detalhe: moeda(c.propostas_abertas.valor),
      };
    case "conversao": {
      const { aprovadas, recusadas, aprovadas_anterior, recusadas_anterior } = c.conversao;
      const taxa = taxaConversao(aprovadas, recusadas);
      return {
        principal: taxa === null ? "—" : `${taxa}%`,
        detalhe:
          taxa === null
            ? "Nenhuma proposta decidida no mês"
            : `${inteiro(aprovadas)} de ${inteiro(aprovadas + recusadas)}`,
        variacao: variacaoPontos(taxa, taxaConversao(aprovadas_anterior, recusadas_anterior)),
      };
    }
    case "propostas-vencendo":
      return { principal: inteiro(c.propostas_vencendo.quantidade) };
    case "ordens-atrasadas":
      return { principal: inteiro(p.ordens_atrasadas) };
    case "ordens-andamento": {
      const { aguardando, em_andamento } = p.ordens_andamento;
      return {
        principal: inteiro(aguardando + em_andamento),
        detalhe: `${inteiro(aguardando)} aguardando · ${inteiro(em_andamento)} em andamento`,
      };
    }
    case "servicos-hoje":
      return {
        principal: `${inteiro(p.servicos_hoje.concluidos)} / ${inteiro(p.servicos_hoje.total)}`,
        detalhe: "concluídos / total",
      };
    case "nao-realizados":
      return { principal: inteiro(p.nao_realizados) };
    case "projetos-andamento":
      return { principal: inteiro(pr.em_andamento) };
    case "projetos-atrasados":
      return { principal: inteiro(pr.atrasados) };
    case "bloqueios":
      return { principal: inteiro(pr.bloqueios) };
    case "liberacoes-fila":
      return {
        principal: inteiro(pr.liberacoes_fila.quantidade),
        detalhe: esperaMaisAntiga(pr.liberacoes_fila.mais_antiga_em, r.hoje),
      };
    case "ocupacao-bissemana":
      return ocupacao(m.atual);
    case "faces-livres":
      return m.atual
        ? {
            principal: inteiro(m.atual.livres),
            detalhe: `de ${plural(m.atual.faces, "face ativa", "faces ativas")}`,
          }
        : { principal: "—", detalhe: "Bi-semana fora do calendário" };
    case "proxima-bissemana":
      return ocupacao(m.proxima);
    case "pontos-manutencao":
      return { principal: inteiro(m.pontos_manutencao) };
  }
  if (!f) return null;
  switch (id) {
    case "receber-vencido":
      return {
        principal: moeda(f.receber_vencido.valor),
        detalhe: plural(f.receber_vencido.quantidade, "conta", "contas"),
      };
    case "receber-7-dias":
      return {
        principal: moeda(f.receber_7_dias.valor),
        detalhe: plural(f.receber_7_dias.quantidade, "conta", "contas"),
      };
    case "pagar-7-dias":
      return {
        principal: moeda(f.pagar_7_dias.vencido + f.pagar_7_dias.proximos),
        detalhe: `${moeda(f.pagar_7_dias.vencido)} já vencido · ${moeda(f.pagar_7_dias.proximos)} nos próximos 7 dias`,
      };
    case "recebido-mes":
      return {
        principal: moeda(f.recebido_mes.valor),
        variacao: variacaoPercentual(f.recebido_mes.valor, f.recebido_mes.valor_anterior),
      };
  }
  return null;
}
