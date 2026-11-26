import { describe, expect, it } from "vitest";
import {
  fimDasOcupacoes,
  mesmoVendedor,
  montarEntradaSkillComercial,
  urgenciaRenovacao,
  type DadosSkillComercial,
} from "./skill-comercial";

const base = (p: Partial<DadosSkillComercial> = {}): DadosSkillComercial => ({
  hoje: "2026-11-26",
  agora: new Date("2026-11-26T17:30:00Z"),
  vendedor: "",
  vinhetas: [],
  renovacoesPendentes: [],
  outdoor: [],
  propostas: [],
  pedidos: [],
  visitas: [],
  ordensConcluidas: [],
  ...p,
});

const vinheta = (fim: string, p: Partial<DadosSkillComercial["vinhetas"][number]> = {}) => ({
  painelCodigo: "RGB 1",
  painelNome: "Trevo",
  cliente: "Auto Posto Sol",
  ci: "12/Out",
  tipo: "venda",
  inicio: "2026-10-28",
  fim,
  representanteNome: "Rafael",
  ...p,
});

describe("skill Comercial: radar de renovação", () => {
  it("janela de 10 dias, urgência e aviso automático", () => {
    const r = montarEntradaSkillComercial(
      base({
        vinhetas: [
          vinheta("2026-11-28"),
          vinheta("2026-12-04", { cliente: "Ótica" }),
          vinheta("2026-12-20", { cliente: "Longe" }),
          vinheta("2026-11-20", { cliente: "Vencida" }),
          vinheta("2026-11-27", { cliente: "Permuta", tipo: "permuta" }),
        ],
      }),
    );
    expect(r.cis_paineis_outdoor.map((c) => [c.cliente, c.dias_para_vencer, c.urgencia])).toEqual([
      ["Vencida", -6, "CRITICO"],
      ["Auto Posto Sol", 2, "CRITICO"],
      ["Ótica", 8, "ATENCAO"],
    ]);
    expect(r.cis_paineis_outdoor[1]).toMatchObject({
      ci_numero: "12/Out",
      midia: "Painel RGB 1 — Trevo",
      status_renovacao: "NAO_CONTATADO",
      alerta_criacao_recebido: true,
    });
    expect(r.cis_paineis_outdoor[2]?.alerta_criacao_recebido).toBe(false);
  });

  it("CI de renovação esperando aprovação muda o status", () => {
    const r = montarEntradaSkillComercial(
      base({
        vinhetas: [vinheta("2026-11-28")],
        renovacoesPendentes: [
          { painelCodigo: "RGB 1", cliente: "auto posto sol", ciRotulo: "3/Nov" },
        ],
      }),
    );
    expect(r.cis_paineis_outdoor[0]).toMatchObject({
      status_renovacao: "RENOVACAO_EM_APROVACAO",
      ci_renovacao: "3/Nov",
    });
  });

  it("outdoor: vence no fim da última bi-semana do cliente", () => {
    const ocup = [
      {
        pontoCodigo: "P-10",
        pontoNome: "Av. Central",
        cliente: "Loja X",
        inicio: "2026-11-16",
        fim: "2026-11-29",
      },
      {
        pontoCodigo: "P-10",
        pontoNome: "Av. Central",
        cliente: "loja x",
        inicio: "2026-11-30",
        fim: "2026-12-13",
      },
      {
        pontoCodigo: "P-11",
        pontoNome: "",
        cliente: "Loja Y",
        inicio: "2026-11-16",
        fim: "2026-11-29",
      },
    ];
    expect(fimDasOcupacoes(ocup).map((o) => [o.pontoCodigo, o.fim])).toEqual([
      ["P-10", "2026-12-13"],
      ["P-11", "2026-11-29"],
    ]);
    const r = montarEntradaSkillComercial(base({ outdoor: ocup }));
    expect(r.cis_paineis_outdoor.map((c) => c.midia)).toEqual(["Outdoor P-11"]);
    // Filtered by seller: outdoors have no representative and stay out.
    expect(
      montarEntradaSkillComercial(base({ outdoor: ocup, vendedor: "Rafael" })).cis_paineis_outdoor,
    ).toEqual([]);
  });
});

