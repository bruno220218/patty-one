import { describe, expect, it } from "vitest";
import {
  abreviarNome,
  alertaPrazo,
  canExecutarOperacao,
  canGerirOperacao,
  capacidadeNumerica,
  dataBR,
  etapasDaOrdem,
  normalizarPlaca,
  podeConcluirOrdem,
  progressoOrdem,
  rotuloVeiculo,
  textoAlertaPrazo,
  validarEquipe,
  validarOrdem,
  validarVeiculo,
} from "./producao-rules";
import {
  adicionarDias,
  agendamentosTemConflito,
  diasDoPeriodo,
  eventoNoDia,
  inicioDaSemana,
  periodoDaVisao,
  periodosSeSobrepoem,
  validarAgendamento,
} from "./planejamento-rules";
import {
  agruparResumo,
  detectarConflitos,
  diasEmAberto,
  duplicarLinha,
  idsComAlertaPendente,
  linhaVazia,
  ordenarPorSetor,
  quantidadeServicosNoDia,
  SETORES_PROGRAMACAO,
  textoWhatsApp,
  validarLinha,
  type Alocacao,
  type ItemResumo,
} from "./programacao-rules";
import type { CurrentUser, Funcao } from "./types";

const user = (...funcoes: Funcao[]): CurrentUser => ({
  id: "u",
  email: null,
  name: "Pessoa",
  isMember: true,
  isGestor: funcoes.includes("gestor"),
  isComercial: funcoes.includes("comercial"),
  funcoes,
});

describe("permissões da operação", () => {
  it("Gestão e PCP gerem; Produção e Montagem só executam", () => {
    expect(canGerirOperacao(user("pcp"))).toBe(true);
    expect(canGerirOperacao(user("gestor"))).toBe(true);
    expect(canGerirOperacao(user("producao"))).toBe(false);
    expect(canExecutarOperacao(user("producao"))).toBe(true);
    expect(canExecutarOperacao(user("montagem"))).toBe(true);
    expect(canExecutarOperacao(user("comercial"))).toBe(false);
    expect(canExecutarOperacao(null)).toBe(false);
  });
});

describe("ordens de produção", () => {
  it("usa as etapas padrão quando o serviço não informa fluxo", () => {
    expect(etapasDaOrdem("Instalação", [])).toEqual([
      "Preparação",
      "Logística",
      "Instalação",
      "Conferência",
    ]);
    expect(etapasDaOrdem("Impressão", null)).toEqual([
      "Arte e preparação",
      "Impressão",
      "Acabamento",
      "Conferência",
    ]);
  });
  it("preserva as etapas do serviço e ignora valores que não são texto", () => {
    expect(etapasDaOrdem("Impressão", ["Criação", 3, " Produção "])).toEqual([
      "Criação",
      "Produção",
    ]);
  });
  it("progresso e conclusão", () => {
    const etapas = [
      { concluido: true },
      { concluido: true },
      { concluido: false },
      { concluido: false },
    ];
    expect(progressoOrdem(etapas)).toBe(50);
    expect(progressoOrdem([])).toBe(0);
    expect(podeConcluirOrdem([{ concluido: true }, { concluido: false }])).toBe(false);
    expect(podeConcluirOrdem([{ concluido: true }, { concluido: true }])).toBe(true);
    expect(podeConcluirOrdem([])).toBe(false);
  });
  it("alertas de prazo: atrasada, hoje, até 3 dias, sem alerta", () => {
    expect(alertaPrazo("2026-11-13", "Em andamento", "2026-11-15")).toEqual({
      tipo: "atrasada",
      dias: 2,
    });
    expect(alertaPrazo("2026-11-15", "Aguardando", "2026-11-15")).toEqual({
      tipo: "proxima",
      dias: 0,
    });
    expect(textoAlertaPrazo({ tipo: "proxima", dias: 0 })).toBe("Vence hoje");
    expect(textoAlertaPrazo({ tipo: "proxima", dias: 1 })).toBe("Vence amanhã");
    expect(textoAlertaPrazo({ tipo: "atrasada", dias: 1 })).toBe("Atrasada há 1 dia");
    expect(alertaPrazo("2026-11-18", "Aguardando", "2026-11-15")).toEqual({
      tipo: "proxima",
      dias: 3,
    });
    expect(alertaPrazo("2026-11-19", "Aguardando", "2026-11-15")).toBeNull();
    expect(alertaPrazo("2026-11-14", "Concluída", "2026-11-15")).toBeNull();
    expect(alertaPrazo("2026-11-14", "Cancelada", "2026-11-15")).toBeNull();
    expect(alertaPrazo("2026-11-14", "Aguardando cliente", "2026-11-15")).toBeNull();
    expect(alertaPrazo("2026-11-14", "Aguardando conferência", "2026-11-15")?.tipo).toBe(
      "atrasada",
    );
    expect(alertaPrazo(null, "Aguardando", "2026-11-15")).toBeNull();
  });
  it("exige local só para instalação", () => {
    const base = { descricao: "Outdoor", localInstalacao: "", etapas: ["x"] };
    expect(validarOrdem({ ...base, tipo: "Instalação" })).toBe("Informe o local da instalação.");
    expect(validarOrdem({ ...base, tipo: "Impressão" })).toBeNull();
    expect(validarOrdem({ ...base, tipo: "Impressão", etapas: [] })).toMatch(/etapa/);
    expect(validarOrdem({ ...base, tipo: "Impressão", semPedidoExigeMotivo: true })).toMatch(
      /motivo/,
    );
    expect(
      validarOrdem({
        ...base,
        tipo: "Impressão",
        semPedidoExigeMotivo: true,
        motivoSemPedido: "Garantia",
      }),
    ).toBeNull();
  });
});

