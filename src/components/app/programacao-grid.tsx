import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Copy,
  Loader2,
  Plus,
  Save,
  Trash2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ConfirmacaoConflitos,
  ImagensButton,
  ImagensLinks,
  TOM,
} from "@/components/app/operacao-ui";
import { useDataAction } from "@/hooks/use-data";
import {
  abreviarNome,
  alocacaoDaLinha,
  alocacaoDoAgendamento,
  cadastroRepository,
  CADASTRO_FILTROS_VAZIOS,
  detectarConflitos,
  duplicarLinha,
  idsComAlertaPendente,
  linhaDoServico,
  linhaVazia,
  operacaoRepository,
  quantidadeServicosNoDia,
  SETORES_PROGRAMACAO,
  STATUS_PROGRAMACAO,
  validarLinha,
  type Alocacao,
  type Conflito,
  type LinhaProgramacao,
  type ProgramacaoDia,
  type SetorProgramacao,
  type StatusProgramacao,
} from "@/lib/data";
import { cn } from "@/lib/utils";

const campo = "h-8 text-xs";
const sel =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60";
const CAMPOS_DE_RECURSO: (keyof LinhaProgramacao)[] = [
  "data",
  "equipeId",
  "liderId",
  "ajudantes",
  "veiculoId",
  "horaInicio",
  "horaFim",
];

type Confirmacao = { mensagens: string[]; ids: string[] };

function ClienteCell({
  linha,
  disabled,
  onChange,
}: {
  linha: LinhaProgramacao;
  disabled: boolean;
  onChange: (p: Partial<LinhaProgramacao>) => void;
}) {
  const [opcoes, setOpcoes] = useState<{ id: string; nome: string }[]>([]);
  const [termo, setTermo] = useState("");
  useEffect(() => {
    const t = termo.trim();
    if (t.length < 2) return;
    const h = setTimeout(() => {
      cadastroRepository
        .list({ ...CADASTRO_FILTROS_VAZIOS, busca: t }, 1)
        .then((r) => setOpcoes(r.linhas.slice(0, 15).map((c) => ({ id: c.id, nome: c.nome }))))
        .catch(() => setOpcoes([]));
    }, 250);
    return () => clearTimeout(h);
  }, [termo]);
  const lista = `cli-${linha.chave}`;
  return (
    <>
      <Input
        aria-label="Cliente"
        className={campo}
        list={lista}
        value={linha.cliente}
        disabled={disabled}
        placeholder="Buscar ou digitar"
        onChange={(e) => {
          const v = e.target.value;
          setTermo(v);
          const achado = opcoes.find((o) => o.nome === v);
          onChange({ cliente: v, cadastroId: achado?.id ?? "" });
        }}
      />
      <datalist id={lista}>
        {opcoes.map((o) => (
          <option key={o.id} value={o.nome} />
        ))}
      </datalist>
    </>
  );
}

