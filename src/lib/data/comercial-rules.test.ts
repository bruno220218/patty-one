import { describe, expect, it } from "vitest";
import {
  canVender,
  dataSige,
  itemVazio,
  moedaSige,
  parseValor,
  podeGerarPedido,
  prepararHistoricoSige,
  totaisVenda,
  totalItem,
  validarVenda,
  valorParaCampo,
} from "./comercial-rules";
import type { CurrentUser } from "./types";

const user = (...funcoes: string[]) =>
  ({
    id: "u",
    email: null,
    name: "U",
    isMember: true,
    isGestor: funcoes.includes("gestor"),
    isComercial: false,
    funcoes,
  }) as CurrentUser;

describe("comercial: totais", () => {
  it("item: quantidade × valor − desconto, nunca negativo", () => {
    expect(totalItem({ quantidade: 2, valorUnitario: 150.5, desconto: 1 })).toBe(300);
    expect(totalItem({ quantidade: 1, valorUnitario: 10, desconto: 50 })).toBe(0);
  });

  it("desconto geral limitado ao subtotal", () => {
    const itens = [
      { quantidade: 1, valorUnitario: 100, desconto: 0 },
      { quantidade: 3, valorUnitario: 0.1, desconto: 0 },
    ];
    expect(totaisVenda(itens, 10)).toEqual({ subtotal: 100.3, desconto: 10, total: 90.3 });
    expect(totaisVenda(itens, 500).total).toBe(0);
  });

  it("lê e escreve valores no formato brasileiro", () => {
    expect(parseValor("1.234,56")).toBe(1234.56);
    expect(parseValor("R$ 10,5")).toBe(10.5);
    expect(parseValor("12.5")).toBe(12.5);
    expect(parseValor("abc")).toBe(0);
    expect(valorParaCampo(1234.5)).toBe("1234,5");
    expect(valorParaCampo(0)).toBe("");
  });
});

describe("comercial: regras", () => {
  it("só comercial e gestão vendem", () => {
    expect(canVender(user("comercial"))).toBe(true);
    expect(canVender(user("gestor"))).toBe(true);
    expect(canVender(user("pcp"))).toBe(false);
    expect(canVender(null)).toBe(false);
  });

  it("valida empresa, cliente e itens", () => {
    const item = { ...itemVazio(), descricao: "Outdoor" };
    expect(validarVenda({ empresaId: "", cadastroId: "c", itens: [item] })).toMatch(/empresa/);
    expect(validarVenda({ empresaId: "e", cadastroId: null, itens: [item] })).toMatch(/cliente/);
    expect(validarVenda({ empresaId: "e", cadastroId: "c", itens: [itemVazio()] })).toMatch(
      /descrição/,
    );
    expect(
      validarVenda({
        empresaId: "e",
        cadastroId: "c",
        itens: [{ ...item, periodoInicio: "2026-02-10", periodoFim: "2026-02-01" }],
      }),
    ).toMatch(/período/);
    expect(validarVenda({ empresaId: "e", cadastroId: "c", itens: [item] })).toBeNull();
  });

  it("proposta vira pedido uma vez e nunca se recusada", () => {
    expect(podeGerarPedido({ tipo: "proposta", status: "Enviada", pedidoGeradoId: null })).toBe(
      true,
    );
    expect(podeGerarPedido({ tipo: "proposta", status: "Recusada", pedidoGeradoId: null })).toBe(
      false,
    );
    expect(podeGerarPedido({ tipo: "proposta", status: "Aprovada", pedidoGeradoId: "p" })).toBe(
      false,
    );
    expect(podeGerarPedido({ tipo: "pedido", status: "Aberto", pedidoGeradoId: null })).toBe(false);
  });
});

describe("comercial: histórico SIGE", () => {
  it("valores e datas do SIGE", () => {
    expect(moedaSige("R$ 1.234,50")).toBe(1234.5);
    expect(() => moedaSige("12,345")).toThrow();
    expect(dataSige("31/12/2025")).toBe("2025-12-31");
    expect(() => dataSige("31/02/2025")).toThrow();
  });

  const propostas = {
    name: "propostas.csv",
    content:
      '#,Orc.,Empresa,Cliente,Data,Total,Status,Autorização,Vendedor,Tipo\n1,500,PATTY PAINEIS LTDA,Loja X,05/01/2026,"R$ 1.000,00",APROVADO,900,Ana,Outdoor\n',
  };
  const contratos = {
    name: "contratos.csv",
    content:
      '#,Autorização,Fantasia,Data,Valor,Status,Contrato,Valor líquido\n1,900,Loja X,05/01/2026,"R$ 1.000,00",ATIVO,C-12,"R$ 900,00"\n',
  };
  const reservas = {
    name: "reservas.csv",
    content:
      '#,Autorização,Fantasia,Data,Valor,Status\n1,900,Loja X,05/01/2026,"R$ 1.000,00",ATIVO\n2,901,Loja Y,06/01/2026,R$ 50,RESERVA\n',
  };

  it("junta contrato e reserva pela autorização e pega a empresa da proposta", () => {
    const linhas = prepararHistoricoSige([reservas, propostas, contratos]);
    const contrato = linhas.find((l) => l.chave_sige === "autorizacao:900");
    expect(linhas).toHaveLength(3);
    expect(contrato).toMatchObject({
      tipo: "contrato",
      contrato_sige: "C-12",
      valor_liquido: 900,
      proposta_numero_sige: "500",
      empresa_nome: "PATTY PAINEIS LTDA",
      empresa_origem: "proposta",
      fontes: ["reservas.csv", "contratos.csv"],
    });
    expect(linhas.find((l) => l.chave_sige === "autorizacao:901")?.tipo).toBe("reserva");
  });

  it("recusa arquivos de outro formato e dados conflitantes", () => {
    expect(() => prepararHistoricoSige([{ name: "x.csv", content: "nome,cpf\nA,1\n" }])).toThrow(
      /colunas/,
    );
    const conflito = {
      ...contratos,
      content: contratos.content.replace("R$ 1.000,00", "R$ 2.000,00"),
    };
    expect(() => prepararHistoricoSige([reservas, conflito])).toThrow(/conflitantes/);
  });
});
