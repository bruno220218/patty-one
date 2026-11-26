import { describe, expect, it } from "vitest";
import {
  canAprovarLiberacoes,
  canEditLiberacoes,
  filaPcp,
  emptyLiberacaoItem,
  formatTamanho,
  isBlankLiberacaoItem,
  liberacaoItemCount,
  modeloDoPedido,
  LIBERACAO_MODELO_INFO,
  joinMultiplos,
  onlyDigits,
  splitMultiplos,
  parseCm,
} from "./rules";
import { LISTAS_PADRAO, MIDIA_OPTIONS, resolverListas, type OpcaoCampo } from "./liberacao-options";

describe("liberação rules", () => {
  it("only gestão and comercial edit; PCP, direção and gestão approve", () => {
    const u = (...funcoes: string[]) => ({ funcoes });
    expect(canEditLiberacoes(u("gestor"))).toBe(true);
    expect(canEditLiberacoes(u("comercial"))).toBe(true);
    expect(canEditLiberacoes(u("pcp", "producao"))).toBe(false);
    expect(canEditLiberacoes(null)).toBe(false);
    expect(canAprovarLiberacoes(u("pcp"))).toBe(true);
    expect(canAprovarLiberacoes(u("direcao"))).toBe(true);
    expect(canAprovarLiberacoes(u("gestor"))).toBe(true);
    expect(canAprovarLiberacoes(u("comercial", "criacao", "montagem"))).toBe(false);
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

describe("fila do PCP", () => {
  it("keeps only waiting ones, oldest submission first (resubmitted go to the end)", () => {
    const l = (numero: number, status: string, enviadaEm: string) => ({
      numero,
      status,
      enviadaEm,
    });
    const fila = filaPcp([
      l(5, "aguardando", "2026-11-16T10:00:00Z"),
      l(3, "aprovada", "2026-11-15T09:00:00Z"),
      l(2, "aguardando", "2026-11-16T15:00:00Z"), // reenviada depois de reprovada
      l(4, "reprovada", "2026-11-16T08:00:00Z"),
      l(6, "aguardando", "2026-11-16T11:00:00Z"),
    ]);
    expect(fila.map((x) => x.numero)).toEqual([5, 6, 2]);
  });
});

describe("listas editáveis", () => {
  const o = (
    modelo: "projeto" | "midia" | "todos",
    campo: OpcaoCampo,
    valor: string,
    position: number,
  ) => ({
    id: `${modelo}-${campo}-${valor}`,
    modelo,
    campo,
    valor,
    position,
  });

  it("falls back to the built-in lists when the table has nothing", () => {
    expect(resolverListas(undefined)).toBe(LISTAS_PADRAO);
    expect(resolverListas([])).toBe(LISTAS_PADRAO);
  });

  it("uses the saved rows in their order, per model", () => {
    const l = resolverListas([
      o("midia", "instalacao", "VIDRO", 2),
      o("midia", "instalacao", "PAREDE", 1),
      o("projeto", "servico", "TOTEM", 0),
      o("todos", "vendedor", "ANA", 0),
      o("todos", "projetista", "IRAUAN", 0),
    ]);
    expect(l.midia.instalacao).toEqual(["PAREDE", "VIDRO"]);
    expect(l.projeto.servico).toEqual(["TOTEM"]);
    expect(l.projeto.instalacao).toEqual([]);
    expect(l.vendedores).toEqual(["ANA"]);
    expect(l.projetistas).toEqual(["IRAUAN"]);
  });
});

describe("modeloDoPedido", () => {
  it("opens Mídia only when every item is Mídia OOH", () => {
    expect(modeloDoPedido(["Mídia OOH", "Mídia OOH"])).toBe("midia");
    expect(modeloDoPedido(["Mídia OOH", "Produção"])).toBe("projeto");
    expect(modeloDoPedido(["Serviço"])).toBe("projeto");
    expect(modeloDoPedido([])).toBe("projeto");
  });
});
