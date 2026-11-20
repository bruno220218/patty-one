import { describe, expect, it } from "vitest";
import {
  alternarStatus,
  bissemanaAtual,
  bissemanasDoAno,
  canEditarMidia,
  canMarcarOcupacao,
  contarPorStatus,
  criarMapaOcupacao,
  filtrarPorOcupacao,
  parseCoord,
  parseMedida,
  PROXIMO_STATUS,
  rotuloBissemana,
  statusDoPonto,
  validarPonto,
  type PeriodoOficial,
  type PontoForm,
} from "./midia-rules";
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

const calendario: PeriodoOficial[] = [
  { ano: 2026, numero: 23, codigoSige: 46, inicio: "2026-11-02", fim: "2026-11-15" },
  { ano: 2026, numero: 1, codigoSige: 2, inicio: "2025-12-29", fim: "2026-01-11" },
  { ano: 2027, numero: 1, codigoSige: 2, inicio: "2026-12-28", fim: "2027-01-10" },
];

describe("mídia: calendário", () => {
  it("ordena o ano e mostra o código do SIGE", () => {
    const b = bissemanasDoAno(2026, calendario);
    expect(b.map((x) => x.numero)).toEqual([1, 23]);
    expect(rotuloBissemana(b[1]!)).toBe("B46 · 02/11–15/11");
  });
  it("acha a bi-semana de hoje, inclusive na virada do ano", () => {
    expect(bissemanaAtual("2026-11-14", calendario)).toEqual({ ano: 2026, numero: 23 });
    expect(bissemanaAtual("2026-12-28", calendario)).toEqual({ ano: 2027, numero: 1 });
    expect(bissemanaAtual("2030-05-01", calendario)).toEqual({ ano: 2030, numero: 0 });
  });
});

describe("mídia: ocupação", () => {
  const pontos = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const mapa = criarMapaOcupacao([
    { pontoId: "a", bissemana: 5, status: "Ocupado", cliente: "X" },
    { pontoId: "b", bissemana: 5, status: "Reservado", cliente: null },
    { pontoId: "a", bissemana: 6, status: "Livre", cliente: null },
  ]);
  it("sem registro é Livre", () => {
    expect(statusDoPonto(mapa, "c", 5)).toBe("Livre");
    expect(statusDoPonto(mapa, "a", 6)).toBe("Livre");
  });
  it("filtra e conta por situação", () => {
    expect(filtrarPorOcupacao(pontos, mapa, 5, ["Livre", "Reservado"]).map((p) => p.id)).toEqual([
      "b",
      "c",
    ]);
    expect(filtrarPorOcupacao(pontos, mapa, 5, []).length).toBe(3);
    expect(contarPorStatus(pontos, mapa, 5)).toEqual({ Livre: 1, Reservado: 1, Ocupado: 1 });
  });
  it("clique alterna e o chip entra e sai", () => {
    expect(PROXIMO_STATUS[PROXIMO_STATUS[PROXIMO_STATUS.Livre]]).toBe("Livre");
    expect(alternarStatus(["Livre"], "Ocupado")).toEqual(["Livre", "Ocupado"]);
    expect(alternarStatus(["Livre", "Ocupado"], "Livre")).toEqual(["Ocupado"]);
  });
  it("quem edita pontos e quem marca bi-semanas", () => {
    expect(canEditarMidia(user("pcp"))).toBe(true);
    expect(canEditarMidia(user("producao"))).toBe(false);
    expect(canMarcarOcupacao(user("comercial"))).toBe(true);
    expect(canMarcarOcupacao(user("pcp"))).toBe(false);
  });
});

describe("mídia: ponto", () => {
  const base: PontoForm = {
    codigo: "",
    nome: "Outdoor Av. Brasil",
    tipoId: "t",
    endereco: "",
    bairro: "",
    cidade: "",
    estado: "",
    referencia: "",
    latitude: "",
    longitude: "",
    faces: "1",
    largura: "",
    altura: "",
    iluminado: false,
    status: "Ativo",
    observacao: "",
  };
  it("lê coordenadas e medidas", () => {
    expect(parseCoord("-23,5505201", "lat")).toBe(-23.55052);
    expect(parseCoord("200", "lng")).toBe("invalido");
    expect(parseCoord(" ", "lat")).toBeNull();
    expect(parseMedida("9,5")).toBe(9.5);
    expect(parseMedida("0")).toBe("invalido");
  });
  it("valida o formulário", () => {
    expect(validarPonto(base)).toBeNull();
    expect(validarPonto({ ...base, nome: " " })).toMatch(/nome/);
    expect(validarPonto({ ...base, tipoId: "" })).toMatch(/tipo/);
    expect(validarPonto({ ...base, latitude: "-23,5" })).toMatch(/juntas/);
    expect(validarPonto({ ...base, faces: "0" })).toMatch(/Faces/);
    expect(validarPonto({ ...base, estado: "MGS" })).toMatch(/UF/);
  });
});
