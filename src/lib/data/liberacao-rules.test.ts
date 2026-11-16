import { describe, expect, it } from "vitest";
import {
  canEditLiberacoes,
  emptyLiberacaoItem,
  formatTamanho,
  isBlankLiberacaoItem,
  liberacaoProgress,
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

  it("detects blank rows and counts checks", () => {
    expect(isBlankLiberacaoItem(emptyLiberacaoItem())).toBe(true);
    expect(isBlankLiberacaoItem({ ...emptyLiberacaoItem(), material: "ACM" })).toBe(false);
    expect(isBlankLiberacaoItem({ ...emptyLiberacaoItem(), larguraCm: 10 })).toBe(false);
    expect(liberacaoProgress([{ checked: true }, { checked: false }, { checked: true }])).toEqual({
      done: 2,
      total: 3,
    });
  });
});
