/**
 * Input JSON for the claude.ai "skill-comercial": CIs/outdoors about to expire, proposals waiting
 * for the client, pedidos not yet released (with the release checklist), visits and after-sales.
 * Pure: the repository loads the data (`skillComercialRepository.entrada`). Tested in
 * skill-comercial.test.ts.
 */

/** Renewal radar: from this many days before the end. */
export const JANELA_RENOVACAO_DIAS = 10;
/** Up to this many days left (or already over) is critical. */
export const DIAS_CRITICO = 3;
/** The daily routine (gerar_avisos_paineis) warns the representative from 7 days before. */
export const DIAS_AVISO_AUTOMATICO = 7;
/** A proposal without an answer for this many days needs a follow-up. */
export const DIAS_SEM_RESPOSTA = 3;
/** After-sales: orders finished between these many days ago. */
export const POS_VENDA_DE = 2;
export const POS_VENDA_ATE = 5;
/** Visits in the next days. */
export const DIAS_AGENDA_VISITAS = 7;

export interface VinhetaSkill {
  painelCodigo: string;
  painelNome: string;
  cliente: string;
  ci: string;
  tipo: string;
  inicio: string | null;
  fim: string | null;
  representanteNome: string;
}

/** A CI waiting for approval that renews a panel slot (ci_paineis pendente). */
export interface RenovacaoPendenteSkill {
  painelCodigo: string;
  cliente: string;
  ciRotulo: string;
}

/** Outdoor occupancy by bi-week (pontos_ocupacao + calendário). */
export interface OcupacaoOutdoorSkill {
  pontoCodigo: string;
  pontoNome: string;
  cliente: string;
  inicio: string;
  fim: string;
}

export interface VendaSkill {
  numero: number;
  cliente: string;
  contato: string;
  vendedor: string;
  status: string;
  total: number;
  descricao: string;
  /** Last change (the system doesn't record when it was sent). */
  atualizadoEm: string;
  validade: string | null;
}

/** null = nothing recorded in the system for that requirement. */
export interface PedidoLiberacaoSkill extends VendaSkill {
  temLiberacao: boolean;
  sinalPago: boolean | null;
  arteOk: boolean | null;
  medidaConferida: boolean | null;
}

export interface VisitaSkill {
  numero: number;
  cliente: string;
  status: string;
  agendadaPara: string | null;
  dataSugerida: string | null;
  descricao: string;
  endereco: string;
  responsavelNome: string;
  vendedor: string;
}

export interface OrdemConcluidaSkill {
  numero: number;
  cliente: string;
  descricao: string;
  concluidaEm: string;
  vendedor: string;
  clienteConfirmouEm: string | null;
}

export interface DadosSkillComercial {
  hoje: string;
  agora: Date;
  /** "" = everyone's portfolio. */
  vendedor: string;
  vinhetas: VinhetaSkill[];
  renovacoesPendentes: RenovacaoPendenteSkill[];
  outdoor: OcupacaoOutdoorSkill[];
  propostas: VendaSkill[];
  pedidos: PedidoLiberacaoSkill[];
  visitas: VisitaSkill[];
  ordensConcluidas: OrdemConcluidaSkill[];
}

const normal = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();

/** Names are typed by hand ("Laila" / "Laila Teixeira de Pinho"): same first name, or one contains the other. */
export function mesmoVendedor(nome: string, filtro: string): boolean {
  const a = normal(nome);
  const b = normal(filtro);
  if (!b) return true;
  if (!a) return false;
  return a.includes(b) || b.includes(a) || a.split(" ")[0] === b.split(" ")[0];
}

