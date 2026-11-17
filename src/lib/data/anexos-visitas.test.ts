import { describe, expect, it } from "vitest";
import { arquivoPermitido, linkValido, tipoDoArquivo } from "./cloud-anexos";
import { normalizarVistoria, VISTORIA_VAZIA } from "./cloud-visitas";
import {
  canAgendarVisita,
  canAtenderBriefing,
  canCriarBriefing,
  canRealizarVisita,
  canSolicitarVisita,
} from "./rules";

describe("anexos", () => {
  it("reconhece o tipo pelo mime ou extensão", () => {
    expect(tipoDoArquivo("a.PDF", "")).toBe("pdf");
    expect(tipoDoArquivo("foto.jpeg", "image/jpeg")).toBe("foto");
    expect(tipoDoArquivo("v.mp4", "video/mp4")).toBe("video");
    expect(tipoDoArquivo("audio.mp3", "audio/mpeg")).toBe("audio");
    expect(arquivoPermitido("planilha.xlsx", "application/vnd.ms-excel")).toBe(false);
  });
  it("aceita só links http(s)", () => {
    expect(linkValido("  https://drive.google.com/x ")).toBe("https://drive.google.com/x");
    expect(linkValido("javascript:alert(1)")).toBeNull();
    expect(linkValido("drive.google.com")).toBeNull();
  });
});

describe("vistoria", () => {
  it("completa campos faltando e descarta valores inválidos", () => {
    const v = normalizarVistoria({ limpeza: "talvez", piso: ["Plano", 3], dificuldades: "x" });
    expect(v.limpeza).toBeNull();
    expect(v.piso).toEqual(["Plano", "3"]);
    expect(v.dificuldades).toBe("x");
    expect(normalizarVistoria(null)).toEqual(VISTORIA_VAZIA);
  });
});

describe("permissões", () => {
  const u = (...funcoes: string[]) => ({ funcoes });
  it("briefing: comercial cria, criação/projetos especiais atendem", () => {
    expect(canCriarBriefing(u("comercial"))).toBe(true);
    expect(canCriarBriefing(u("criacao"))).toBe(false);
    expect(canAtenderBriefing(u("projetos_especiais"))).toBe(true);
    expect(canAtenderBriefing(u("comercial"))).toBe(false);
  });
  it("visita: comercial pede, PCP agenda, montagem faz", () => {
    expect(canSolicitarVisita(u("comercial"))).toBe(true);
    expect(canAgendarVisita(u("pcp"))).toBe(true);
    expect(canAgendarVisita(u("montagem"))).toBe(false);
    expect(canRealizarVisita(u("montagem"))).toBe(true);
    expect(canRealizarVisita(u("comercial"))).toBe(false);
  });
});