describe("equipes, veículos e nomes", () => {
  const valida = {
    nome: "Equipe Alfa",
    setor: "Externa",
    capacidade: "16",
    colaboradores: ["p1"],
    veiculos: ["v1"],
  };
  it("valida equipe", () => {
    expect(validarEquipe({ ...valida, setor: "" })).toBe("Informe o setor da equipe.");
    expect(validarEquipe({ ...valida, capacidade: "0" })).toBe(
      "A capacidade diária deve ser maior que zero.",
    );
    expect(validarEquipe({ ...valida, colaboradores: [], veiculos: [] })).toMatch(
      /colaborador ou um veículo/,
    );
    expect(validarEquipe(valida)).toBeNull();
    expect(capacidadeNumerica("8,5")).toBe(8.5);
  });
  it("valida e mostra veículos", () => {
    expect(validarVeiculo({ placa: " " })).toBe("Informe a placa do veículo.");
    expect(normalizarPlaca(" qul1d28 ")).toBe("QUL1D28");
    expect(normalizarPlaca("RTC-9")).toBe("RTC-9");
    expect(rotuloVeiculo({ apelido: "Caminhão externa", modelo: "710", placa: "KDZ-2941" })).toBe(
      "Caminhão externa — KDZ-2941",
    );
    expect(rotuloVeiculo({ modelo: "710", placa: "KDZ-2941" })).toBe("710 — KDZ-2941");
  });
  it("abrevia nomes só para exibição", () => {
    expect(abreviarNome("João Carlos da Silva Pereira")).toBe("João Carlos");
    expect(abreviarNome("Maria de Souza Lima")).toBe("Maria Souza");
    expect(abreviarNome("Beatriz e Silva Costa")).toBe("Beatriz Silva");
    expect(abreviarNome("  João   Carlos  ")).toBe("João Carlos");
    expect(abreviarNome("Madonna")).toBe("Madonna");
    expect(abreviarNome("Maria de")).toBe("Maria de");
    expect(abreviarNome("")).toBe("");
  });
  it("formata datas", () => {
    expect(dataBR("2026-11-20")).toBe("20/11/2026");
    expect(dataBR("2026-11-20T10:00:00Z")).toBe("20/11/2026");
    expect(dataBR(null)).toBe("");
  });
});

