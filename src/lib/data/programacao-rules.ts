/**
 * Programação de serviços (7 setores): grid rows, shared-resource warnings, the daily
 * summary and the WhatsApp text. Pure functions, tested in programacao-rules.test.ts.
 */

export const SETORES_PROGRAMACAO = [
  "Externa",
  "Projetos especiais",
  "Serralheria",
  "Acabamento e montagem",
  "Produção",
  "Corte",
  "Pintura",
] as const;
export type SetorProgramacao = (typeof SETORES_PROGRAMACAO)[number];

export const STATUS_PROGRAMACAO = [
  "Programado",
  "Em andamento",
  "Concluído",
  "Não realizado",
  "Aguardando equipe",
] as const;
export type StatusProgramacao = (typeof STATUS_PROGRAMACAO)[number];
export const STATUS_PENDENTES: StatusProgramacao[] = ["Não realizado", "Aguardando equipe"];

export type LinhaProgramacao = {
  /** Local key: the id for saved rows, a fresh key for new ones. */
  chave: string;
  id?: string;
  data: string;
  setor: SetorProgramacao | "";
  cadastroId: string;
  cliente: string;
  produto: string;
  servico: string;
  detalhamento: string;
  pontoId: string;
  local: string;
  quantidade: string;
  equipeId: string;
  liderId: string;
  ajudantes: string[];
  veiculoId: string;
  ordemId: string;
  horaInicio: string;
  horaFim: string;
  status: StatusProgramacao;
  observacao: string;
  conflitoConfirmado: boolean;
};

let contador = 0;
export const novaChave = () => `nova-${Date.now()}-${++contador}`;

/** "Nova linha": a brand-new, empty row; only the selected date is filled. */
export function linhaVazia(data: string): LinhaProgramacao {
  return {
    chave: novaChave(),
    data,
    setor: "",
    cadastroId: "",
    cliente: "",
    produto: "",
    servico: "",
    detalhamento: "",
    pontoId: "",
    local: "",
    quantidade: "",
    equipeId: "",
    liderId: "",
    ajudantes: [],
    veiculoId: "",
    ordemId: "",
    horaInicio: "",
    horaFim: "",
    status: "Programado",
    observacao: "",
    conflitoConfirmado: false,
  };
}

/** Copy of a row as a new service (new key, no id, back to "Programado"). */
export function duplicarLinha(l: LinhaProgramacao): LinhaProgramacao {
  const { id: _id, ...resto } = l;
  return {
    ...resto,
    ajudantes: [...l.ajudantes],
    chave: novaChave(),
    status: "Programado",
    conflitoConfirmado: false,
  };
}

export function validarLinha(
  l: Pick<LinhaProgramacao, "data" | "setor" | "servico" | "quantidade" | "horaInicio" | "horaFim">,
): string | null {
  if (!l.data) return "Informe a data.";
  if (!l.setor) return "Informe o setor.";
  if (!l.servico.trim()) return "Informe o serviço.";
  const q = Number((l.quantidade || "1").replace(",", "."));
  if (!Number.isFinite(q) || q <= 0) return "A quantidade deve ser maior que zero.";
  if (!l.horaInicio !== !l.horaFim) return "Preencha início e fim, ou deixe ambos vazios.";
  if (l.horaInicio && l.horaFim <= l.horaInicio)
    return "O horário final deve ser posterior ao inicial.";
  return null;
}

