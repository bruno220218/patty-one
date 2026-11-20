import { describe, expect, it } from "vitest";
import {
  cadastroPayload,
  canEditarCadastros,
  canVerBancario,
  maskCep,
  maskDocument,
  maskPhone,
  normalizeRow,
  parseBoolean,
  parseNumeric,
} from "./cadastros-rules";
import { parseCsv, parseCsvRows, toCsv } from "./csv";
import type { CurrentUser, Funcao } from "./types";

const user = (...funcoes: Funcao[]): CurrentUser => ({
  id: "u",
  email: null,
  name: "Pessoa",
  isMember: true,
  isGestor: funcoes.includes("gestor"),
  isComercial: funcoes.includes("comercial"),
  funcoes,
});

describe("conversões da planilha do SIGE", () => {
  it("converte S/N, Sim/Não e true/false", () => {
    for (const v of ["S", "Sim", "true"]) expect(parseBoolean(v)).toBe(true);
    for (const v of ["N", "Não", "false"]) expect(parseBoolean(v)).toBe(false);
    expect(parseBoolean("")).toBeNull();
    expect(() => parseBoolean("talvez")).toThrow();
  });

  it("converte vírgula decimal e ponto de milhar", () => {
    expect(parseNumeric("1.234,50")).toBe(1234.5);
    expect(parseNumeric("5,00")).toBe(5);
    expect(parseNumeric("5.5")).toBe(5.5);
    expect(() => parseNumeric("x")).toThrow();
  });

  it("normaliza cabeçalhos, validado, estado e campos vazios", () => {
    expect(
      normalizeRow({
        "﻿ NOME ": "Empresa",
        validado: "N",
        estado: "sp",
        email: "",
        is_cliente: "S",
        desconhecida: "x",
      }),
    ).toEqual({ nome: "Empresa", validado: "Não", estado: "SP", email: null, is_cliente: true });
  });
});

describe("CSV", () => {
  it("preserva aspas, vírgulas e quebras de linha, com BOM", () => {
    const { headers, rows } = parseCsv(
      '﻿nome,observacao,is_cliente,percentual_iss\r\n"Teste, Empresa","linha 1\nlinha 2",S,"5,00"\n',
    );
    expect(headers).toEqual(["nome", "observacao", "is_cliente", "percentual_iss"]);
    expect(normalizeRow(rows[0] ?? {})).toEqual({
      nome: "Teste, Empresa",
      observacao: "linha 1\nlinha 2",
      is_cliente: true,
      percentual_iss: 5,
    });
  });

  it("aceita aspas duplicadas e pula linhas em branco", () => {
    expect(parseCsvRows('a,b\n\n"diz ""oi""",2\n')).toEqual([
      ["a", "b"],
      ['diz "oi"', "2"],
    ]);
  });

  it("recusa cabeçalho duplicado e aspas sem fechamento", () => {
    expect(() => parseCsv("nome,Nome\nx,y")).toThrow(/duplicado/);
    expect(() => parseCsv('nome\n"aberta')).toThrow(/Aspas/);
  });

  it("gera CSV com BOM e protege fórmulas", () => {
    const csv = toCsv([{ linha: 2, motivo: '=1+1, "x"' }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`"'=1+1, ""x"""`);
  });
});

describe("máscaras", () => {
  it("formata CPF e CNPJ", () => {
    expect(maskDocument("12345678901")).toBe("123.456.789-01");
    expect(maskDocument("12345678000199")).toBe("12.345.678/0001-99");
  });
  it("formata CEP e telefone", () => {
    expect(maskCep("01310100")).toBe("01310-100");
    expect(maskPhone("11987654321")).toBe("(11) 98765-4321");
    expect(maskPhone("1132654321")).toBe("(11) 3265-4321");
  });
});

describe("permissões e envio da ficha", () => {
  it("comercial e gestão editam; demais só veem", () => {
    expect(canEditarCadastros(user("comercial"))).toBe(true);
    expect(canEditarCadastros(user("gestor"))).toBe(true);
    expect(canEditarCadastros(user("pcp"))).toBe(false);
    expect(canEditarCadastros(null)).toBe(false);
  });

  it("dados bancários: só direção e financeiro", () => {
    expect(canVerBancario(user("direcao"))).toBe(true);
    expect(canVerBancario(user("financeiro"))).toBe(true);
    expect(canVerBancario(user("gestor"))).toBe(false);
    expect(canVerBancario(user("comercial"))).toBe(false);
  });

  it("não envia campos bancários sem permissão e converte tipos", () => {
    const p = cadastroPayload(
      {
        nome: "  Loja ",
        is_cliente: "",
        percentual_iss: "2,5",
        banco: "001",
        restricao_sige: true,
      },
      false,
    );
    expect(p["nome"]).toBe("Loja");
    expect(p["is_cliente"]).toBe(false);
    expect(p["percentual_iss"]).toBe(2.5);
    expect("banco" in p).toBe(false);
    expect("restricao_sige" in p).toBe(false);
    expect(cadastroPayload({ nome: "x", banco: "001" }, true)["banco"]).toBe("001");
  });
});