describe("planejamento (cronograma)", () => {
  it("semana começa na segunda; mês tem 42 dias", () => {
    expect(inicioDaSemana("2026-11-15")).toBe("2026-11-09");
    expect(periodoDaVisao("2026-11-15", "semanal")).toEqual({
      inicio: "2026-11-09",
      fim: "2026-11-15",
    });
    expect(periodoDaVisao("2026-11-15", "diario")).toEqual({
      inicio: "2026-11-15",
      fim: "2026-11-15",
    });
    const mes = periodoDaVisao("2026-11-15", "mensal");
    expect(mes).toEqual({ inicio: "2026-10-26", fim: "2026-12-06" });
    expect(diasDoPeriodo(mes)).toHaveLength(42);
    expect(adicionarDias("2026-11-15", 1)).toBe("2026-11-16");
  });
  it("evento aparece em todos os dias do período", () => {
    const e = { dataInicio: "2026-11-16", dataFim: "2026-11-18" };
    expect(eventoNoDia(e, "2026-11-16")).toBe(true);
    expect(eventoNoDia(e, "2026-11-18")).toBe(true);
    expect(eventoNoDia(e, "2026-11-19")).toBe(false);
  });
  it("conflitos e reservas", () => {
    const dia = { dataInicio: "2026-11-16", dataFim: "2026-11-16" };
    expect(
      periodosSeSobrepoem(
        { ...dia, horaInicio: "08:00", horaFim: "10:00" },
        { ...dia, horaInicio: "10:00", horaFim: "12:00" },
      ),
    ).toBe(false);
    expect(
      agendamentosTemConflito(
        { ...dia, tipo: "Agendamento" },
        { ...dia, tipo: "Reserva de urgência" },
      ),
    ).toBe(true);
    expect(
      agendamentosTemConflito(
        { ...dia, tipo: "Urgência" },
        { ...dia, tipo: "Reserva de urgência" },
      ),
    ).toBe(false);
    expect(
      agendamentosTemConflito({ ...dia, tipo: "Urgência" }, { ...dia, tipo: "Agendamento" }),
    ).toBe(true);
  });
  it("exige colaborador, veículo ou equipe", () => {
    const base = {
      titulo: "Instalação",
      dataInicio: "2026-11-16",
      dataFim: "2026-11-16",
      horaInicio: "",
      horaFim: "",
      veiculoId: "",
      equipe: [],
      equipeId: "",
    };
    expect(validarAgendamento(base)).toMatch(/colaborador ou um veículo/);
    expect(validarAgendamento({ ...base, veiculoId: "v1" })).toBeNull();
    expect(validarAgendamento({ ...base, equipeId: "e1" })).toBeNull();
    expect(validarAgendamento({ ...base, veiculoId: "v1", horaInicio: "10:00" })).toMatch(
      /horário/,
    );
  });
});

const aloc = (p: Partial<Alocacao>): Alocacao => ({
  id: "x",
  grupo: "g",
  descricao: "",
  dataInicio: "2026-11-16",
  dataFim: "2026-11-16",
  colaboradores: [],
  ...p,
});

describe("programação de serviços", () => {
  it("tem os 7 setores", () => {
    expect(SETORES_PROGRAMACAO).toEqual([
      "Externa",
      "Projetos especiais",
      "Serralheria",
      "Acabamento e montagem",
      "Produção",
      "Corte",
      "Pintura",
    ]);
  });
  it("ordena os grupos pela ordem da lista de setores; nomes fora da lista vão para o fim", () => {
    const lista = ["Impressão", "Corte", "Pintura"];
    expect(ordenarPorSetor(lista, ["Pintura", "Zeta", "Impressão", "Alfa", "Corte"])).toEqual([
      "Impressão",
      "Corte",
      "Pintura",
      "Alfa",
      "Zeta",
    ]);
  });
  it("nova linha é vazia exceto pela data; duplicar cria outro serviço", () => {
    const anterior = {
      ...linhaVazia("2026-11-16"),
      id: "s1",
      setor: "Serralheria" as const,
      cliente: "ACME",
      ajudantes: ["a1"],
      status: "Concluído" as const,
    };
    const nova = linhaVazia("2026-11-17");
    expect(nova).toMatchObject({
      data: "2026-11-17",
      setor: "",
      cliente: "",
      ajudantes: [],
      conflitoConfirmado: false,
    });
    expect(nova.chave).not.toBe(anterior.chave);
    const copia = duplicarLinha(anterior);
    expect(copia.id).toBeUndefined();
    expect(copia.status).toBe("Programado");
    expect(copia.ajudantes).toEqual(["a1"]);
    expect(copia.ajudantes).not.toBe(anterior.ajudantes);
    expect(copia.chave).not.toBe(anterior.chave);
  });
  it("valida linhas", () => {
    const base = {
      data: "2026-11-16",
      setor: "Externa" as const,
      servico: "Instalação",
      quantidade: "1",
      horaInicio: "",
      horaFim: "",
    };
    expect(validarLinha({ ...base, setor: "" })).toBe("Informe o setor.");
    expect(validarLinha({ ...base, servico: " " })).toBe("Informe o serviço.");
    expect(validarLinha({ ...base, quantidade: "0" })).toMatch(/quantidade/);
    expect(validarLinha({ ...base, quantidade: "2,5" })).toBeNull();
    expect(validarLinha({ ...base, quantidade: "" })).toBeNull();
  });
  it("recurso compartilhado é só aviso, inclusive na mesma equipe", () => {
    expect(
      detectarConflitos([
        aloc({ id: "a", grupo: "equipe:1", colaboradores: ["p1"] }),
        aloc({ id: "b", grupo: "equipe:2", colaboradores: ["p1"] }),
      ]),
    ).toEqual([{ recurso: "colaborador", recursoId: "p1", alocacoes: ["a", "b"] }]);
    expect(
      detectarConflitos([
        aloc({ id: "a", grupo: "equipe:1", colaboradores: ["p1"] }),
        aloc({ id: "b", grupo: "equipe:1", colaboradores: ["p1"] }),
      ]),
    ).toHaveLength(1);
    expect(
      detectarConflitos([aloc({ id: "a", veiculoId: "v" }), aloc({ id: "b", veiculoId: "v" })])[0]
        ?.recurso,
    ).toBe("veiculo");
    expect(
      detectarConflitos([
        aloc({ id: "a", colaboradores: ["p"] }),
        aloc({ id: "b", colaboradores: ["p"], dataInicio: "2026-11-17", dataFim: "2026-11-17" }),
      ]),
    ).toEqual([]);
  });
  it("confirmação tira o aviso e mantém o contador de serviços no dia", () => {
    const confirmadas = [
      aloc({ id: "a", colaboradores: ["p"], confirmado: true }),
      aloc({ id: "b", colaboradores: ["p"], confirmado: true }),
    ];
    const conflitos = detectarConflitos(confirmadas);
    expect(idsComAlertaPendente(conflitos, confirmadas).size).toBe(0);
    expect(quantidadeServicosNoDia("a", conflitos)).toBe(2);
    const uma = [
      aloc({ id: "a", colaboradores: ["p"], confirmado: true }),
      aloc({ id: "b", colaboradores: ["p"] }),
    ];
    expect([...idsComAlertaPendente(detectarConflitos(uma), uma)]).toEqual(["b"]);
  });
  it("conta dias em aberto das pendências", () => {
    expect(diasEmAberto("2026-11-12", "2026-11-16")).toBe(4);
    expect(diasEmAberto("2026-11-20", "2026-11-16")).toBe(0);
  });
});

