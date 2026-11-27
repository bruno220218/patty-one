import { describe, expect, it } from "vitest";
import {
  calcularComposicao,
  canDecidirOrcamento,
  canEditarCustosOrcamento,
  canEnviarOrcamento,
  canMontarOrcamento,
  CONFIG_PADRAO,
  etapaDoOrcamento,
  margemPct,
  orcamentoTravado,
  podeEditarItensVenda,
  rotuloOrcamento,
  secaoDe,
  situacaoDaLinha,
  totaisPlanilha,
} from "./orcamento-rules";

describe("composição do orçamento", () => {
  it("segue a planilha: custo ÷ 0,55 / 0,59 / 0,62 e entrada de 50%", () => {
    // Custo 46,61 (o exemplo da planilha): venda 84,75, com desconto 79,00, sem nota 75,18.
    const c = calcularComposicao(
      [{ secao: "Painel", quantidade: 1, valorUnitario: 46.61 }],
      [],
      CONFIG_PADRAO,
    );
    expect(c).toMatchObject({ custo: 46.61, venda: 84.75, desconto: 79, semNota: 75.18 });
    expect(c.entrada).toBe(42.37);
  });
  it("separa materiais, serviços, mão de obra e deslocamento", () => {
    const c = calcularComposicao(
      [
        { secao: "Painel", quantidade: 2, valorUnitario: 94.2 },
        { secao: "Estrutura", quantidade: 3, valorUnitario: 42 },
        { secao: "", quantidade: 1, valorUnitario: null },
      ],
      [
        { secao: "Letreiro", grupo: "Serviço", quantidade: 10, valorUnitario: 4.5 },
        { secao: "", grupo: null, quantidade: 1, valorUnitario: 5 },
        { secao: "", grupo: "Mão de obra", quantidade: 0.11, valorUnitario: 305.52 },
        { secao: "", grupo: "Deslocamento", quantidade: 20, valorUnitario: 8 },
      ],
      CONFIG_PADRAO,
    );
    expect(c.porSecao).toMatchObject({ Painel: 188.4, Estrutura: 126, Letreiro: 45, Outros: 5 });
    expect(c).toMatchObject({
      materiais: 314.4,
      servicos: 50,
      maoDeObra: 33.61,
      deslocamento: 160,
      custo: 558.01,
    });
  });
  it("seção desconhecida vai para Outros; só gestão e direção editam os custos", () => {
    expect(secaoDe("Pintura")).toBe("Pintura");
    expect(secaoDe("")).toBe("Outros");
    expect(canEditarCustosOrcamento({ funcoes: ["direcao"] })).toBe(true);
    expect(canEditarCustosOrcamento({ funcoes: ["projetos_especiais"] })).toBe(false);
  });
});

describe("fluxo do orçamento", () => {
  it("margem, etapa e trava", () => {
    expect(margemPct(55, 100)).toBe(45);
    expect(margemPct(10, 0)).toBeNull();
    expect(etapaDoOrcamento("devolvido")).toBe(0);
    expect(etapaDoOrcamento("aguardando_aprovacao")).toBe(1);
    expect(etapaDoOrcamento("aprovado")).toBe(2);
    expect(orcamentoTravado("aprovado")).toBe(true);
    expect(orcamentoTravado("em_orcamento")).toBe(false);
  });
  it("Projetos edita só a proposta que está com eles", () => {
    const pj = { funcoes: ["projetos_especiais"] };
    expect(podeEditarItensVenda(pj, false, "proposta", "em_orcamento")).toBe(true);
    expect(podeEditarItensVenda(pj, false, "proposta", "aguardando_aprovacao")).toBe(false);
    expect(podeEditarItensVenda(pj, false, "proposta", null)).toBe(false);
    expect(podeEditarItensVenda({ funcoes: ["comercial"] }, true, "pedido", null)).toBe(true);
    expect(canDecidirOrcamento(pj)).toBe(false);
    expect(canEnviarOrcamento(pj)).toBe(true);
  });
});

describe("orçamento como a planilha", () => {
  it("rótulo e somatória (MP + MOD) com os fatores", () => {
    expect(rotuloOrcamento({ numero: 1, mes: 11 })).toBe("Nº 01 · NOVEMBRO");
    const t = totaisPlanilha(
      [
        { secao: "Painel", quantidade: 0.5, valorUnitario: 480 },
        { secao: "Letreiro", quantidade: 10, valorUnitario: 4.5 },
        { secao: "Mão de obra", quantidade: 0.11, valorUnitario: 305.52 },
        { secao: "Deslocamento", quantidade: 10, valorUnitario: 8 },
        { secao: "Estrutura", quantidade: 0, valorUnitario: 42 },
      ],
      CONFIG_PADRAO,
    );
    expect(t).toMatchObject({ materiaPrima: 285, maoDeObra: 113.61, custo: 398.61 });
    expect(t.porCamada.Painel).toBe(240);
    expect(t.venda).toBe(724.74);
  });
  it("situação da linha pelo estoque", () => {
    expect(situacaoDaLinha(0, 5).tipo).toBe("vazio");
    expect(situacaoDaLinha(2, null).tipo).toBe("sem_estoque");
    expect(situacaoDaLinha(2, 5).tipo).toBe("ok");
    expect(situacaoDaLinha(2, -1)).toEqual({ tipo: "comprar", falta: 2 });
    expect(situacaoDaLinha(3, 1)).toEqual({ tipo: "comprar", falta: 2 });
    expect(canMontarOrcamento({ funcoes: ["comercial"] })).toBe(false);
  });
});
