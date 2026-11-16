import { describe, expect, it } from "vitest";
import {
  canEditLiberacoes,
  emptyLiberacaoItem,
  formatTamanho,
  isBlankLiberacaoItem,
  liberacaoItemCount,
  parseCm,
} from "./rules";

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
