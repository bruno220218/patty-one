import { describe, expect, it } from "vitest";
import { montarEmailLiberacao } from "./liberacao-email";

describe("montarEmailLiberacao", () => {
  const base = {
    numero: 12,
    modelo: "projeto" as const,
    cliente: "MEDAVIE",
    responsavel: "",
    contato: "",
    endereco: "Rua <A> & B",
    vendedor: "VITOR",
    dataEntrega: "2026-11-30",
    decididoPorNome: "Anna",
    observacoes: "",
    itens: [
      {
        servico: "PLACA",
        insumos: "ACRÍLICO 3 MM",
        acabamento: "",
        instalacao: "",
        detalhes: "",
        largura: 30,
        altura: 10,
        quantidade: 1,
      },
      {
        servico: "",
        insumos: "",
        acabamento: "",
        instalacao: "",
        detalhes: "",
        largura: null,
        altura: null,
        quantidade: null,
      },
    ],
  };

  it("monta assunto, dados e itens (sem linhas vazias)", () => {
    const { subject, html } = montarEmailLiberacao(base, "https://app/liberacoes/1");
    expect(subject).toBe("Liberação nº 12 aprovada - MEDAVIE");
    expect(html).toContain("30/11/2026");
    expect(html).toContain("30 x 10");
    expect(html).toContain("https://app/liberacoes/1");
    expect(html.match(/<tr><td style="border-bottom/g)).toHaveLength(1);
    expect(html).not.toContain("Responsável");
  });

  it("escapa HTML", () => {
    const { html } = montarEmailLiberacao(base, "x");
    expect(html).toContain("Rua &lt;A&gt; &amp; B");
  });
});