describe("skill Comercial: orçamentos, liberação, visitas e pós-venda", () => {
  const venda = {
    cliente: "Padaria",
    contato: "",
    vendedor: "Rafael Souza",
    total: 14500,
    descricao: "Fachada ACM",
    atualizadoEm: "2026-11-21T10:00:00Z",
    validade: null,
  };

  it("propostas enviadas, maior valor primeiro, cobrar com 3 dias", () => {
    const r = montarEntradaSkillComercial(
      base({
        propostas: [
          { ...venda, numero: 1, status: "Enviada" },
          {
            ...venda,
            numero: 2,
            status: "Enviada",
            total: 30000,
            atualizadoEm: "2026-11-25T10:00:00Z",
          },
          { ...venda, numero: 3, status: "Rascunho" },
        ],
      }),
    );
    expect(
      r.orcamentos_abertos.map((o) => [o.orcamento_id, o.dias_sem_resposta, o.cobrar_hoje]),
    ).toEqual([
      ["PROP-2", 1, false],
      ["PROP-1", 5, true],
    ]);
  });

  it("pedido sem liberação: requisitos pendentes (null conta como pendente)", () => {
    const r = montarEntradaSkillComercial(
      base({
        pedidos: [
          {
            ...venda,
            numero: 902,
            status: "Aberto",
            temLiberacao: false,
            sinalPago: true,
            arteOk: true,
            medidaConferida: false,
          },
          {
            ...venda,
            numero: 903,
            status: "Aberto",
            temLiberacao: true,
            sinalPago: true,
            arteOk: true,
            medidaConferida: true,
          },
          {
            ...venda,
            numero: 904,
            status: "Cancelado",
            temLiberacao: false,
            sinalPago: null,
            arteOk: null,
            medidaConferida: null,
          },
        ],
      }),
    );
    expect(r.servicos_para_liberar).toHaveLength(1);
    expect(r.servicos_para_liberar[0]).toMatchObject({
      pedido_id: "PED-902",
      requisitos_pendentes: ["contrato_assinado", "medida_conferida", "especificacao_tecnica"],
      pode_liberar: false,
    });
  });

  it("visitas da semana e pós-venda de 2 a 5 dias", () => {
    const visita = {
      cliente: "Loja Bella",
      dataSugerida: null,
      descricao: "Medir fachada",
      endereco: "Rua 1",
      responsavelNome: "Montagem",
      vendedor: "Rafael",
    };
    const ordem = {
      cliente: "Clínica",
      descricao: "Placa",
      vendedor: "Rafael",
      clienteConfirmouEm: null,
    };
    const r = montarEntradaSkillComercial(
      base({
        visitas: [
          { ...visita, numero: 1, status: "agendada", agendadaPara: "2026-11-27T12:00:00Z" },
          { ...visita, numero: 2, status: "agendada", agendadaPara: "2026-12-20T12:00:00Z" },
          { ...visita, numero: 3, status: "solicitada", agendadaPara: null },
          { ...visita, numero: 4, status: "realizada", agendadaPara: "2026-11-20T12:00:00Z" },
        ],
        ordensConcluidas: [
          { ...ordem, numero: 15, concluidaEm: "2026-11-23T15:00:00Z" },
          { ...ordem, numero: 16, concluidaEm: "2026-11-25T15:00:00Z" },
        ],
      }),
    );
    expect(
      r.visitas_e_pos_venda.map((v) => ("visita" in v ? `${v.visita}:${v.status}` : v.os)),
    ).toEqual(["VIS-1:AGENDADA", "VIS-3:AGUARDANDO_AGENDA_PCP", "OS-15"]);
  });

  it("filtro do vendedor pelo nome digitado", () => {
    expect(mesmoVendedor("Laila Teixeira de Pinho", "Laila")).toBe(true);
    expect(mesmoVendedor("RAFAEL", "Rafael Souza")).toBe(true);
    expect(mesmoVendedor("Rafael", "")).toBe(true);
    expect(mesmoVendedor("", "Rafael")).toBe(false);
    expect(mesmoVendedor("Marcos", "Rafael")).toBe(false);
    expect(urgenciaRenovacao(3)).toBe("CRITICO");
    expect(urgenciaRenovacao(4)).toBe("ATENCAO");
  });
});
