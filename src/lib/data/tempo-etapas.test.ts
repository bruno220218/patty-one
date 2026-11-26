import { describe, expect, it } from "vitest";
import {
  estimarHorasEtapa,
  horasGastas,
  JANELA_AMOSTRAS,
  mediana,
  normalizarEtapa,
  progressoEtapa,
  situacaoEtapa,
  textoHoras,
  type AmostraTempo,
  type Complexidade,
} from "./producao-rules";

const amostra = (
  horas: number,
  p: Partial<AmostraTempo> & { complexidade?: Complexidade } = {},
): AmostraTempo => ({
  servicoId: "acm",
  etapa: "Corte e dobra ACM",
  complexidade: "Média",
  concluidoEm: "2026-11-01T10:00:00Z",
  maiorTrechoHoras: Math.min(horas, 8),
  horas,
  ...p,
});

describe("tempo das etapas: estimativa adaptativa", () => {
  const alvo = { servicoId: "acm", etapa: "Corte e dobra ACM", complexidade: "Média" as const };

  it("sem histórico não estima", () => {
    expect(estimarHorasEtapa(alvo, [])).toBeNull();
    expect(estimarHorasEtapa(alvo, [amostra(5, { etapa: "Serralheria" })])).toBeNull();
  });

  it("usa a mediana do mesmo serviço, etapa e complexidade", () => {
    const r = estimarHorasEtapa(alvo, [amostra(8), amostra(10), amostra(30), amostra(9)]);
    expect(r).toEqual({ horas: 9.5, amostras: 4, base: "servico_complexidade" });
  });

  it("serviços complexos e simples não se misturam", () => {
    const amostras = [
      amostra(4, { complexidade: "Simples" }),
      amostra(5, { complexidade: "Simples" }),
      amostra(4, { complexidade: "Simples" }),
      amostra(20, { complexidade: "Complexa" }),
      amostra(24, { complexidade: "Complexa" }),
      amostra(22, { complexidade: "Complexa" }),
    ];
    expect(estimarHorasEtapa({ ...alvo, complexidade: "Simples" }, amostras)?.horas).toBe(4);
    expect(estimarHorasEtapa({ ...alvo, complexidade: "Complexa" }, amostras)?.horas).toBe(22);
  });

  it("com poucas amostras, sobe para a mesma etapa e complexidade em outros serviços", () => {
    const r = estimarHorasEtapa(alvo, [
      amostra(10),
      amostra(6, { servicoId: "lona" }),
      amostra(7, { servicoId: "lona" }),
      amostra(8, { servicoId: "placa" }),
    ]);
    expect(r?.base).toBe("etapa_complexidade");
    expect(r?.horas).toBe(7.5);
  });

  it("sem nenhum grupo com 3 amostras, usa o mais específico que tiver alguma", () => {
    const r = estimarHorasEtapa(alvo, [amostra(10), amostra(2, { complexidade: "Simples" })]);
    expect(r).toEqual({ horas: 10, amostras: 1, base: "servico_complexidade" });
  });

  it("o nome da etapa ignora maiúsculas, acentos e espaços", () => {
    expect(normalizarEtapa("  Instalação   EXTERNA ")).toBe("instalacao externa");
    const r = estimarHorasEtapa({ ...alvo, etapa: "corte e DOBRA acm" }, [amostra(6)]);
    expect(r?.horas).toBe(6);
  });

  it("descarta trecho esquecido aberto (mais de 12 h seguidas)", () => {
    const r = estimarHorasEtapa(alvo, [amostra(6), amostra(40, { maiorTrechoHoras: 40 })]);
    expect(r).toEqual({ horas: 6, amostras: 1, base: "servico_complexidade" });
  });

  it("só as amostras mais recentes contam: o tempo se adapta", () => {
    const antigas = Array.from({ length: JANELA_AMOSTRAS }, (_, i) =>
      amostra(20, { concluidoEm: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z` }),
    );
    const novas = Array.from({ length: JANELA_AMOSTRAS }, (_, i) =>
      amostra(10, { concluidoEm: `2026-10-${String(i + 1).padStart(2, "0")}T10:00:00Z` }),
    );
    expect(estimarHorasEtapa(alvo, [...antigas, ...novas])?.horas).toBe(10);
  });

  it("ordem sem serviço usa a etapa e a complexidade", () => {
    const r = estimarHorasEtapa({ ...alvo, servicoId: null }, [amostra(4), amostra(6), amostra(5)]);
    expect(r?.base).toBe("etapa_complexidade");
    expect(r?.horas).toBe(5);
  });

  it("mediana", () => {
    expect(mediana([])).toBe(0);
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
  });
});

describe("tempo das etapas: apontamentos", () => {
  const agora = new Date("2026-11-26T15:00:00Z");

  it("soma horas x pessoas e conta o trecho aberto até agora", () => {
    expect(
      horasGastas(
        [
          { inicio: "2026-11-26T08:00:00Z", fim: "2026-11-26T10:00:00Z", pessoas: 2 },
          { inicio: "2026-11-26T13:30:00Z", fim: null, pessoas: 1 },
        ],
        agora,
      ),
    ).toBe(5.5);
    expect(horasGastas([], agora)).toBe(0);
  });

  it("situação da etapa", () => {
    expect(situacaoEtapa({ concluido: false, trechos: [] })).toBe("Pendente");
    expect(situacaoEtapa({ concluido: false, trechos: [{ fim: null }] })).toBe("Em andamento");
    expect(situacaoEtapa({ concluido: false, trechos: [{ fim: "x" }] })).toBe("Pausada");
    expect(situacaoEtapa({ concluido: true, trechos: [{ fim: "x" }] })).toBe("Concluída");
  });

  it("progresso: só a baixa chega a 100%", () => {
    expect(progressoEtapa(true, 0, null)).toBe(100);
    expect(progressoEtapa(false, 3, 6)).toBe(50);
    expect(progressoEtapa(false, 9, 6)).toBe(95);
    expect(progressoEtapa(false, 0, null)).toBe(0);
    expect(progressoEtapa(false, 2, null)).toBeNull();
  });

  it("texto das horas", () => {
    expect(textoHoras(0.75)).toBe("45 min");
    expect(textoHoras(3.46)).toBe("3,5 h");
    expect(textoHoras(12)).toBe("12 h");
  });
});