describe("resumo do dia e WhatsApp", () => {
  const it1: ItemResumo = {
    id: "1",
    origem: "programacao",
    equipeId: "e",
    equipeNome: "Equipe A",
    liderNome: "João",
    ajudantesNomes: ["Pedro"],
    veiculoId: "v",
    veiculoNome: "ABC1D23",
    cliente: "ACME",
    servico: "Instalação",
    produto: "Outdoor",
    detalhamento: "Lona nova",
    local: "Av. Brasil, 100",
    quantidade: 1,
    status: "Programado",
    setor: "Externa",
    imagens: [],
  };
  it("agrupa por equipe e veículo com contagens, ordenado por horário", () => {
    const [g] = agruparResumo([
      it1,
      { ...it1, id: "2", status: "Concluído" },
      { ...it1, id: "3", status: "Não realizado" },
    ]);
    expect(g).toMatchObject({
      titulo: "Equipe A / João",
      programados: 1,
      concluidos: 1,
      pendentes: 1,
      veiculo: "ABC1D23",
      ajudantes: ["Pedro"],
    });
    const [h] = agruparResumo([
      { ...it1, id: "tarde", horaInicio: "14:00" },
      { ...it1, id: "cedo", horaInicio: "08:00" },
    ]);
    expect(h?.itens.map((i) => i.id)).toEqual(["cedo", "tarde"]);
  });
  it("texto com data, equipe, veículo, itens, observação, agendamento e links do Drive", () => {
    const t = textoWhatsApp(
      "2026-11-16",
      agruparResumo([
        {
          ...it1,
          observacao: "Levar escada",
          imagens: [
            { id: "a1", nome: "estrutura.png", url: "https://drive.google.com/file/d/abc/view" },
          ],
        },
        { ...it1, id: "ag-1", origem: "agendamento", servico: "Instalação agendada" },
      ]),
    );
    expect(t).toContain("📅 *PROGRAMAÇÃO 16/11/2026*");
    expect(t).toContain("👥 *Equipe A / João / Pedro* · 🚚 ABC1D23");
    expect(t).toContain("ACME — Instalação Outdoor");
    expect(t).toContain("📝 Lona nova");
    expect(t).toContain("📍 Av. Brasil, 100");
    expect(t).toContain("💬 Levar escada");
    expect(t).toContain("https://drive.google.com/file/d/abc/view");
    expect(t).toContain("📌 Agendamento do cronograma");
    expect(textoWhatsApp("2026-11-16", [])).toContain("Nenhum serviço programado.");
  });
});

