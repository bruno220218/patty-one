import { describe, expect, it } from "vitest";
import {
  canEditLiberacoes,
  emptyLiberacaoItem,
  formatTamanho,
  isBlankLiberacaoItem,
  liberacaoItemCount,
  LIBERACAO_MODELO_INFO,
  joinMultiplos,
  onlyDigits,
  splitMultiplos,
  parseCm,
} from "./rules";
import { MIDIA_OPTIONS } from "./liberacao-options";

describe("liberação rules", () => {
  it("only gestão and comercial can edit", () => {
    expect(canEditLiberacoes({ isGestor: true, isComercial: false })).toBe(true);
    expect(canEditLiberacoes({ isGestor: false, isComercial: true })).toBe(true);
    expect(canEditLiberacoes({ isGestor: false, isComercial: false })).toBe(false);
    expect(canEditLiberacoes(null)).toBe(false);
  });

  it("parses sizes in cm with pt-BR decimals", () => {
    expect(parseCm("120")).toBe(120);
    expect(parseCm("120,5")).toBe(120.5);
    expect(parseCm("1.200,5")).toBe(1200.5);
    expect(parseCm(" ")).toBeNull();
    expect(parseCm("abc")).toBeNaN();
    expect(parseCm("-3")).toBeNaN();
  });

  it("formats L x A", () => {
    expect(formatTamanho(120, 80.5)).toBe("120 x 80,5");
    expect(formatTamanho(120, null)).toBe("120 x —");
    expect(formatTamanho(null, null)).toBe("");
  });

  it("detects blank rows and counts filled items", () => {
    expect(isBlankLiberacaoItem(emptyLiberacaoItem())).toBe(true);
    expect(isBlankLiberacaoItem({ ...emptyLiberacaoItem(), insumos: "ACM" })).toBe(false);
    expect(isBlankLiberacaoItem({ ...emptyLiberacaoItem(), referencia: "P-12" })).toBe(false);
    expect(isBlankLiberacaoItem({ ...emptyLiberacaoItem(), quantidade: 2 })).toBe(false);
    expect(isBlankLiberacaoItem({ ...emptyLiberacaoItem(), larguraCm: 10 })).toBe(false);
    expect(
      liberacaoItemCount([emptyLiberacaoItem(), { ...emptyLiberacaoItem(), servico: "BANNER" }]),
    ).toBe(1);
  });
});

describe("modelo mídia", () => {
  it("names the insumos column Mídia and has no local de instalação", () => {
    expect(LIBERACAO_MODELO_INFO.midia.insumos).toBe("Mídia");
    expect(LIBERACAO_MODELO_INFO.midia.localInstalacao).toBe(false);
    expect(LIBERACAO_MODELO_INFO.projeto.localInstalacao).toBe(true);
  });

  it("uses the adjusted lists", () => {
    expect(MIDIA_OPTIONS.instalacao).toEqual([
      "PAREDE",
      "PLACA",
      "PORTA",
      "VIDRO",
      "PERSONALIZADOS",
      "SOMENTE ENTREGAR",
    ]);
    expect(MIDIA_OPTIONS.insumos).not.toContain("ABRAÇADEIRA");
    expect(MIDIA_OPTIONS.insumos).not.toContain("ADESIVO INFLEX 2000");
    expect(MIDIA_OPTIONS.acabamento).not.toContain("DUPLA FACE");
    expect(MIDIA_OPTIONS.acabamento).not.toContain("DUPLA FACE TRANSPARENTE");
  });

  it("quantity keeps digits only", () => {
    expect(onlyDigits("12a,5")).toBe("125");
    expect(onlyDigits("abc")).toBe("");
  });
});

describe("multi-pick (Projetos: insumos e acabamento)", () => {
  it("is enabled only for Projetos", () => {
    expect(LIBERACAO_MODELO_INFO.projeto.multiplos).toEqual(["insumos", "acabamento"]);
    expect(LIBERACAO_MODELO_INFO.midia.multiplos).toEqual([]);
  });

  it("splits and joins without blanks or repeats", () => {
    expect(splitMultiplos("ACM FOSCO, PINTURA ,, ")).toEqual(["ACM FOSCO", "PINTURA"]);
    expect(joinMultiplos(["ACM FOSCO", " pintura", "PINTURA", "", "Acrílico"])).toBe(
      "ACM FOSCO, pintura, Acrílico",
    );
    expect(joinMultiplos([])).toBe("");
  });
});
