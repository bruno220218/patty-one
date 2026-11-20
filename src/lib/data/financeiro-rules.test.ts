import { describe, expect, it } from "vitest";
import {
  aluguelMensal,
  canExcluirFinanceiro,
  canFinanceiro,
  codigosMidias,
  resumoFinanceiro,
  situacaoConta,
  somarDias,
  validarAluguel,
  validarConta,
  validarEnergia,
  type AluguelForm,
  type ContaForm,
  type EnergiaForm,
} from "./financeiro-rules";
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

describe("permissões", () => {
  it("Gestão, Direção e Financeiro acessam; só Gestão e Direção excluem", () => {
    expect(canFinanceiro(user("financeiro"))).toBe(true);
    expect(canFinanceiro(user("direcao"))).toBe(true);
    expect(canFinanceiro(user("gestor"))).toBe(true);
    expect(canFinanceiro(user("comercial"))).toBe(false);
    expect(canFinanceiro(null)).toBe(false);
    expect(canExcluirFinanceiro(user("financeiro"))).toBe(false);
    expect(canExcluirFinanceiro(user("direcao"))).toBe(true);
  });
});

describe("situação da conta", () => {
  it("aberta vira vencida no dia seguinte ao vencimento", () => {
    expect(situacaoConta("Aberto", "2026-11-20", "2026-11-20")).toBe("A vencer");
    expect(situacaoConta("Aberto", "2026-11-19", "2026-11-20")).toBe("Vencido");
    expect(situacaoConta("Recebido", "2026-01-01", "2026-11-20")).toBe("Recebido");
    expect(situacaoConta("Cancelado", "2026-01-01", "2026-11-20")).toBe("Cancelado");
  });
});

describe("aluguel", () => {
  it("valor por mês conforme a periodicidade", () => {
    expect(aluguelMensal(1200, "Anual")).toBe(100);
    expect(aluguelMensal(300, "Trimestral")).toBe(100);
    expect(aluguelMensal(500, "Sem recorrência")).toBe(0);
  });
  it("lê os códigos dos pontos", () => {
    expect(codigosMidias("062, 1040,007;062")).toEqual(["062", "1040", "007"]);
    expect(codigosMidias("")).toEqual([]);
  });
});

describe("resumo", () => {
  it("soma a vencer, vencido, aluguel mensal e contratos vencendo em 30 dias", () => {
    const r = resumoFinanceiro(
      [
        { status: "Aberto", vencimento: "2026-12-01", valor: 100 },
        { status: "Aberto", vencimento: "2026-11-01", valor: 40 },
        { status: "Recebido", vencimento: "2026-11-01", valor: 999 },
      ],
      [
        { ativo: true, valor: 1200, periodicidade: "Anual", vencimento: "2026-12-10" },
        { ativo: true, valor: 50, periodicidade: "Mensal", vencimento: "2027-03-01" },
        { ativo: false, valor: 900, periodicidade: "Mensal", vencimento: "2026-11-25" },
      ],
      "2026-11-20",
    );
    expect(r).toEqual({ aVencer: 100, vencido: 40, aluguelMes: 150, alugueisVencendo: 1 });
    expect(somarDias("2026-12-25", 10)).toBe("2027-01-04");
  });
});

describe("validação", () => {
  const conta: ContaForm = {
    descricao: "Pedido 1",
    vencimento: "2026-12-01",
    valor: "10",
    cadastroId: "",
    cadastroNome: "",
    empresaId: "",
    observacao: "",
  };
  const aluguel: AluguelForm = {
    contrato: "",
    proprietario: "Dono",
    midias: "",
    periodicidade: "Mensal",
    vigencia: "2027-01-01",
    vencimento: "2026-12-01",
    valor: "0",
    ativo: true,
    validado: false,
    observacao: "",
  };
  const energia: EnergiaForm = {
    numCliente: "",
    numInstalacao: "",
    unidade: "",
    dataInicio: "",
    titular: "X",
    local: "",
    ativo: true,
    observacao: "",
  };
  it("aponta o primeiro problema", () => {
    expect(validarConta(conta, 10)).toBeNull();
    expect(validarConta(conta, 0)).toMatch(/maior que zero/);
    expect(validarConta({ ...conta, descricao: " " }, 10)).toMatch(/descrição/);
    expect(validarAluguel(aluguel, 0)).toBeNull();
    expect(validarAluguel({ ...aluguel, vencimento: "2027-02-01" }, 0)).toMatch(/vigência/);
    expect(validarEnergia(energia)).toMatch(/nº do cliente/);
    expect(validarEnergia({ ...energia, local: "Rua A" })).toBeNull();
  });
});