export function diasEntre(de: string, ate: string): number {
  return Math.round(
    (Date.parse(`${ate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${de.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );
}

export type Urgencia = "CRITICO" | "ATENCAO";
export function urgenciaRenovacao(diasParaVencer: number): Urgencia {
  return diasParaVencer <= DIAS_CRITICO ? "CRITICO" : "ATENCAO";
}

/** Last bi-week of each outdoor + client that has no later bi-week for the same client. */
export function fimDasOcupacoes(ocupacoes: OcupacaoOutdoorSkill[]): OcupacaoOutdoorSkill[] {
  const grupos = new Map<string, OcupacaoOutdoorSkill>();
  for (const o of ocupacoes) {
    if (!normal(o.cliente)) continue;
    const chave = `${o.pontoCodigo}|${normal(o.cliente)}`;
    const atual = grupos.get(chave);
    if (!atual) grupos.set(chave, { ...o });
    else {
      if (o.fim > atual.fim) atual.fim = o.fim;
      if (o.inicio < atual.inicio) atual.inicio = o.inicio;
    }
  }
  return [...grupos.values()];
}

export function montarEntradaSkillComercial(d: DadosSkillComercial) {
  const doVendedor = (nome: string) => mesmoVendedor(nome, d.vendedor);
  const limite = JANELA_RENOVACAO_DIAS;

  // ----- 1) Renovações: painéis RGB e outdoors -----
  const pendente = (codigo: string, cliente: string) =>
    d.renovacoesPendentes.find(
      (r) => r.painelCodigo === codigo && normal(r.cliente) === normal(cliente),
    );
  const paineis = d.vinhetas
    .filter((v) => v.tipo === "venda" && v.fim && doVendedor(v.representanteNome))
    .map((v) => ({ v, dias: diasEntre(d.hoje, v.fim!) }))
    .filter(({ dias }) => dias <= limite)
    .map(({ v, dias }) => {
      const ren = pendente(v.painelCodigo, v.cliente);
      return {
        ci_numero: v.ci || null,
        cliente: v.cliente,
        contato: null,
        midia: `Painel ${v.painelCodigo}${v.painelNome ? ` — ${v.painelNome}` : ""}`,
        tipo_midia: "painel_rgb",
        representante: v.representanteNome,
        valor_mensal: null,
        data_inicio: v.inicio,
        data_vencimento: v.fim,
        dias_para_vencer: dias,
        urgencia: urgenciaRenovacao(dias),
        status_renovacao: ren ? "RENOVACAO_EM_APROVACAO" : "NAO_CONTATADO",
        ...(ren ? { ci_renovacao: ren.ciRotulo } : {}),
        alerta_criacao_recebido: dias <= DIAS_AVISO_AUTOMATICO,
      };
    });
  const outdoors = fimDasOcupacoes(d.outdoor)
    .map((o) => ({ o, dias: diasEntre(d.hoje, o.fim) }))
    .filter(({ dias }) => dias <= limite && dias >= -14)
    .map(({ o, dias }) => ({
      ci_numero: null,
      cliente: o.cliente,
      contato: null,
      midia: `Outdoor ${o.pontoCodigo}${o.pontoNome ? ` — ${o.pontoNome}` : ""}`,
      tipo_midia: "outdoor",
      representante: null,
      valor_mensal: null,
      data_inicio: o.inicio,
      data_vencimento: o.fim,
      dias_para_vencer: dias,
      urgencia: urgenciaRenovacao(dias),
      status_renovacao: "NAO_CONTATADO",
      alerta_criacao_recebido: false,
    }));
  // Outdoors carry no representative: they only go in when everyone's portfolio is asked for.
  const renovacoes = [...paineis, ...(d.vendedor ? [] : outdoors)].sort(
    (a, b) => a.dias_para_vencer - b.dias_para_vencer,
  );

  // ----- 2) Propostas esperando o cliente (maior valor primeiro) -----
  const orcamentos = d.propostas
    .filter((p) => p.status === "Enviada" && doVendedor(p.vendedor))
    .map((p) => {
      const desde = p.atualizadoEm.slice(0, 10);
      return {
        orcamento_id: `PROP-${p.numero}`,
        cliente: p.cliente,
        contato: p.contato || null,
        vendedor: p.vendedor,
        servico: p.descricao,
        valor_proposta: Math.round(p.total * 100) / 100,
        status: "ENVIADO_AO_CLIENTE",
        data_envio_cliente: desde,
        ultimo_followup: null,
        dias_sem_resposta: Math.max(0, diasEntre(desde, d.hoje)),
        validade: p.validade,
        cobrar_hoje: diasEntre(desde, d.hoje) >= DIAS_SEM_RESPOSTA,
      };
    })
    .sort((a, b) => b.valor_proposta - a.valor_proposta);

  // ----- 3) Pedidos sem liberação: os 5 requisitos -----
  const servicos = d.pedidos
    .filter((p) => !p.temLiberacao && p.status !== "Cancelado" && doVendedor(p.vendedor))
    .map((p) => {
      const checklist = {
        sinal_pago: p.sinalPago,
        contrato_assinado: null as boolean | null,
        arte_ok: p.arteOk,
        medida_conferida: p.medidaConferida,
        especificacao_tecnica: { preenchida: null as boolean | null, faltando: [] as string[] },
      };
      const faltando = [
        checklist.sinal_pago !== true && "sinal_pago",
        checklist.contrato_assinado !== true && "contrato_assinado",
        checklist.arte_ok !== true && "arte_ok",
        checklist.medida_conferida !== true && "medida_conferida",
        checklist.especificacao_tecnica.preenchida !== true && "especificacao_tecnica",
      ].filter((x): x is string => Boolean(x));
      return {
        pedido_id: `PED-${p.numero}`,
        cliente: p.cliente,
        vendedor: p.vendedor,
        servico: p.descricao,
        valor: Math.round(p.total * 100) / 100,
        checklist_liberacao: checklist,
        requisitos_pendentes: faltando,
        pode_liberar: faltando.length === 0,
      };
    })
    .sort((a, b) => a.requisitos_pendentes.length - b.requisitos_pendentes.length);

  // ----- 4) Visitas e pós-venda -----
  const fimAgenda = DIAS_AGENDA_VISITAS;
  const visitas = d.visitas
    .filter((v) => doVendedor(v.vendedor))
    .filter((v) =>
      v.status === "agendada"
        ? v.agendadaPara !== null &&
          diasEntre(d.hoje, v.agendadaPara) >= 0 &&
          diasEntre(d.hoje, v.agendadaPara) <= fimAgenda
        : v.status === "solicitada",
    )
    .map((v) => ({
      tipo: "VISITA_TECNICA",
      visita: `VIS-${v.numero}`,
      cliente: v.cliente,
      status: v.status === "agendada" ? "AGENDADA" : "AGUARDANDO_AGENDA_PCP",
      data_agendada: v.agendadaPara,
      data_sugerida: v.dataSugerida,
      responsavel: v.responsavelNome || null,
      endereco: v.endereco,
      objetivo: v.descricao,
    }));
  const posVenda = d.ordensConcluidas
    .filter((o) => doVendedor(o.vendedor))
    .map((o) => ({ o, dias: diasEntre(o.concluidaEm, d.hoje) }))
    .filter(({ dias }) => dias >= POS_VENDA_DE && dias <= POS_VENDA_ATE)
    .map(({ o, dias }) => ({
      tipo: "POS_VENDA",
      os: `OS-${o.numero}`,
      cliente: o.cliente,
      servico: o.descricao,
      data_conclusao_os: o.concluidaEm.slice(0, 10),
      dias_desde_conclusao: dias,
      cliente_confirmou_entrega: o.clienteConfirmouEm,
      contato_pos_venda_feito: null,
    }));

  return {
    data_referencia: d.agora.toISOString(),
    vendedor_atual: d.vendedor ? { nome: d.vendedor } : null,
    premissas: [
      `cis_paineis_outdoor = vinhetas de venda no ar e outdoors que vencem em até ${JANELA_RENOVACAO_DIAS} dias (ou já venceram e ainda estão no painel).`,
      "status_renovacao: RENOVACAO_EM_APROVACAO quando já existe uma CI de renovação esperando a Criação; o contato com o cliente ainda não é registrado no sistema, então os demais vêm como NAO_CONTATADO.",
      `alerta_criacao_recebido = o aviso automático do sistema ao representante já saiu (a rotina diária avisa a partir de ${DIAS_AVISO_AUTOMATICO} dias antes).`,
      "valor_mensal e contato não são guardados na vinheta/CI: vêm null.",
      "outdoors: fim da última bi-semana ocupada pelo mesmo cliente no ponto, sem bi-semana seguinte reservada; só entram na carteira de todos (o outdoor não tem representante).",
      "orcamentos_abertos = propostas na situação Enviada; data_envio_cliente é a data da última alteração da proposta (o envio não é registrado); ultimo_followup não é registrado.",
      "servicos_para_liberar = pedidos sem liberação. sinal_pago: true se uma conta a receber do pedido foi recebida, false se há conta e nenhuma recebida, null se não há conta lançada. arte_ok: briefing ligado ao pedido (ou à proposta) concluído. medida_conferida: visita técnica ligada realizada. contrato_assinado e especificacao_tecnica ainda não são registrados (null). null conta como pendente.",
      `visitas: agendadas para os próximos ${DIAS_AGENDA_VISITAS} dias e as solicitadas que o PCP ainda não agendou. pós-venda: ordens concluídas há ${POS_VENDA_DE} a ${POS_VENDA_ATE} dias; o contato de pós-venda não é registrado (null).`,
    ],
    cis_paineis_outdoor: renovacoes,
    orcamentos_abertos: orcamentos,
    servicos_para_liberar: servicos,
    visitas_e_pos_venda: [...visitas, ...posVenda],
  };
}

export type EntradaSkillComercial = ReturnType<typeof montarEntradaSkillComercial>;
