import { describe, expect, it } from "vitest";
import {
  dependeDoClima,
  faltaMaterial,
  montarEntradaSkillPcp,
  proximoDiaUtil,
  setorDaEtapa,
  type DadosSkillPcp,
  type OrdemSkill,
} from "./skill-pcp";

const SETORES = ["Externa", "Serralheria", "Corte", "Produção"];

/** Times in Brasília (-03:00). */
const t = (hora: string, dia = "2026-11-26") => new Date(`${dia}T${hora}:00-03:00`).toISOString();

function dados(ordens: OrdemSkill[], extra: Partial<DadosSkillPcp> = {}): DadosSkillPcp {
  return {
    dataReferencia: "2026-11-26",
    dataProgramacao: "2026-11-27",
    agora: new Date(t("18:00")),
    ordens,
    colaboradores: [
      { id: "c1", nome: "Carlos", ativo: true },
      { id: "c2", nome: "Dani", ativo: true },
      { id: "c3", nome: "Inativo", ativo: false },
    ],
    equipes: [
      { setor: "Serralheria", capacidade: 8.5, ativo: true, colaboradorIds: ["c1"] },
      { setor: "Externa", capacidade: 9, ativo: true, colaboradorIds: ["c1"] },
    ],
    setores: SETORES,
    historico: [
      { colaboradorId: "c1", etapa: "Serralheria", horas: 40 },
      { colaboradorId: "c1", etapa: "Solda", horas: 12 },
      { colaboradorId: "c1", etapa: "serralheria", horas: 5 },
    ],
    ...extra,
  };
}

const ordem = (p: Partial<OrdemSkill> = {}): OrdemSkill => ({
  numero: 1042,
  tipo: "Instalação",
  status: "Em andamento",
  prioridade: "Alta",
  complexidade: "Complexa",
  clienteNome: "Supermercado Alfa",
  servicoNome: "Fachada ACM + Letra Caixa",
  descricao: "Fachada",
  dataPrevista: "2026-11-30",
  etapas: [
    {
      ordem: 1,
      nome: "Serralheria",
      concluido: true,
      concluidoEm: t("10:00", "2026-11-25"),
      trechos: [],
      estimativa: { horas: 12, amostras: 5, base: "servico_complexidade" },
    },
    {
      ordem: 2,
      nome: "Corte e dobra ACM",
      concluido: false,
      concluidoEm: null,
      estimativa: { horas: 10, amostras: 4, base: "servico_complexidade" },
      trechos: [
        // Yesterday: 2 h, 1 person.
        {
          inicio: t("14:00", "2026-11-25"),
          fim: t("16:00", "2026-11-25"),
          fimTipo: "pausa",
          motivoPausa: "Fim do expediente",
          pessoas: 1,
          iniciadoPorNome: "PCP",
          colaboradorIds: ["c2"],
        },
        // Today: 3 h x 2 people, then paused for missing material.
        {
          inicio: t("08:00"),
          fim: t("11:00"),
          fimTipo: "pausa",
          motivoPausa: "Faltou 1 chapa preta fosca, chega amanhã às 08h",
          pessoas: 2,
          iniciadoPorNome: "PCP",
          colaboradorIds: ["c1", "c2"],
        },
      ],
    },
    {
      ordem: 3,
      nome: "Instalação externa",
      concluido: false,
      concluidoEm: null,
      trechos: [],
      estimativa: null,
    },
  ],
  ...p,
});

