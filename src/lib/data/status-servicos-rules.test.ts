import { describe, expect, it } from "vitest";
import {
  colunaDaOrdem,
  colunaDoProjeto,
  etapaAtualDaOrdem,
  programacaoDaOrdem,
  situacaoDaOrdem,
} from "./status-servicos-rules";

describe("Status Serviços a partir das ordens", () => {
  it("põe cada situação na coluna certa e esconde as canceladas", () => {
    expect(colunaDaOrdem("Aguardando liberação")).toBe("aguardando");
    expect(colunaDaOrdem("Aguardando")).toBe("aguardando");
    expect(colunaDaOrdem("Em andamento")).toBe("producao");
    expect(colunaDaOrdem("Aguardando conferência")).toBe("fechamento");
    expect(colunaDaOrdem("Aguardando cliente")).toBe("fechamento");
    expect(colunaDaOrdem("Concluída")).toBe("concluido");
    expect(colunaDaOrdem("Cancelada")).toBeNull();
  });

  it("mostra projetos antigos só até terminarem", () => {
    expect(colunaDoProjeto("not_started")).toBe("aguardando");
    expect(colunaDoProjeto("in_progress")).toBe("producao");
    expect(colunaDoProjeto("done")).toBeNull();
  });

  it("acha a etapa atual pela ordem das etapas", () => {
    const etapas = [
      { ordem: 2, nome: "Instalação", concluido: false },
      { ordem: 1, nome: "Preparação", concluido: true },
      { ordem: 3, nome: "Conferência", concluido: false },
    ];
    expect(etapaAtualDaOrdem(etapas)).toBe("Instalação");
    expect(etapaAtualDaOrdem(etapas.map((e) => ({ ...e, concluido: true })))).toBeNull();
    expect(etapaAtualDaOrdem([])).toBeNull();
  });

  it("descreve a situação para o comercial", () => {
    expect(situacaoDaOrdem("Em andamento", "Instalação", 4)).toBe("Etapa atual: Instalação");
    expect(situacaoDaOrdem("Aguardando", null, 0)).toMatch(/não montou/);
    expect(situacaoDaOrdem("Aguardando cliente", null, 4)).toMatch(/confirmação do cliente/);
    expect(situacaoDaOrdem("Aguardando liberação", "Preparação", 4)).toMatch(/liberação/);
  });

  it("usa a próxima data aberta da Programação, senão a última", () => {
    const s = [
      { data: "2026-11-20", status: "Concluído", equipe: "Alfa" },
      { data: "2026-11-30", status: "Programado", equipe: "Beta" },
      { data: "2026-11-28", status: "Não realizado", equipe: "Alfa" },
    ];
    expect(programacaoDaOrdem(s, "2026-11-26")).toEqual({
      data: "2026-11-30",
      status: "Programado",
      equipe: "Beta",
      proxima: true,
    });
    expect(programacaoDaOrdem(s.slice(0, 1), "2026-11-26")).toEqual({
      data: "2026-11-20",
      status: "Concluído",
      equipe: "Alfa",
      proxima: false,
    });
    expect(programacaoDaOrdem([], "2026-11-26")).toBeNull();
  });
});
