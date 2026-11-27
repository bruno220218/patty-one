import { describe, expect, it } from "vitest";
import {
  FONTES,
  SETORES,
  SETOR_IDS,
  juntarConsultas,
  orquestradorRequestSchema,
  respostaSemAgente,
  semCota,
  setorPorFerramenta,
  textoDaSkill,
} from "./orquestrador-schema";

describe("orquestrador", () => {
  it("tem um setor por id, com ferramenta única, e só PCP e Comercial com dados", () => {
    expect(SETORES.map((s) => s.id).sort()).toEqual([...SETOR_IDS].sort());
    expect(setorPorFerramenta.size).toBe(SETORES.length);
    expect(SETORES.filter((s) => s.fonte).map((s) => s.fonte)).toEqual(FONTES);
  });

  it("aceita a pergunta com padrões e recusa o que passa dos limites", () => {
    const ok = orquestradorRequestSchema.safeParse({ mensagem: "  o que está atrasado? " });
    expect(ok.success && ok.data.mensagem).toBe("o que está atrasado?");
    expect(ok.success && ok.data.historico).toEqual([]);
    expect(ok.success && ok.data.dados).toEqual({});
    expect(orquestradorRequestSchema.safeParse({ mensagem: "   " }).success).toBe(false);
    expect(orquestradorRequestSchema.safeParse({ mensagem: "x".repeat(2001) }).success).toBe(false);
    const historico = Array.from({ length: 9 }, () => ({ papel: "usuario", texto: "oi" }));
    expect(orquestradorRequestSchema.safeParse({ mensagem: "a", historico }).success).toBe(false);
    expect(
      orquestradorRequestSchema.safeParse({ mensagem: "a", dados: { pcp: null, comercial: {} } })
        .success,
    ).toBe(true);
  });

  it("explica ao orquestrador por que o setor não respondeu", () => {
    const criacao = SETORES.find((s) => s.id === "criacao")!;
    expect(respostaSemAgente(criacao, "sem_dados")).toMatch(/^SEM_DADOS: .*Criação/);
    expect(respostaSemAgente(criacao, "sem_acesso")).toMatch(/^SEM_ACESSO/);
    expect(respostaSemAgente(criacao, "erro")).toMatch(/^ERRO/);
  });

  it("reconhece falta de cota, também embrulhada pelas tentativas do SDK", () => {
    expect(semCota({ statusCode: 429 })).toBe(true);
    expect(semCota({ message: "You exceeded your current quota" })).toBe(true);
    expect(semCota({ message: "Failed after 2 attempts", lastError: { statusCode: 429 } })).toBe(
      true,
    );
    expect(semCota({ errors: [{ statusCode: 500 }, { statusCode: 429 }] })).toBe(true);
    expect(semCota({ statusCode: 503, message: "high demand" })).toBe(false);
    expect(semCota(new Error("timeout"))).toBe(false);
    expect(semCota(null)).toBe(false);
  });

  it("tira o cabeçalho da skill", () => {
    expect(textoDaSkill("---\nname: x\ndescription: y\n---\n\n# Título\ntexto")).toBe(
      "# Título\ntexto",
    );
    expect(textoDaSkill("# Sem cabeçalho")).toBe("# Sem cabeçalho");
  });

  it("junta as consultas por setor, na ordem dos setores, ficando com a última", () => {
    expect(
      juntarConsultas([
        { setor: "comercial", nome: "Comercial", situacao: "erro" },
        { setor: "pcp", nome: "PCP", situacao: "respondeu" },
        { setor: "comercial", nome: "Comercial", situacao: "respondeu" },
      ]),
    ).toEqual([
      { setor: "pcp", nome: "PCP", situacao: "respondeu" },
      { setor: "comercial", nome: "Comercial", situacao: "respondeu" },
    ]);
  });
});