describe("programação: vários dias e pendências", () => {
  it("lista os dias do período pulando fim de semana", async () => {
    const { datasDoPeriodo } = await import("./programacao-rules");
    // 2026-11-20 is a Friday
    expect(datasDoPeriodo("2026-11-20", "2026-11-24", { sabado: false, domingo: false })).toEqual([
      "2026-11-20",
      "2026-11-23",
      "2026-11-24",
    ]);
    expect(
      datasDoPeriodo("2026-11-20", "2026-11-22", { sabado: true, domingo: true }),
    ).toHaveLength(3);
    expect(datasDoPeriodo("2026-11-20", "", { sabado: false, domingo: false })).toEqual([
      "2026-11-20",
    ]);
  });

  it("valida o período", async () => {
    const { validarPeriodo } = await import("./programacao-rules");
    const op = { sabado: false, domingo: false };
    expect(validarPeriodo("2026-11-20", "", op)).toMatch(/até quando/);
    expect(validarPeriodo("2026-11-20", "2026-11-19", op)).toMatch(/depois/);
    expect(validarPeriodo("2026-11-21", "2026-11-22", op)).toMatch(/Nenhum dia/);
    expect(validarPeriodo("2026-01-01", "2026-12-31", op)).toMatch(/no máximo/);
    expect(validarPeriodo("2026-11-20", "2026-11-27", op)).toBeNull();
  });

  it("gera uma linha por dia, a primeira mantém o id", async () => {
    const { linhaVazia, linhasDoPeriodo } = await import("./programacao-rules");
    const base = { ...linhaVazia("2026-11-20"), id: "x", chave: "x", servico: "Lona" };
    const ls = linhasDoPeriodo(base, ["2026-11-20", "2026-11-23"]);
    expect(ls.map((l) => l.data)).toEqual(["2026-11-20", "2026-11-23"]);
    expect(ls[0]!.id).toBe("x");
    expect(ls[1]!.id).toBeUndefined();
    expect(ls[1]!.chave).not.toBe("x");
  });

  it("serviço de dia passado sem baixa", async () => {
    const { estaSemBaixa } = await import("./programacao-rules");
    expect(estaSemBaixa({ data: "2026-11-20", status: "Programado" }, "2026-11-22")).toBe(true);
    expect(estaSemBaixa({ data: "2026-11-20", status: "Em andamento" }, "2026-11-22")).toBe(true);
    expect(estaSemBaixa({ data: "2026-11-20", status: "Concluído" }, "2026-11-22")).toBe(false);
    expect(estaSemBaixa({ data: "2026-11-22", status: "Programado" }, "2026-11-22")).toBe(false);
  });

  it("ordens sem programação", async () => {
    const { ordensSemProgramacao } = await import("./programacao-rules");
    expect(ordensSemProgramacao([{ id: "a" }, { id: "b" }], ["b", ""])).toEqual([{ id: "a" }]);
  });
});

describe("programação: sugestões ao digitar", () => {
  const ops = [
    { id: "1", rotulo: "Instalação de lona" },
    { id: "2", rotulo: "Lona impressa" },
    { id: "3", rotulo: "Adesivo" },
    { id: "4", rotulo: "Retirada de lona", busca: "remoção" },
  ];
  it("acha por qualquer parte, sem acento, começando pelos que iniciam igual", async () => {
    const { filtrarSugestoes } = await import("./programacao-rules");
    expect(filtrarSugestoes(ops, "lona").map((o) => o.id)).toEqual(["2", "1", "4"]);
    expect(filtrarSugestoes(ops, "instalacao").map((o) => o.id)).toEqual(["1"]);
    expect(filtrarSugestoes(ops, "remoção").map((o) => o.id)).toEqual(["4"]);
    expect(filtrarSugestoes(ops, "lona ret").map((o) => o.id)).toEqual(["4"]);
    expect(filtrarSugestoes(ops, "")).toHaveLength(4);
  });
  it("completa o resto da palavra", async () => {
    const { completarPalavra } = await import("./programacao-rules");
    expect(completarPalavra("lo", "Lona impressa")).toBe("na impressa");
    expect(completarPalavra("imp", "Lona impressa")).toBe("");
    expect(completarPalavra("", "Lona")).toBe("");
  });
  it("monta o endereço do ponto", async () => {
    const { enderecoDoPonto } = await import("./programacao-rules");
    expect(
      enderecoDoPonto({
        endereco: "Av. Brasil, 100",
        bairro: "Centro",
        cidade: "Goiânia",
        estado: "GO",
      }),
    ).toBe("Av. Brasil, 100, Centro, Goiânia/GO");
    expect(enderecoDoPonto({ endereco: "Rua 1", referencia: "posto" })).toBe("Rua 1 — ref.: posto");
  });
});