function AjudantesCell({
  linha,
  dados,
  disabled,
  onChange,
}: {
  linha: LinhaProgramacao;
  dados: ProgramacaoDia;
  disabled: boolean;
  onChange: (p: Partial<LinhaProgramacao>) => void;
}) {
  const [busca, setBusca] = useState("");
  const selecionados = dados.recursos.colaboradores.filter((c) => linha.ajudantes.includes(c.id));
  const lista = dados.recursos.colaboradores.filter(
    (c) =>
      (c.ativo || linha.ajudantes.includes(c.id)) &&
      c.id !== linha.liderId &&
      c.nome.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")),
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          title={selecionados.map((c) => c.nome).join(", ") || "Selecionar ajudantes"}
          className="h-8 w-40 justify-start overflow-hidden px-2 text-xs font-normal"
        >
          <UsersRound className="size-3.5" />
          <span className="truncate">
            {selecionados.length
              ? selecionados.map((c) => abreviarNome(c.nome)).join(", ")
              : "Selecionar"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          className="mb-2 h-8 text-xs"
          placeholder="Buscar colaborador…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {lista.map((c) => (
            <label
              key={c.id}
              title={c.nome}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted"
            >
              <Checkbox
                checked={linha.ajudantes.includes(c.id)}
                onCheckedChange={(v) =>
                  onChange({
                    ajudantes: v
                      ? [...linha.ajudantes, c.id]
                      : linha.ajudantes.filter((x) => x !== c.id),
                  })
                }
              />
              {abreviarNome(c.nome)}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Quick entry grid of the day's services (Gestão and PCP edit; others read). */
export function ProgramacaoGrid({
  dados,
  data,
  podeEditar,
}: {
  dados: ProgramacaoDia;
  data: string;
  podeEditar: boolean;
}) {
  const run = useDataAction();
  const [linhas, setLinhas] = useState<LinhaProgramacao[]>(() => dados.itens.map(linhaDoServico));
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const [setorFiltro, setSetorFiltro] = useState<"" | SetorProgramacao>("");
  const [sujo, setSujo] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [editorData, setEditorData] = useState<{ chave: string; data: string } | null>(null);

  // Reload from the database only when nothing is pending, so typing is never lost.
  useEffect(() => {
    if (!sujo) {
      setLinhas(dados.itens.map(linhaDoServico));
      setExcluidos([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.itens]);

  const { colaboradores, veiculos, equipes } = dados.recursos;
  const nomeColab = useMemo(
    () => new Map(colaboradores.map((c) => [c.id, c.nome])),
    [colaboradores],
  );
  const nomeVeic = useMemo(() => new Map(veiculos.map((v) => [v.id, v.rotulo])), [veiculos]);
  const imagensPorId = useMemo(
    () => new Map(dados.itens.map((s) => [s.id, s.imagens])),
    [dados.itens],
  );

  const alocacoesLocais = useMemo(
    () => [...linhas.map(alocacaoDaLinha), ...dados.agendamentos.map(alocacaoDoAgendamento)],
    [linhas, dados.agendamentos],
  );
  const conflitosLocais = useMemo(() => detectarConflitos(alocacoesLocais), [alocacoesLocais]);
  const alertasPendentes = useMemo(
    () => idsComAlertaPendente(conflitosLocais, alocacoesLocais),
    [conflitosLocais, alocacoesLocais],
  );
  const conflitosPorLinha = useMemo(() => {
    const descr = new Map(alocacoesLocais.map((a) => [a.id, a.descricao]));
    const mapa = new Map<string, string[]>();
    for (const c of conflitosLocais) {
      const recurso =
        c.recurso === "veiculo"
          ? `Veículo ${nomeVeic.get(c.recursoId) ?? ""}`
          : abreviarNome(nomeColab.get(c.recursoId) ?? "Colaborador");
      const [a, b] = c.alocacoes;
      for (const [x, y] of [
        [a, b],
        [b, a],
      ] as const) {
        if (!alertasPendentes.has(x)) continue;
        mapa.set(x, [...(mapa.get(x) ?? []), `${recurso} também em ${descr.get(y)}`]);
      }
    }
    return mapa;
  }, [conflitosLocais, alocacoesLocais, alertasPendentes, nomeColab, nomeVeic]);

  function atualizar(chave: string, p: Partial<LinhaProgramacao>) {
    setSujo(true);
    const mudouRecurso = CAMPOS_DE_RECURSO.some((k) => k in p);
    setLinhas((ls) =>
      ls.map((l) =>
        l.chave === chave
          ? { ...l, ...p, ...(mudouRecurso ? { conflitoConfirmado: false } : {}) }
          : l,
      ),
    );
  }
  function escolherEquipe(l: LinhaProgramacao, equipeId: string) {
    const eq = equipes.find((e) => e.id === equipeId);
    if (!eq) return atualizar(l.chave, { equipeId: "" });
    const membros = eq.colaboradores.map((m) => m.id);
    atualizar(l.chave, {
      equipeId,
      liderId: membros[0] ?? "",
      ajudantes: membros.slice(1),
      veiculoId: eq.veiculos[0]?.id ?? l.veiculoId,
      setor: (SETORES_PROGRAMACAO as readonly string[]).includes(eq.setor)
        ? (eq.setor as SetorProgramacao)
        : l.setor,
    });
  }
  function escolherVeiculo(l: LinhaProgramacao, veiculoId: string) {
    const v = veiculos.find((x) => x.id === veiculoId);
    if (v?.equipeId) escolherEquipe(l, v.equipeId);
    atualizar(l.chave, { veiculoId });
  }
  function adicionar() {
    setSujo(true);
    setLinhas((ls) => [...ls, linhaVazia(data)]);
  }
  function duplicar(l: LinhaProgramacao) {
    setSujo(true);
    setLinhas((ls) => {
      const i = ls.findIndex((x) => x.chave === l.chave);
      return [...ls.slice(0, i + 1), duplicarLinha(l), ...ls.slice(i + 1)];
    });
  }
  function remover(l: LinhaProgramacao) {
    setSujo(true);
    if (l.id) setExcluidos((e) => [...e, l.id!]);
    setLinhas((ls) => ls.filter((x) => x.chave !== l.chave));
  }

  async function salvar(paraSalvar: LinhaProgramacao[]) {
    setSalvando(true);
    const n = await run(() => operacaoRepository.salvarProgramacao(paraSalvar, excluidos));
    setSalvando(false);
    if (n !== undefined) {
      toast.success(`Programação salva (${n} serviço${n === 1 ? "" : "s"}).`);
      setSujo(false);
      setExcluidos([]);
      setConfirmacao(null);
    }
  }

  function mensagensParaConfirmacao(
    conflitos: Conflito[],
    alocacoes: Alocacao[],
    idsLocais: Set<string>,
  ): Confirmacao {
    const porId = new Map(alocacoes.map((a) => [a.id, a]));
    const mensagens = new Set<string>();
    const ids = new Set<string>();
    for (const c of conflitos) {
      const destinos = c.alocacoes.filter((id) => idsLocais.has(id) && !porId.get(id)?.confirmado);
      if (!destinos.length) continue;
      destinos.forEach((id) => ids.add(id));
      const destino = destinos[0]!;
      const outro = porId.get(c.alocacoes.find((id) => id !== destino)!);
      if (c.recurso === "colaborador") {
        const nome = abreviarNome(nomeColab.get(c.recursoId) ?? "Colaborador");
        mensagens.add(
          `${nome} já está programado em outro serviço neste dia (${outro?.descricao ?? "serviço não identificado"}). Confirmar que estará nos dois serviços?`,
        );
      } else {
        mensagens.add(
          `O veículo ${nomeVeic.get(c.recursoId) ?? "selecionado"} também está em ${outro?.descricao ?? "outro serviço"} neste dia. Confirmar o compartilhamento?`,
        );
      }
    }
    return { mensagens: [...mensagens], ids: [...ids] };
  }

  async function prepararSalvamento() {
    for (const [i, l] of linhas.entries()) {
      const erro = validarLinha(l);
      if (erro) {
        toast.error(`Linha ${i + 1}: ${erro}`);
        return;
      }
    }
    setVerificando(true);
    try {
      const idsLocais = new Set(linhas.map((l) => l.chave));
      const externas = await operacaoRepository.alocacoesExistentes(
        linhas.map((l) => l.data),
        [...linhas.flatMap((l) => (l.id ? [l.id] : [])), ...excluidos],
      );
      const alocacoes = [...linhas.map(alocacaoDaLinha), ...externas];
      const pendente = mensagensParaConfirmacao(detectarConflitos(alocacoes), alocacoes, idsLocais);
      if (pendente.mensagens.length) setConfirmacao(pendente);
      else await salvar(linhas);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível verificar os recursos.");
    } finally {
      setVerificando(false);
    }
  }

  function confirmarESalvar() {
    if (!confirmacao) return;
    const ids = new Set(confirmacao.ids);
    const confirmadas = linhas.map((l) =>
      ids.has(l.chave) ? { ...l, conflitoConfirmado: true } : l,
    );
    setLinhas(confirmadas);
    setSujo(true);
    void salvar(confirmadas);
  }

  const visiveis = linhas.filter((l) => !setorFiltro || l.setor === setorFiltro);
  const totalAvisos = [...alertasPendentes].filter((k) => linhas.some((l) => l.chave === k)).length;
  const ocupado = salvando || verificando;
  const bloqueado = !podeEditar;
  const colabsAtivos = colaboradores.filter((c) => c.ativo);
  const veicsAtivos = veiculos.filter((v) => v.ativo);
  const equipesAtivas = equipes.filter((e) => e.ativo);

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSetorFiltro("")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              !setorFiltro
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:border-primary/50",
            )}
          >
            Todos ({linhas.length})
          </button>
          {SETORES_PROGRAMACAO.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setSetorFiltro(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                setorFiltro === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:border-primary/50",
              )}
            >
              {s} ({linhas.filter((l) => l.setor === s).length})
            </button>
          ))}
        </div>
        {podeEditar && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={adicionar} disabled={ocupado}>
              <Plus />
              Nova linha
            </Button>
            <Button onClick={() => void prepararSalvamento()} disabled={ocupado || !sujo}>
              {ocupado ? <Loader2 className="animate-spin" /> : <Save />}
              {verificando ? "Verificando…" : "Salvar programação"}
            </Button>
          </div>
        )}
      </div>
      {totalAvisos > 0 && (
        <p className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", TOM.aviso)}>
          <AlertTriangle className="size-4" />
          {totalAvisos} linha(s) com funcionário ou veículo em mais de um serviço neste dia. É só um
          aviso: confirme ao salvar.
        </p>
      )}
      <datalist id="prog-produtos">
        {dados.recursos.produtos
          .filter((p) => p.ativo)
          .map((p) => (
            <option key={p.id} value={p.nome} />
          ))}
      </datalist>
      <datalist id="prog-servicos">
        {dados.recursos.servicos
          .filter((s) => s.ativo)
          .map((s) => (
            <option key={s.id} value={s.nome} />
          ))}
      </datalist>
      <TooltipProvider>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[2050px] text-xs">
            <thead className="bg-muted text-left text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                {[
                  "#",
                  "Data",
                  "Setor",
                  "Cliente",
                  "Produto",
                  "Serviço",
                  "Detalhamento",
                  "Endereço / local",
                  "Qtd",
                  "Equipe",
                  "Líder",
                  "Ajudantes",
                  "Veículo",
                  "Horário",
                  "Status",
                  "Observação / motivo",
                  "Ordem de produção (opcional)",
                  "Imagens",
                  "",
                ].map((h) => (
                  <th key={h} className="px-2 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visiveis.map((l, i) => {
                const avisos = conflitosPorLinha.get(l.chave);
                const noDia = quantidadeServicosNoDia(l.chave, conflitosLocais);
                const imagens = (l.id && imagensPorId.get(l.id)) || [];
                return (
                  <tr key={l.chave} className={avisos ? "bg-amber-400/5" : ""}>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>{i + 1}</span>
                        {avisos && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                aria-label="Recurso compartilhado"
                                className="inline-flex text-amber-600"
                              >
                                <AlertTriangle className="size-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {avisos.map((c, k) => (
                                <p key={k}>{c}</p>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {l.conflitoConfirmado && noDia > 1 && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] whitespace-nowrap text-secondary-foreground">
                            {noDia} serviços no dia
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="min-w-32 px-1 py-1.5">
                      <Input
                        aria-label="Data do serviço"
                        type="date"
                        className={cn(campo, "px-1")}
                        value={l.data}
                        disabled={bloqueado}
                        onChange={(e) => atualizar(l.chave, { data: e.target.value })}
                      />
                    </td>
                    <td className="min-w-36 px-1 py-1.5">
                      <select
                        aria-label="Setor"
                        className={sel}
                        value={l.setor}
                        disabled={bloqueado}
                        onChange={(e) =>
                          atualizar(l.chave, { setor: e.target.value as SetorProgramacao })
                        }
                      >
                        <option value="">Selecione</option>
                        {SETORES_PROGRAMACAO.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-44 px-1 py-1.5">
                      <ClienteCell
                        linha={l}
                        disabled={bloqueado}
                        onChange={(p) => atualizar(l.chave, p)}
                      />
                    </td>
                    <td className="min-w-28 px-1 py-1.5">
                      <Input
                        aria-label="Produto"
                        className={campo}
                        list="prog-produtos"
                        value={l.produto}
                        disabled={bloqueado}
                        onChange={(e) => atualizar(l.chave, { produto: e.target.value })}
                      />
                    </td>
                    <td className="min-w-32 px-1 py-1.5">
                      <Input
                        aria-label="Serviço"
                        className={campo}
                        list="prog-servicos"
                        value={l.servico}
                        disabled={bloqueado}
                        onChange={(e) => atualizar(l.chave, { servico: e.target.value })}
                      />
                    </td>
                    <td className="min-w-52 px-1 py-1.5">
                      <Input
                        aria-label="Detalhamento"
                        className={campo}
                        value={l.detalhamento}
                        disabled={bloqueado}
                        onChange={(e) => atualizar(l.chave, { detalhamento: e.target.value })}
                      />
                    </td>
                    <td className="min-w-52 px-1 py-1.5">
                      <Input
                        aria-label="Endereço ou local"
                        className={campo}
                        placeholder="Ponto ou endereço"
                        value={l.local}
                        disabled={bloqueado}
                        onChange={(e) => atualizar(l.chave, { local: e.target.value })}
                      />
                    </td>
                    <td className="min-w-16 px-1 py-1.5">
                      <Input
                        aria-label="Quantidade"
                        className={campo}
                        inputMode="decimal"
                        placeholder="1"
                        value={l.quantidade}
                        disabled={bloqueado}
                        onChange={(e) => atualizar(l.chave, { quantidade: e.target.value })}
                      />
                    </td>
                    <td className="min-w-36 px-1 py-1.5">
                      <select
                        aria-label="Equipe"
                        className={sel}
                        value={l.equipeId}
                        disabled={bloqueado}
                        onChange={(e) => escolherEquipe(l, e.target.value)}
                      >
                        <option value="">—</option>
                        {equipesAtivas.map((eq) => (
                          <option key={eq.id} value={eq.id}>
                            {eq.nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-36 px-1 py-1.5">
                      <select
                        aria-label="Líder"
                        title={nomeColab.get(l.liderId) ?? "Selecione o líder"}
                        className={sel}
                        value={l.liderId}
                        disabled={bloqueado}
                        onChange={(e) =>
                          atualizar(l.chave, {
                            liderId: e.target.value,
                            ajudantes: l.ajudantes.filter((a) => a !== e.target.value),
                          })
                        }
                      >
                        <option value="">—</option>
                        {colaboradores
                          .filter((c) => c.ativo || c.id === l.liderId)
                          .map((c) => (
                            <option key={c.id} value={c.id} title={c.nome}>
                              {abreviarNome(c.nome)}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="min-w-40 px-1 py-1.5">
                      <AjudantesCell
                        linha={l}
                        dados={dados}
                        disabled={bloqueado}
                        onChange={(p) => atualizar(l.chave, p)}
                      />
                    </td>
                    <td className="min-w-28 px-1 py-1.5">
                      <select
                        aria-label="Veículo"
                        className={sel}
                        value={l.veiculoId}
                        disabled={bloqueado}
                        onChange={(e) => escolherVeiculo(l, e.target.value)}
                      >
                        <option value="">—</option>
                        {veiculos
                          .filter((v) => v.ativo || v.id === l.veiculoId)
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.rotulo}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="min-w-40 px-1 py-1.5">
                      <div className="flex gap-1">
                        <Input
                          aria-label="Início"
                          type="time"
                          className={cn(campo, "px-1")}
                          value={l.horaInicio}
                          disabled={bloqueado}
                          onChange={(e) => atualizar(l.chave, { horaInicio: e.target.value })}
                        />
                        <Input
                          aria-label="Fim"
                          type="time"
                          className={cn(campo, "px-1")}
                          value={l.horaFim}
                          disabled={bloqueado}
                          onChange={(e) => atualizar(l.chave, { horaFim: e.target.value })}
                        />
                      </div>
                    </td>
                    <td className="min-w-36 px-1 py-1.5">
                      <select
                        aria-label="Status"
                        className={sel}
                        value={l.status}
                        disabled={bloqueado}
                        onChange={(e) =>
                          atualizar(l.chave, { status: e.target.value as StatusProgramacao })
                        }
                      >
                        {STATUS_PROGRAMACAO.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-48 px-1 py-1.5">
                      <Input
                        aria-label="Observação"
                        className={campo}
                        value={l.observacao}
                        disabled={bloqueado}
                        onChange={(e) => atualizar(l.chave, { observacao: e.target.value })}
                      />
                    </td>
                    <td className="min-w-40 px-1 py-1.5">
                      <select
                        aria-label="Ordem de produção"
                        className={sel}
                        value={l.ordemId}
                        disabled={bloqueado}
                        onChange={(e) => atualizar(l.chave, { ordemId: e.target.value })}
                      >
                        <option value="">Sem vínculo</option>
                        {dados.ordensAbertas.map((o) => (
                          <option key={o.id} value={o.id}>
                            nº {o.numero}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-40 px-1 py-1.5">
                      <div className="flex items-center gap-2">
                        <ImagensButton
                          entidade="programacao"
                          entidadeId={l.id ?? ""}
                          quantidade={imagens.length}
                          disabled={!l.id}
                        />
                        <ImagensLinks imagens={imagens} />
                      </div>
                    </td>
                    <td className="px-1 py-1.5">
                      {podeEditar && (
                        <div className="flex">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Alterar data"
                            title="Alterar data"
                            onClick={() => setEditorData({ chave: l.chave, data: l.data })}
                          >
                            <CalendarDays />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Duplicar linha"
                            onClick={() => duplicar(l)}
                          >
                            <Copy />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            aria-label="Remover linha"
                            onClick={() => remover(l)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!visiveis.length && (
                <tr>
                  <td colSpan={19} className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum serviço programado{setorFiltro ? ` em ${setorFiltro}` : ""} neste dia.
                    {podeEditar ? " Clique em “Nova linha” para começar." : ""}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </TooltipProvider>
      <p className="text-xs text-muted-foreground">
        “Nova linha” começa vazia e preenche só a data selecionada. Funcionários e veículos podem
        estar em vários serviços no mesmo dia; o sistema só pede confirmação. “Ordem de produção” é
        um vínculo opcional. Salve a linha antes de anexar imagens.
        {!podeEditar && " Só Gestão e PCP lançam a programação."}
        {colabsAtivos.length === 0 || veicsAtivos.length === 0
          ? " Cadastre colaboradores e veículos em Produção › Produtos, serviços e colaboradores e em Veículos."
          : ""}
      </p>

      {confirmacao && (
        <ConfirmacaoConflitos
          mensagens={confirmacao.mensagens}
          salvando={salvando}
          onConfirmar={confirmarESalvar}
          onCancelar={() => setConfirmacao(null)}
        />
      )}
      {editorData && (
        <Dialog open onOpenChange={(aberto) => !aberto && setEditorData(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Alterar data do serviço</DialogTitle>
              <DialogDescription>
                O mesmo serviço muda de dia com funcionários, veículo, produto e demais vínculos. Os
                recursos são verificados de novo ao salvar.
              </DialogDescription>
            </DialogHeader>
            <label className="text-sm font-medium">
              Nova data
              <Input
                aria-label="Nova data do serviço"
                type="date"
                className="mt-2"
                value={editorData.data}
                onChange={(e) => setEditorData((a) => (a ? { ...a, data: e.target.value } : null))}
              />
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditorData(null)}>
                Cancelar
              </Button>
              <Button
                disabled={!editorData.data}
                onClick={() => {
                  atualizar(editorData.chave, { data: editorData.data });
                  setEditorData(null);
                }}
              >
                Alterar data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
