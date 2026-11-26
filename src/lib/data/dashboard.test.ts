import { describe, expect, it } from "vitest";
import {
  abreNoDashboard,
  esperaMaisAntiga,
  SECOES_DASHBOARD,
  secoesVisiveis,
  taxaConversao,
  valorDoIndicador,
  variacaoPercentual,
  variacaoPontos,
  type DashboardResumo,
} from "./dashboard";

const ids = (f: Parameters<typeof secoesVisiveis>[0]) => secoesVisiveis(f, false).map((s) => s.id);

const resumo = (): DashboardResumo => ({
  hoje: "2026-11-26",
  mes_inicio: "2026-11-01",
  anterior_inicio: "2026-10-01",
  anterior_fim: "2026-10-26",
  comercial: {
    pedidos_mes: { valor: 11200, quantidade: 4, valor_anterior: 10000, quantidade_anterior: 3 },
    propostas_abertas: { quantidade: 7, valor: 35000 },
    conversao: { aprovadas: 12, recusadas: 8, aprovadas_anterior: 5, recusadas_anterior: 5 },
    propostas_vencendo: { quantidade: 0, lista: [] },
  },
  producao: {
    ordens_atrasadas: 2,
    ordens_andamento: { aguardando: 3, em_andamento: 5 },
    servicos_hoje: { total: 10, concluidos: 4 },
    nao_realizados: 1,
  },
  projetos: {
    em_andamento: 9,
    atrasados: 1,
    bloqueios: 0,
    liberacoes_fila: { quantidade: 2, mais_antiga_em: "2026-11-23T13:00:00Z" },
  },
  midia: {
    atual: {
      ano: 2026,
      numero: 24,
      inicio: "2026-11-16",
      fim: "2026-11-29",
      faces: 40,
      ocupadas: 20,
      reservadas: 10,
      livres: 10,
    },
    proxima: null,
    pontos_manutencao: 3,
  },
  financeiro: {
    receber_vencido: { valor: 1500, quantidade: 1 },
    receber_7_dias: { valor: 0, quantidade: 0 },
    pagar_7_dias: { vencido: 300, proximos: 700 },
    recebido_mes: { valor: 5000, valor_anterior: 0 },
  },
});

describe("dashboard sections", () => {
  it("gestão sees every section", () => {
    expect(secoesVisiveis([], true)).toHaveLength(SECOES_DASHBOARD.length);
  });

  it("each function sees only its sections (docs/dashboard-indicadores.md, pergunta 1)", () => {
    expect(ids(["direcao"])).toEqual(["comercial", "producao", "projetos", "midia", "financeiro"]);
    expect(ids(["comercial"])).toEqual(["comercial", "midia"]);
    expect(ids(["pcp"])).toEqual(["producao", "projetos"]);
    expect(ids(["financeiro"])).toEqual(["financeiro"]);
    expect(ids(["montagem", "criacao"])).toEqual([]);
  });

  it("only gestão and direção open the app on the Dashboard", () => {
    expect(abreNoDashboard([], true)).toBe(true);
    expect(abreNoDashboard(["direcao"], false)).toBe(true);
    expect(abreNoDashboard(["comercial", "pcp"], false)).toBe(false);
  });

  it("indicator ids are unique and every one reads the resumo", () => {
    const todos = SECOES_DASHBOARD.flatMap((s) => s.indicadores.map((i) => i.id));
    expect(new Set(todos).size).toBe(todos.length);
    for (const id of todos) expect(valorDoIndicador(id, resumo())).not.toBeNull();
  });
});

describe("dashboard numbers", () => {
  it("variation against the same stretch of last month", () => {
    expect(variacaoPercentual(11200, 10000)).toEqual({ texto: "↑ 12%", sentido: "sobe" });
    expect(variacaoPercentual(9000, 10000)).toEqual({ texto: "↓ 10%", sentido: "desce" });
    expect(variacaoPercentual(100, 100)?.sentido).toBe("igual");
    expect(variacaoPercentual(100, 0)).toBeUndefined();
  });

  it("conversion shows the numbers behind the % and a dash with nothing decided", () => {
    expect(taxaConversao(12, 8)).toBe(60);
    expect(taxaConversao(0, 0)).toBeNull();
    expect(valorDoIndicador("conversao", resumo())).toEqual({
      principal: "60%",
      detalhe: "12 de 20",
      variacao: { texto: "↑ 10 p.p.", sentido: "sobe" },
    });
    const r = resumo();
    r.comercial.conversao = {
      aprovadas: 0,
      recusadas: 0,
      aprovadas_anterior: 1,
      recusadas_anterior: 0,
    };
    expect(valorDoIndicador("conversao", r)?.principal).toBe("—");
    expect(variacaoPontos(null, 50)).toBeUndefined();
  });

  it("cards with detail keep the parts apart", () => {
    const r = resumo();
    expect(valorDoIndicador("ordens-andamento", r)).toEqual({
      principal: "8",
      detalhe: "3 aguardando · 5 em andamento",
    });
    expect(valorDoIndicador("servicos-hoje", r)?.principal).toBe("4 / 10");
    expect(valorDoIndicador("ocupacao-bissemana", r)?.principal).toBe("75%");
    expect(valorDoIndicador("ocupacao-bissemana", r)?.detalhe).toContain(
      "20 ocupadas · 10 reservadas",
    );
    expect(valorDoIndicador("faces-livres", r)?.detalhe).toBe("de 40 faces ativas");
    expect(valorDoIndicador("proxima-bissemana", r)?.principal).toBe("—");
    const pagar = valorDoIndicador("pagar-7-dias", r);
    expect(pagar?.detalhe).toMatch(/300 já vencido · .*700 nos próximos 7 dias/);
    expect(valorDoIndicador("recebido-mes", r)?.variacao).toBeUndefined();
  });

  it("how long the oldest liberação waits (São Paulo day)", () => {
    expect(esperaMaisAntiga("2026-11-23T13:00:00Z", "2026-11-26")).toBe("a mais antiga há 3 dias");
    // 01:00 UTC on the 26th is still the 25th in São Paulo.
    expect(esperaMaisAntiga("2026-11-26T01:00:00Z", "2026-11-26")).toBe("a mais antiga há 1 dia");
    expect(esperaMaisAntiga("2026-11-26T15:00:00Z", "2026-11-26")).toBe("a mais antiga é de hoje");
    expect(esperaMaisAntiga(null, "2026-11-26")).toBeUndefined();
  });

  it("financeiro cards read nothing without permission", () => {
    const r = resumo();
    r.financeiro = null;
    expect(valorDoIndicador("receber-vencido", r)).toBeNull();
  });
});
