/**
 * Dashboard (Gestão › Dashboard): pre-configured layout. Each indicator below is a proposal
 * waiting for Vitor's decision (docs/dashboard-indicadores.md); none reads data yet, so the
 * page shows "a definir". When a number is approved, give it a source and remove `aDefinir`.
 */
import type { Funcao } from "./types";

export type FormatoIndicador = "numero" | "moeda" | "percentual";

export interface Indicador {
  id: string;
  titulo: string;
  /** What the number will mean, shown under the card while it isn't wired up. */
  descricao: string;
  formato: FormatoIndicador;
  /** Highlight card (the first of the section, usually). */
  destaque?: boolean;
  /** Proposal not decided yet: the card shows "a definir". */
  aDefinir: true;
}

export interface SecaoDashboard {
  id: string;
  titulo: string;
  /** Opens the module the numbers come from. */
  link: string;
  /** Only these functions see the section (gestão always does). Empty = everyone on the page. */
  funcoes?: Funcao[];
  indicadores: Indicador[];
}

export const SECOES_DASHBOARD: SecaoDashboard[] = [
  {
    id: "comercial",
    titulo: "Comercial",
    link: "/comercial",
    indicadores: [
      {
        id: "pedidos-mes",
        titulo: "Pedidos no mês",
        descricao: "Valor total dos pedidos criados no mês (sem cancelados).",
        formato: "moeda",
        destaque: true,
        aDefinir: true,
      },
      {
        id: "propostas-abertas",
        titulo: "Propostas em aberto",
        descricao: "Propostas em Rascunho ou Enviada: quantidade e valor.",
        formato: "numero",
        aDefinir: true,
      },
      {
        id: "conversao",
        titulo: "Conversão de propostas",
        descricao: "Aprovadas ÷ (aprovadas + recusadas) no mês.",
        formato: "percentual",
        aDefinir: true,
      },
      {
        id: "propostas-vencendo",
        titulo: "Propostas vencendo",
        descricao: "Propostas abertas com validade nos próximos 7 dias.",
        formato: "numero",
        aDefinir: true,
      },
    ],
  },
  {
    id: "producao",
    titulo: "Produção e PCP",
    link: "/producao",
    indicadores: [
      {
        id: "ordens-atrasadas",
        titulo: "Ordens atrasadas",
        descricao: "Ordens não concluídas com data prevista já passada.",
        formato: "numero",
        destaque: true,
        aDefinir: true,
      },
      {
        id: "ordens-andamento",
        titulo: "Ordens em andamento",
        descricao: "Ordens com situação Aguardando ou Em andamento.",
        formato: "numero",
        aDefinir: true,
      },
      {
        id: "servicos-hoje",
        titulo: "Serviços de hoje",
        descricao: "Serviços na Programação Produção de hoje e quantos já foram concluídos.",
        formato: "numero",
        aDefinir: true,
      },
      {
        id: "nao-realizados",
        titulo: "Não realizados",
        descricao: "Serviços marcados como Não realizado ou Aguardando equipe na semana.",
        formato: "numero",
        aDefinir: true,
      },
    ],
  },
  {
    id: "projetos",
    titulo: "Projetos e liberações",
    link: "/projetos",
    indicadores: [
      {
        id: "projetos-andamento",
        titulo: "Projetos em andamento",
        descricao: "Projetos ativos (não arquivados) ainda não concluídos.",
        formato: "numero",
        destaque: true,
        aDefinir: true,
      },
      {
        id: "projetos-atrasados",
        titulo: "Projetos atrasados",
        descricao: "Projetos não concluídos com prazo de entrega já passado.",
        formato: "numero",
        aDefinir: true,
      },
      {
        id: "bloqueios",
        titulo: "Bloqueios abertos",
        descricao: "Bloqueios registrados nos projetos e ainda não resolvidos.",
        formato: "numero",
        aDefinir: true,
      },
      {
        id: "liberacoes-fila",
        titulo: "Liberações aguardando",
        descricao: "Liberações na fila do PCP esperando aprovação.",
        formato: "numero",
        aDefinir: true,
      },
    ],
  },
  {
    id: "midia",
    titulo: "Mídia OOH",
    link: "/midia-ooh",
    indicadores: [
      {
        id: "ocupacao-bissemana",
        titulo: "Ocupação da bi-semana",
        descricao: "Faces ocupadas ou reservadas na bi-semana atual ÷ faces ativas.",
        formato: "percentual",
        destaque: true,
        aDefinir: true,
      },
      {
        id: "faces-livres",
        titulo: "Faces livres",
        descricao: "Faces ativas sem reserva na bi-semana atual.",
        formato: "numero",
        aDefinir: true,
      },
      {
        id: "proxima-bissemana",
        titulo: "Próxima bi-semana",
        descricao: "Ocupação já vendida da próxima bi-semana (antecipa colagens).",
        formato: "percentual",
        aDefinir: true,
      },
      {
        id: "pontos-manutencao",
        titulo: "Pontos em manutenção",
        descricao: "Pontos com situação Em manutenção.",
        formato: "numero",
        aDefinir: true,
      },
    ],
  },
  {
    id: "financeiro",
    titulo: "Financeiro",
    link: "/financeiro",
    funcoes: ["financeiro", "direcao"],
    indicadores: [
      {
        id: "receber-vencido",
        titulo: "A receber vencido",
        descricao: "Contas a receber em aberto com vencimento já passado.",
        formato: "moeda",
        destaque: true,
        aDefinir: true,
      },
      {
        id: "receber-7-dias",
        titulo: "A receber em 7 dias",
        descricao: "Contas a receber em aberto que vencem nos próximos 7 dias.",
        formato: "moeda",
        aDefinir: true,
      },
      {
        id: "pagar-7-dias",
        titulo: "A pagar em 7 dias",
        descricao: "Contas a pagar em aberto (vencidas ou nos próximos 7 dias).",
        formato: "moeda",
        aDefinir: true,
      },
      {
        id: "recebido-mes",
        titulo: "Recebido no mês",
        descricao: "Total recebido no mês, comparado com o mês anterior.",
        formato: "moeda",
        aDefinir: true,
      },
    ],
  },
];

/** Sections the person may see: gestão sees all; a restricted one needs one of its functions. */
export function secoesVisiveis(funcoes: Funcao[], isGestor: boolean): SecaoDashboard[] {
  return SECOES_DASHBOARD.filter(
    (s) => isGestor || !s.funcoes?.length || s.funcoes.some((f) => funcoes.includes(f)),
  );
}