export function diasEmAberto(data: string, hoje: string): number {
  const ms = Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${data}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

// ---------- Recursos compartilhados (só aviso, nunca bloqueia) ----------

export type Alocacao = {
  id: string;
  /** Same team/leader groups rows together. */
  grupo: string;
  descricao: string;
  dataInicio: string;
  dataFim: string;
  horaInicio?: string | null;
  horaFim?: string | null;
  colaboradores: string[];
  veiculoId?: string | null;
  confirmado?: boolean;
};
export type Conflito = {
  recurso: "colaborador" | "veiculo";
  recursoId: string;
  alocacoes: [string, string];
};

export function grupoDaLinha(l: {
  id?: string;
  chave?: string;
  equipeId?: string | null;
  liderId?: string | null;
}): string {
  if (l.equipeId) return `equipe:${l.equipeId}`;
  if (l.liderId) return `lider:${l.liderId}`;
  return `linha:${l.id ?? l.chave}`;
}

const mesmoDia = (a: Alocacao, b: Alocacao) =>
  !(a.dataInicio > b.dataFim || a.dataFim < b.dataInicio);

/** A person or vehicle in two allocations on the same day is only a warning, even in the same team. */
export function detectarConflitos(alocacoes: Alocacao[]): Conflito[] {
  const conflitos: Conflito[] = [];
  for (let i = 0; i < alocacoes.length; i++) {
    for (let j = i + 1; j < alocacoes.length; j++) {
      const a = alocacoes[i]!;
      const b = alocacoes[j]!;
      if (!mesmoDia(a, b)) continue;
      for (const c of a.colaboradores) {
        if (b.colaboradores.includes(c)) {
          conflitos.push({ recurso: "colaborador", recursoId: c, alocacoes: [a.id, b.id] });
        }
      }
      if (a.veiculoId && a.veiculoId === b.veiculoId) {
        conflitos.push({ recurso: "veiculo", recursoId: a.veiculoId, alocacoes: [a.id, b.id] });
      }
    }
  }
  return conflitos;
}

/** Only allocations not yet confirmed show the amber warning. */
export function idsComAlertaPendente(conflitos: Conflito[], alocacoes: Alocacao[]): Set<string> {
  const confirmadas = new Map(alocacoes.map((a) => [a.id, Boolean(a.confirmado)]));
  return new Set(conflitos.flatMap((c) => c.alocacoes.filter((id) => !confirmadas.get(id))));
}

/** "N serviços no dia" badge once confirmed. */
export function quantidadeServicosNoDia(id: string, conflitos: Conflito[]): number {
  const relacionadas = conflitos.filter((c) => c.alocacoes.includes(id));
  return new Set([id, ...relacionadas.flatMap((c) => c.alocacoes)]).size;
}

export function alocacaoDaLinha(l: LinhaProgramacao): Alocacao {
  return {
    id: l.chave,
    grupo: grupoDaLinha(l),
    descricao: `${l.setor || "Sem setor"}: ${l.servico || "serviço sem nome"}${l.cliente ? ` — ${l.cliente}` : ""}`,
    dataInicio: l.data,
    dataFim: l.data,
    horaInicio: l.horaInicio || null,
    horaFim: l.horaFim || null,
    colaboradores: [...new Set([l.liderId, ...l.ajudantes].filter(Boolean))],
    veiculoId: l.veiculoId || null,
    confirmado: l.conflitoConfirmado,
  };
}

// ---------- Resumo do dia e WhatsApp ----------

export type ImagemResumo = { id: string; nome: string; url: string };

export type ItemResumo = {
  id: string;
  origem: "programacao" | "agendamento";
  equipeId?: string | null;
  liderId?: string | null;
  liderNome?: string | null;
  equipeNome?: string | null;
  ajudantesNomes: string[];
  veiculoId?: string | null;
  veiculoNome?: string | null;
  cliente?: string | null;
  servico: string;
  produto?: string | null;
  detalhamento?: string | null;
  observacao?: string | null;
  local?: string | null;
  quantidade?: number | null;
  status: StatusProgramacao;
  setor: string;
  horaInicio?: string | null;
  imagens: ImagemResumo[];
  conflitoConfirmado?: boolean;
};

export type GrupoResumo = {
  chave: string;
  titulo: string;
  ajudantes: string[];
  veiculo: string | null;
  itens: ItemResumo[];
  programados: number;
  concluidos: number;
  pendentes: number;
};

/** One group per team/leader + vehicle, items ordered by time then client. */
export function agruparResumo(itens: ItemResumo[]): GrupoResumo[] {
  const mapa = new Map<string, GrupoResumo>();
  for (const it of itens) {
    const chave = `${it.equipeId ?? it.liderId ?? "sem"}|${it.veiculoId ?? ""}`;
    let g = mapa.get(chave);
    if (!g) {
      const titulo =
        [it.equipeNome, it.liderNome].filter(Boolean).join(" / ") || "Sem equipe definida";
      g = {
        chave,
        titulo,
        ajudantes: [],
        veiculo: it.veiculoNome ?? null,
        itens: [],
        programados: 0,
        concluidos: 0,
        pendentes: 0,
      };
      mapa.set(chave, g);
    }
    g.itens.push(it);
    for (const a of it.ajudantesNomes) if (!g.ajudantes.includes(a)) g.ajudantes.push(a);
    if (it.status === "Concluído") g.concluidos++;
    else if (STATUS_PENDENTES.includes(it.status)) g.pendentes++;
    else g.programados++;
  }
  for (const grupo of mapa.values()) {
    grupo.itens.sort(
      (a, b) =>
        (a.horaInicio ?? "23:59:59").localeCompare(b.horaInicio ?? "23:59:59") ||
        (a.cliente ?? "").localeCompare(b.cliente ?? "", "pt-BR"),
    );
  }
  return [...mapa.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
}

export function dataCurtaBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Text for WhatsApp: every sector, service and appointment of the day, with the Drive image links. */
export function textoWhatsApp(data: string, grupos: GrupoResumo[]): string {
  const linhas = [`📅 *PROGRAMAÇÃO ${dataCurtaBR(data)}*`];
  for (const g of grupos) {
    linhas.push("");
    const equipe = [g.titulo, g.ajudantes.length ? g.ajudantes.join(", ") : null]
      .filter(Boolean)
      .join(" / ");
    linhas.push(`👥 *${equipe}*${g.veiculo ? ` · 🚚 ${g.veiculo}` : ""}`);
    g.itens.forEach((it, i) => {
      const titulo = [it.cliente, [it.servico, it.produto].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" — ");
      const qtd =
        it.quantidade && it.quantidade !== 1 ? ` (${it.quantidade.toLocaleString("pt-BR")}x)` : "";
      linhas.push(
        `${i + 1}. ${it.horaInicio ? `${it.horaInicio.slice(0, 5)} ` : ""}${titulo}${qtd}`,
      );
      if (it.origem === "agendamento") linhas.push("   📌 Agendamento do cronograma");
      if (it.setor) linhas.push(`   🏭 Setor: ${it.setor}`);
      if (it.detalhamento) linhas.push(`   📝 ${it.detalhamento}`);
      if (it.observacao && it.observacao !== it.detalhamento) linhas.push(`   💬 ${it.observacao}`);
      if (it.local) linhas.push(`   📍 ${it.local}`);
      if (it.imagens.length) {
        linhas.push("   🖼️ Imagens:");
        for (const imagem of it.imagens) linhas.push(`   ${imagem.url}`);
      }
    });
  }
  if (!grupos.length) linhas.push("", "Nenhum serviço programado.");
  return linhas.join("\n");
}