describe("skill PCP: entrada", () => {
  it("carteira com progresso, horas e estimativas aprendidas", () => {
    const r = montarEntradaSkillPcp(dados([ordem()]));
    const os = r.carteira_ordens[0]!;
    expect(os).toMatchObject({
      os: "OS-1042",
      cliente: "Supermercado Alfa",
      tipo_servico: "Fachada ACM + Letra Caixa",
      data_entrega: "2026-11-30",
      prioridade: "alta",
      complexidade: "complexa",
    });
    expect(os.etapas[0]).toMatchObject({
      situacao: "concluida",
      progresso: 100,
      horas_restantes: 0,
    });
    expect(os.etapas[1]).toMatchObject({
      setor: "Corte",
      situacao: "pausada",
      horas_gastas: 8, // 2 h ontem + 3 h x 2 hoje
      horas_estimadas: 10,
      horas_restantes: 2,
      progresso: 80,
      material_ok: false,
      motivo_pausa: "Faltou 1 chapa preta fosca, chega amanhã às 08h",
      estimativa: { amostras: 4, base: "servico_complexidade" },
    });
    expect(os.etapas[2]).toMatchObject({
      setor: "Externa",
      situacao: "pendente",
      progresso: 0,
      horas_estimadas: null,
      horas_restantes: null,
      material_ok: true,
      clima_dependente: true,
    });
  });

  it("apontamentos de hoje: uma linha por pessoa, com o progresso antes e depois", () => {
    const r = montarEntradaSkillPcp(dados([ordem()]));
    expect(r.apontamentos_hoje).toHaveLength(2);
    expect(r.apontamentos_hoje.find((a) => a.colaborador === "Carlos")).toEqual({
      os: "OS-1042",
      etapa: "Corte e dobra ACM",
      colaborador_id: "c1",
      colaborador: "Carlos",
      horas_gastas: 3,
      progresso_anterior: 20,
      progresso_atual: 80,
      situacao: "pausada",
      observacao: "Faltou 1 chapa preta fosca, chega amanhã às 08h",
    });
  });

  it("trecho que vira o dia conta só a parte de hoje; trecho aberto conta até agora", () => {
    const o = ordem({
      etapas: [
        {
          ordem: 1,
          nome: "Impressão",
          concluido: true,
          concluidoEm: t("09:00"),
          estimativa: null,
          trechos: [
            {
              inicio: t("22:00", "2026-11-25"),
              fim: t("01:00"),
              fimTipo: "pausa",
              motivoPausa: "x",
              pessoas: 1,
              iniciadoPorNome: "PCP",
              colaboradorIds: [],
            },
            {
              inicio: t("08:00"),
              fim: t("09:00"),
              fimTipo: "conclusao",
              motivoPausa: "",
              pessoas: 1,
              iniciadoPorNome: "PCP",
              colaboradorIds: [],
            },
          ],
        },
        {
          ordem: 2,
          nome: "Acabamento",
          concluido: false,
          concluidoEm: null,
          estimativa: null,
          trechos: [
            {
              inicio: t("16:30"),
              fim: null,
              fimTipo: null,
              motivoPausa: "",
              pessoas: 2,
              iniciadoPorNome: "Montagem",
              colaboradorIds: [],
            },
          ],
        },
      ],
    });
    const r = montarEntradaSkillPcp(dados([o]));
    const impressao = r.apontamentos_hoje.find((a) => a.etapa === "Impressão")!;
    expect(impressao.horas_gastas).toBe(2); // 00:00–01:00 + 08:00–09:00
    expect(impressao.colaborador).toBe("PCP");
    expect(impressao.observacao).toBe("x; Etapa concluída (baixa)");
    expect(impressao.progresso_atual).toBe(100);
    const acabamento = r.apontamentos_hoje.find((a) => a.etapa === "Acabamento")!;
    expect(acabamento.horas_gastas).toBe(3); // 1,5 h x 2 pessoas, sem nomes
    expect(acabamento.situacao).toBe("em_andamento");
  });

  it("só ordens abertas entram na carteira, a de prazo mais curto primeiro", () => {
    const r = montarEntradaSkillPcp(
      dados([
        ordem({ numero: 1, dataPrevista: "2026-12-10" }),
        ordem({ numero: 2, dataPrevista: null }),
        ordem({ numero: 3, dataPrevista: "2026-11-28", prioridade: "Normal" }),
        ordem({ numero: 4, dataPrevista: "2026-11-28", prioridade: "Urgente" }),
        ordem({ numero: 5, status: "Concluída" }),
        ordem({ numero: 6, status: "Cancelada" }),
      ]),
    );
    expect(r.carteira_ordens.map((o) => o.os)).toEqual(["OS-4", "OS-3", "OS-1", "OS-2"]);
    // An order finished today still has its records for the day.
    expect(r.apontamentos_hoje.some((a) => a.os === "OS-5")).toBe(true);
  });

  it("equipe: setor e horas da equipe, especialidades pelo histórico", () => {
    const r = montarEntradaSkillPcp(dados([]));
    expect(r.equipe_disponivel).toEqual([
      {
        id: "c1",
        nome: "Carlos",
        setor: "Serralheria",
        setores: ["Serralheria", "Externa"],
        especialidades: ["Serralheria", "Solda"],
        horas_disponiveis: 9,
        ausente: false,
      },
      {
        id: "c2",
        nome: "Dani",
        setor: null,
        setores: [],
        especialidades: [],
        horas_disponiveis: 8,
        ausente: false,
      },
    ]);
    expect(r.data_programacao).toBe("2026-11-27");
    expect(r.premissas.length).toBeGreaterThan(3);
  });
});

describe("skill PCP: deduções", () => {
  it("setor pelo nome da etapa", () => {
    expect(setorDaEtapa("Serralheria", SETORES)).toBe("Serralheria");
    expect(setorDaEtapa("Corte e dobra ACM", SETORES)).toBe("Corte");
    expect(setorDaEtapa("Instalação externa", SETORES)).toBe("Externa");
    expect(setorDaEtapa("Instalação", SETORES)).toBe("Externa");
    expect(setorDaEtapa("Conferência", SETORES)).toBeNull();
  });
  it("clima e falta de material", () => {
    expect(dependeDoClima("Colagem")).toBe(true);
    expect(dependeDoClima("Impressão")).toBe(false);
    expect(faltaMaterial("Falta de material")).toBe(true);
    expect(faltaMaterial("Faltou vinil")).toBe(true);
    expect(faltaMaterial("Fim do expediente")).toBe(false);
  });
  it("próximo dia útil pula o domingo", () => {
    expect(proximoDiaUtil("2026-11-26")).toBe("2026-11-27");
    expect(proximoDiaUtil("2026-11-28")).toBe("2026-11-30");
  });
});
