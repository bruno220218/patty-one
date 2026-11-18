import { describe, expect, it } from "vitest";
import {
  canEditarPaineis,
  diasEntre,
  espacosLivres,
  precisaAtencao,
  situacaoLabel,
  situacaoVinheta,
} from "./paineis-rules";

const hoje = "2026-11-18";
const v = (fim: string | null, inicio: string | null = "2026-01-01") =>
  ({ tipo: "venda", inicio, fim }) as const;

describe("situacaoVinheta", () => {
  it("counts days across months", () => {
    expect(diasEntre("2026-11-28", "2026-12-03")).toBe(5);
  });

  it("follows the e-mail rules: 7 days before, on the day, after", () => {
    expect(situacaoVinheta(v("2026-11-25"), hoje)).toEqual({ tipo: "vencendo", dias: 7 });
    expect(situacaoVinheta(v("2026-11-26"), hoje)).toEqual({ tipo: "no_ar" });
    expect(situacaoVinheta(v("2026-11-18"), hoje)).toEqual({ tipo: "hoje" });
    expect(situacaoVinheta(v("2026-11-11"), hoje)).toEqual({ tipo: "vencida", dias: 7 });
  });

  it("shows future starts and open-ended contracts", () => {
    expect(situacaoVinheta(v("2026-12-30", "2026-11-20"), hoje)).toEqual({
      tipo: "agendada",
      dias: 2,
    });
    expect(situacaoVinheta(v(null, "2019-12-13"), hoje)).toEqual({ tipo: "sem_fim" });
  });

  it("never flags blocked slots", () => {
    const s = situacaoVinheta({ tipo: "indisponivel", inicio: null, fim: "2020-01-01" }, hoje);
    expect(s.tipo).toBe("indisponivel");
    expect(precisaAtencao(s)).toBe(false);
  });

  it("writes readable labels", () => {
    expect(situacaoLabel({ tipo: "vencendo", dias: 1 })).toBe("Vence amanhã");
    expect(situacaoLabel({ tipo: "vencida", dias: 3 })).toBe("Vencida há 3 dias");
  });
});

describe("espacosLivres", () => {
  it("lists the empty slots in order", () => {
    expect(espacosLivres(6, [1, 3, 4])).toEqual([2, 5, 6]);
  });
});

describe("canEditarPaineis", () => {
  it("allows criação and gestão only", () => {
    expect(canEditarPaineis({ funcoes: ["criacao"] })).toBe(true);
    expect(canEditarPaineis({ funcoes: ["gestor"] })).toBe(true);
    expect(canEditarPaineis({ funcoes: ["comercial", "membro"] })).toBe(false);
    expect(canEditarPaineis(null)).toBe(false);
  });
});

describe("CI", () => {
  it("labels like the spreadsheet (number/month)", async () => {
    const { ciRotulo } = await import("./cloud-cis");
    expect(ciRotulo(10, "2026-11-17")).toBe("10/Nov");
    expect(ciRotulo(4, "2026-05-02")).toBe("04/Mai");
  });

  it("tracks the entry of each panel", async () => {
    const { ciSituacao, ciEditavel } = await import("./cloud-cis");
    const cp = (status: "pendente" | "aprovada" | "recusada") => ({ status }) as never;
    expect(ciSituacao({ paineis: [cp("pendente"), cp("pendente")] })).toBe("aguardando");
    expect(ciSituacao({ paineis: [cp("aprovada"), cp("pendente")] })).toBe("parcial");
    expect(ciSituacao({ paineis: [cp("aprovada"), cp("recusada")] })).toBe("concluida");
    expect(ciEditavel({ paineis: [cp("pendente")] })).toBe(true);
    expect(ciEditavel({ paineis: [cp("aprovada"), cp("pendente")] })).toBe(false);
  });
});

describe("arquivo da vinheta", () => {
  it("accepts videos, images and PDF, and rejects the rest", async () => {
    const { vinhetaPermitida, tipoDoArquivo } = await import("./cloud-anexos");
    expect(vinhetaPermitida("csfx.mp4", "video/mp4")).toBe(true);
    expect(vinhetaPermitida("csfx.mov", "video/quicktime")).toBe(true);
    expect(vinhetaPermitida("csfx.mkv", "")).toBe(true);
    expect(vinhetaPermitida("arte.gif", "image/gif")).toBe(true);
    expect(vinhetaPermitida("arte.pdf", "application/pdf")).toBe(true);
    expect(vinhetaPermitida("planilha.xlsx", "application/vnd.ms-excel")).toBe(false);
    expect(tipoDoArquivo("csfx.avi", "")).toBe("video");
  });
});
