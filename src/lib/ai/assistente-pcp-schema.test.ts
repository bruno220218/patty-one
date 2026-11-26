import { describe, expect, it } from "vitest";
import {
  assistenteRequestSchema,
  jsonDaResposta,
  lerSugestaoLiberacao,
  lerSugestaoOrdem,
  lerSugestaoPrazo,
  lerSugestaoProgramacao,
} from "./assistente-pcp-schema";

describe("assistente do PCP", () => {
  it("aceita só momento conhecido e id uuid", () => {
    const id = "6f1c6a59-2d8b-4c62-9e1a-3c1a2b0d9e11";
    expect(assistenteRequestSchema.safeParse({ momento: "prazo", id }).success).toBe(true);
    expect(assistenteRequestSchema.safeParse({ momento: "outro", id }).success).toBe(false);
    expect(assistenteRequestSchema.safeParse({ momento: "prazo", id: "1" }).success).toBe(false);
    expect(assistenteRequestSchema.safeParse({ momento: "ordem", id }).success).toBe(true);
    expect(
      assistenteRequestSchema.safeParse({ momento: "programacao", data: "2026-11-26" }).success,
    ).toBe(true);
    expect(assistenteRequestSchema.safeParse({ momento: "programacao", id }).success).toBe(false);
  });

  it("lê a revisão da ordem só com complexidade e prioridade da lista", () => {
    const s = lerSugestaoOrdem(
      JSON.stringify({
        resumo: "Corte parado há 2 dias",
        complexidade: { valor: "complexa", motivo: "Fachada grande" },
        prioridade: { valor: "Altíssima", motivo: "?" },
        etapas_paradas: ["Corte: pausada por falta de lona"],
        conferir: [],
      }),
    );
    expect(s?.complexidade).toEqual({ valor: "Complexa", motivo: "Fachada grande" });
    expect(s?.prioridade).toBeNull();
    expect(s?.etapasParadas).toEqual(["Corte: pausada por falta de lona"]);
    expect(lerSugestaoOrdem("{}")).toBeNull();
  });

  it("lê a revisão do dia só com ordens que estavam no contexto", () => {
    const s = lerSugestaoProgramacao(
      JSON.stringify({
        resumo: "Dia cheio na Externa",
        prioridades: [
          { ordem: 40, motivo: "Vence amanhã" },
          { ordem: 999, motivo: "Inventada" },
        ],
        conflitos: ["Ana em dois serviços"],
      }),
      [40, 41],
    );
    expect(s?.prioridades).toEqual([{ ordem: 40, motivo: "Vence amanhã" }]);
    expect(s?.conflitos).toEqual(["Ana em dois serviços"]);
  });

  it("acha o JSON mesmo com cercas e texto em volta", () => {
    expect(jsonDaResposta('Aqui:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(jsonDaResposta("sem json")).toBeNull();
    expect(jsonDaResposta("{quebrado")).toBeNull();
  });

  it("lê a sugestão de prazo e descarta data inválida ou passada", () => {
    const ok = lerSugestaoPrazo(
      '{"data_sugerida":"2026-12-18","resumo":"Cabe na semana 51","motivos":["Pouca carga"],"alertas":[]}',
      "2026-11-26",
    );
    expect(ok).toEqual({
      dataSugerida: "2026-12-18",
      resumo: "Cabe na semana 51",
      motivos: ["Pouca carga"],
      alertas: [],
    });
    expect(
      lerSugestaoPrazo('{"data_sugerida":"2026-11-01","resumo":"x"}', "2026-11-26")?.dataSugerida,
    ).toBeNull();
    expect(
      lerSugestaoPrazo('{"data_sugerida":"2026-02-30","resumo":"x"}', "2026-01-01")?.dataSugerida,
    ).toBeNull();
    expect(lerSugestaoPrazo("nada", "2026-11-26")).toBeNull();
  });

  it("lê a revisão da liberação e só aceita checklists que existem", () => {
    const s = lerSugestaoLiberacao(
      JSON.stringify({
        resumo: "Falta o projetista",
        faltando: ["Projetista"],
        prazo: { avaliacao: "apertado", comentario: "Semana cheia" },
        checklists: [
          { ordem: 12, checklist: "fachada acm", motivo: "Item de fachada" },
          { ordem: 13, checklist: "Inventado", motivo: "?" },
          { ordem: "x", checklist: "Fachada ACM", motivo: "?" },
        ],
      }),
      ["Fachada ACM", "Lona"],
    );
    expect(s?.prazo).toEqual({ avaliacao: "apertado", comentario: "Semana cheia" });
    expect(s?.checklists).toEqual([
      { ordem: 12, checklist: "Fachada ACM", motivo: "Item de fachada" },
    ]);
    expect(lerSugestaoLiberacao('{"prazo":{"avaliacao":"talvez"}}', [])).toBeNull();
  });
});
