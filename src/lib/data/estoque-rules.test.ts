import { describe, expect, it } from "vitest";
import {
  canExcluirMovimento,
  canListarMaterial,
  canMovimentarEstoque,
  canVerCustoEstoque,
  filtrarProdutos,
  lerNumero,
  linhasDaPlanilha,
  linhasListaCompras,
  nomeDoSetor,
  sinalMovimento,
} from "./estoque-rules";

const u = (...funcoes: string[]) => ({ funcoes });

describe("permissões do estoque", () => {
  it("só estoque, gestão e direção movimentam", () => {
    expect(canMovimentarEstoque(u("estoque"))).toBe(true);
    expect(canMovimentarEstoque(u("direcao"))).toBe(true);
    expect(canMovimentarEstoque(u("producao", "pcp"))).toBe(false);
    expect(canMovimentarEstoque(null)).toBe(false);
  });
  it("financeiro vê custo mas não movimenta; só gestão exclui lançamento", () => {
    expect(canVerCustoEstoque(u("financeiro"))).toBe(true);
    expect(canVerCustoEstoque(u("producao"))).toBe(false);
    expect(canExcluirMovimento(u("estoque"))).toBe(false);
    expect(canExcluirMovimento(u("gestor"))).toBe(true);
  });
});

describe("regras do estoque", () => {
  it("baixa e perda subtraem; ajuste mantém o sinal", () => {
    expect(sinalMovimento("Baixa", 3)).toBe(-3);
    expect(sinalMovimento("Perda", 1)).toBe(-1);
    expect(sinalMovimento("Devolução", 2)).toBe(2);
    expect(sinalMovimento("Ajuste", -4)).toBe(-4);
  });
  it("lê números no formato brasileiro", () => {
    expect(lerNumero("1.234,50")).toBe(1234.5);
    expect(lerNumero("R$ 12,5")).toBe(12.5);
    expect(lerNumero("0.10")).toBe(0.1);
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("abc")).toBeNull();
  });
  it("nome do setor pelo prefixo", () => {
    expect(nomeDoSetor("06")).toBe("Insumos");
    expect(nomeDoSetor("99")).toBe("99");
  });
  it("busca ignora acento e filtra pelo setor do código", () => {
    const ps = [
      { nome: "Cola instantânea", codigo: "06.0001", setorNome: "Insumos", fornecedor: "Loja A" },
      { nome: "Lona 440g", codigo: "01.0001", setorNome: "Impressão", fornecedor: null },
    ];
    expect(filtrarProdutos(ps, "instantanea", "").map((p) => p.codigo)).toEqual(["06.0001"]);
    expect(filtrarProdutos(ps, "loja a", "").map((p) => p.codigo)).toEqual(["06.0001"]);
    expect(filtrarProdutos(ps, "", "01").map((p) => p.codigo)).toEqual(["01.0001"]);
  });
});

describe("planilha do estoque", () => {
  it("aceita cabeçalhos com acento e apelidos e descarta linhas sem produto", () => {
    const linhas = linhasDaPlanilha([
      { Código: "", Material: "Cola  rápida", Setor: "Insumos", Qtd: "1.234,5", Valor: "R$ 8,50" },
      { Código: "", Material: "", Setor: "", Qtd: "", Valor: "" },
    ]);
    expect(linhas).toEqual([
      {
        codigo: "",
        produto: "Cola rápida",
        setor: "Insumos",
        unidade: "",
        quantidade: "1234.5",
        custo: "8.5",
        fornecedor: "",
        lote: "",
        minimo: "",
        observacao: "",
      },
    ]);
  });
  it("exige a coluna produto", () => {
    expect(() => linhasDaPlanilha([{ codigo: "06.0001" }])).toThrow(/produto/);
  });
  it("planilha vazia não tem linhas", () => {
    expect(linhasDaPlanilha([])).toEqual([]);
  });
});

describe("lista de compras (0048)", () => {
  const base = {
    unidade: "m²",
    fornecedor: "Forn A",
    ultimoValor: 20,
    ultimoLote: "L1",
    saldo: 7,
    reservado: 9,
  };
  const previsao = [
    { ...base, codigo: "06.0001", nome: "Cola", falta: 0, faltaComMinimo: 3, ultimoValor: null },
    { ...base, codigo: "01.0001", nome: "Lona", falta: 2, faltaComMinimo: 3 },
    { ...base, codigo: "01.0002", nome: "Vinil", falta: 0, faltaComMinimo: 0 },
  ];
  it("só o que falta, em ordem de código", () => {
    expect(linhasListaCompras(previsao, false)).toEqual([
      {
        material: "Lona",
        codigo: "01.0001",
        fornecedor: "Forn A",
        ultimo_valor_pago: "20",
        lote: "L1",
        comprar: "2",
        unidade: "m²",
        saldo: "7",
        reservado: "9",
      },
    ]);
  });
  it("com o estoque mínimo entra quem fica abaixo dele; sem custo, valor vazio", () => {
    const linhas = linhasListaCompras(previsao, true);
    expect(linhas.map((l) => [l.codigo, l.comprar, l.ultimo_valor_pago])).toEqual([
      ["01.0001", "3", "20"],
      ["06.0001", "3", ""],
    ]);
  });
  it("quem monta a lista de material", () => {
    expect(canListarMaterial({ funcoes: ["projetos_especiais"] })).toBe(true);
    expect(canListarMaterial({ funcoes: ["comercial", "producao"] })).toBe(false);
  });
});
