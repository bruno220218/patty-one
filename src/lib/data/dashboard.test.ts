import { describe, expect, it } from "vitest";
import { SECOES_DASHBOARD, secoesVisiveis } from "./dashboard";

describe("dashboard", () => {
  it("gestão sees every section", () => {
    expect(secoesVisiveis([], true)).toHaveLength(SECOES_DASHBOARD.length);
  });

  it("Financeiro needs the financeiro or direção function", () => {
    const ids = (f: Parameters<typeof secoesVisiveis>[0]) =>
      secoesVisiveis(f, false).map((s) => s.id);
    expect(ids(["comercial"])).not.toContain("financeiro");
    expect(ids(["financeiro"])).toContain("financeiro");
    expect(ids(["direcao"])).toContain("financeiro");
  });

  it("indicator ids are unique (docs/dashboard-indicadores.md refers to them)", () => {
    const ids = SECOES_DASHBOARD.flatMap((s) => s.indicadores.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
