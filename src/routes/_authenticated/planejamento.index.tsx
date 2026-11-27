import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlarmClock,
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ListChecks,
  Plus,
  ShieldAlert,
  Truck,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { AgendamentoDialog } from "@/components/app/agendamento-dialog";
import { Kpi, selectClass } from "@/components/app/operacao-ui";
import { useCurrentUser, usePlanejamento } from "@/hooks/use-data";
import {
  abreviarNome,
  adicionarDias,
  adicionarMeses,
  canGerirOperacao,
  dataBR,
  detectarConflitos,
  DIAS_SEMANA_CURTOS,
  diasDoPeriodo,
  eventoNoDia,
  hojeISO,
  horarioCurto,
  idsComAlertaPendente,
  periodoDaVisao,
  tituloDoPeriodo,
  type Agendamento,
  type Alocacao,
  type PlanejamentoPeriodo,
  type TipoAgendamento,
  type VisaoPlanejamento,
} from "@/lib/data";
import { cn } from "@/lib/utils";

type Busca = { visao: VisaoPlanejamento; data: string };

export const Route = createFileRoute("/_authenticated/planejamento/")({
  validateSearch: (s: Record<string, unknown>): Busca => ({
    visao: s["visao"] === "diario" || s["visao"] === "mensal" ? s["visao"] : "semanal",
    data:
      typeof s["data"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["data"])
        ? s["data"]
        : hojeISO(),
  }),
  head: () => ({
    meta: [{ title: "Cronograma — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: PlanejamentoPage,
});

type Pessoa = { id: string; nome: string };
type Evento = {
  chave: string;
  origem: "planejamento" | "ordem" | "programacao";
  titulo: string;
  tipo: TipoAgendamento | "Ordem de produção" | "Programação";
  dataInicio: string;
  dataFim: string;
  horaInicio: string | null;
  horaFim: string | null;
  pessoas: Pessoa[];
  equipeId: string | null;
  equipeNome: string | null;
  setor: string | null;
  capacidade: number | null;
  veiculoId: string | null;
  veiculoRotulo: string | null;
  cliente: string | null;
  ordemId: string | null;
  ordemNumero: number | null;
  agendamento?: Agendamento;
  grupo: string;
  servicos?: number;
  conflito?: boolean;
  confirmado?: boolean;
};

function converterEventos(d: PlanejamentoPeriodo): Evento[] {
  const agendamentos: Evento[] = d.agendamentos.map((a) => ({
    chave: `ag-${a.id}`,
    origem: "planejamento",
    titulo: a.titulo,
    tipo: a.tipo,
    dataInicio: a.dataInicio,
    dataFim: a.dataFim,
    horaInicio: a.horaInicio,
    horaFim: a.horaFim,
    pessoas: a.colaboradores,
    equipeId: a.equipeId,
    equipeNome: a.equipe?.nome ?? null,
    setor: a.equipe?.setor ?? null,
    capacidade: a.equipe?.capacidade ?? null,
    veiculoId: a.veiculoId,
    veiculoRotulo: a.veiculo?.rotulo ?? null,
    cliente: a.ordem?.clienteNome || null,
    ordemId: a.ordemId,
    ordemNumero: a.ordem?.numero ?? null,
    agendamento: a,
    grupo: a.equipeId ? `equipe:${a.equipeId}` : `ag:${a.id}`,
  }));
  const ordens: Evento[] = d.ordensSemAgendamento.map((o) => ({
    chave: `ordem-${o.id}`,
    origem: "ordem",
    titulo: o.descricao,
    tipo: "Ordem de produção",
    dataInicio: o.dataPrevista ?? "",
    dataFim: o.dataPrevista ?? "",
    horaInicio: null,
    horaFim: null,
    pessoas: o.equipe,
    equipeId: null,
    equipeNome: null,
    setor: null,
    capacidade: null,
    veiculoId: o.veiculoId,
    veiculoRotulo: o.veiculoRotulo || null,
    cliente: o.clienteNome || null,
    ordemId: o.id,
    ordemNumero: o.numero,
    grupo: `ordem:${o.id}`,
  }));
  // Programação: one block per day + team/leader + vehicle.
  const blocos = new Map<string, Evento>();
  for (const s of d.programacao) {
    const grupo = s.equipeId
      ? `equipe:${s.equipeId}`
      : s.liderId
        ? `lider:${s.liderId}`
        : `linha:${s.id}`;
    const chave = `prog-${s.data}-${grupo}-${s.veiculoId ?? ""}`;
    let b = blocos.get(chave);
    if (!b) {
      b = {
        chave,
        origem: "programacao",
        titulo: "",
        tipo: "Programação",
        dataInicio: s.data,
        dataFim: s.data,
        horaInicio: null,
        horaFim: null,
        pessoas: [],
        equipeId: s.equipeId,
        equipeNome: s.equipeNome || s.liderNome || null,
        setor: null,
        capacidade: null,
        veiculoId: s.veiculoId,
        veiculoRotulo: s.veiculoNome || null,
        cliente: null,
        ordemId: null,
        ordemNumero: null,
        grupo,
        servicos: 0,
        confirmado: true,
      };
      blocos.set(chave, b);
    }
    b.servicos = (b.servicos ?? 0) + 1;
    b.confirmado = Boolean(b.confirmado && s.conflitoConfirmado);
    const setores = new Set((b.setor ?? "").split(", ").filter(Boolean));
    setores.add(s.setor);
    b.setor = [...setores].join(", ");
    const lider = s.liderId ? { id: s.liderId, nome: s.liderNome } : null;
    for (const p of [lider, ...s.ajudantes]) {
      if (p && !b.pessoas.some((x) => x.id === p.id)) b.pessoas.push({ id: p.id, nome: p.nome });
    }
    b.titulo = `${b.servicos} serviço(s) programado(s)${b.equipeNome ? ` — ${b.equipeNome}` : ""}`;
    b.cliente = [b.cliente, s.cliente].filter(Boolean).slice(0, 3).join(", ") || null;
  }
  const todos = [...agendamentos, ...ordens, ...blocos.values()];
  const alocs: Alocacao[] = todos
    .filter((e) => e.origem !== "ordem")
    .map((e) => ({
      id: e.chave,
      grupo: e.grupo,
      descricao: e.titulo,
      dataInicio: e.dataInicio,
      dataFim: e.dataFim,
      horaInicio: e.horaInicio,
      horaFim: e.horaFim,
      colaboradores: e.pessoas.map((p) => p.id),
      veiculoId: e.veiculoId,
      confirmado: e.origem === "programacao" && Boolean(e.confirmado),
    }));
  const emConflito = idsComAlertaPendente(detectarConflitos(alocs), alocs);
  return todos.map((e) => ({ ...e, conflito: emConflito.has(e.chave) }));
}

const TOM_EVENTO: Record<Evento["tipo"], string> = {
  Agendamento: "border-primary/30 bg-primary/5 hover:border-primary/60",
  "Reserva de urgência": "border-amber-400/50 bg-amber-400/10 hover:border-amber-500",
  Urgência: "border-destructive/50 bg-destructive/10 hover:border-destructive",
  "Ordem de produção": "border-border bg-muted hover:border-primary/40",
  Programação: "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500",
};

function IconeEvento({ tipo }: { tipo: Evento["tipo"] }) {
  if (tipo === "Reserva de urgência")
    return <ShieldAlert className="size-4 shrink-0 text-amber-600" />;
  if (tipo === "Urgência") return <AlarmClock className="size-4 shrink-0 text-destructive" />;
  if (tipo === "Programação") return <ListChecks className="size-4 shrink-0 text-emerald-600" />;
  if (tipo === "Ordem de produção")
    return <ClipboardList className="size-4 shrink-0 text-muted-foreground" />;
  return <CalendarDays className="size-4 shrink-0 text-primary" />;
}

function PlanejamentoPage() {
  const search = Route.useSearch();
  const navegar = Route.useNavigate();
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const podeGerir = canGerirOperacao(me);
  const periodo = useMemo(
    () => periodoDaVisao(search.data, search.visao),
    [search.data, search.visao],
  );
  const { data, isPending, error } = usePlanejamento(periodo.inicio, periodo.fim);
  const [recurso, setRecurso] = useState("");
  const [equipeFiltro, setEquipeFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [editor, setEditor] = useState<{
    agendamento?: Agendamento;
    tipo?: TipoAgendamento;
    data?: string;
  } | null>(null);
  const eventos = useMemo(() => (data ? converterEventos(data) : []), [data]);
  const dias = useMemo(() => diasDoPeriodo(periodo), [periodo]);
  const hoje = hojeISO();

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return eventos.filter((e) => {
      if (recurso === "equipes" && !e.pessoas.length) return false;
      if (recurso === "veiculos" && !e.veiculoId) return false;
      if (equipeFiltro && e.equipeId !== equipeFiltro) return false;
      if (!termo) return true;
      return [
        e.titulo,
        e.cliente,
        e.equipeNome,
        e.setor,
        e.veiculoRotulo,
        e.ordemNumero ? `ordem ${e.ordemNumero}` : "",
        ...e.pessoas.map((p) => p.nome),
      ].some((v) => v?.toLocaleLowerCase("pt-BR").includes(termo));
    });
  }, [eventos, recurso, equipeFiltro, busca]);

  const resumo = useMemo(
    () => ({
      compromissos: data?.agendamentos.length ?? 0,
      pessoas: new Set(eventos.flatMap((e) => e.pessoas.map((p) => p.id))).size,
      veiculos: new Set(eventos.flatMap((e) => (e.veiculoId ? [e.veiculoId] : []))).size,
      reservas: data?.agendamentos.filter((a) => a.tipo === "Reserva de urgência").length ?? 0,
    }),
    [data, eventos],
  );

  function mudarPeriodo(direcao: number) {
    const nova =
      search.visao === "diario"
        ? adicionarDias(search.data, direcao)
        : search.visao === "semanal"
          ? adicionarDias(search.data, direcao * 7)
          : adicionarMeses(search.data, direcao);
    void navegar({ search: (a) => ({ ...a, data: nova }) });
  }
  const abrirDia = (dia: string) => void navegar({ search: { visao: "diario", data: dia } });
  function abrirEvento(e: Evento) {
    if (e.origem === "programacao") {
      void navigate({
        to: "/planejamento/programacao",
        search: { data: e.dataInicio, aba: "resumo" },
      });
    } else if (e.origem === "planejamento" && e.agendamento) {
      setEditor({ agendamento: e.agendamento });
    } else if (e.ordemId) {
      void navigate({ to: "/producao/$ordemId", params: { ordemId: e.ordemId } });
    }
  }

  return (
    <>
      <PageHeader
        title="Cronograma"
        description="Equipes, veículos e capacidade para urgências, por dia, semana ou mês."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link
                to="/planejamento/programacao"
                search={{ data: search.data, aba: "lancamento" }}
              >
                <ListChecks />
                Programação
              </Link>
            </Button>
            {podeGerir && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setEditor({ tipo: "Reserva de urgência", data: search.data })}
                >
                  <ShieldAlert />
                  Reserva para urgências
                </Button>
                <Button onClick={() => setEditor({ data: search.data })}>
                  <Plus />
                  Novo agendamento
                </Button>
              </>
            )}
          </div>
        }
      />

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState
          icon={CalendarDays}
          title="Não foi possível abrir o cronograma"
          description={error.message}
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={CalendarDays} label="Compromissos no período" value={resumo.compromissos} />
            <Kpi
              icon={UsersRound}
              label="Colaboradores mobilizados"
              value={resumo.pessoas}
              tom="sucesso"
            />
            <Kpi icon={Truck} label="Veículos em uso" value={resumo.veiculos} />
            <Kpi
              icon={ShieldAlert}
              label="Reservas para urgências"
              value={resumo.reservas}
              tom="aviso"
            />
          </div>

          <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Período anterior"
                  onClick={() => mudarPeriodo(-1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void navegar({ search: (a) => ({ ...a, data: hoje }) })}
                >
                  Hoje
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Próximo período"
                  onClick={() => mudarPeriodo(1)}
                >
                  <ChevronRight />
                </Button>
                <h2 className="ml-1 text-lg font-semibold">
                  {tituloDoPeriodo(search.data, search.visao)}
                </h2>
              </div>
              <div className="inline-flex rounded-lg border bg-muted p-1">
                {(
                  [
                    ["diario", "Dia"],
                    ["semanal", "Semana"],
                    ["mensal", "Mês"],
                  ] as const
                ).map(([visao, label]) => (
                  <button
                    type="button"
                    key={visao}
                    aria-pressed={search.visao === visao}
                    onClick={() => void navegar({ search: (a) => ({ ...a, visao }) })}
                    className={cn(
                      "rounded-md px-4 py-1.5 text-sm font-medium transition",
                      search.visao === visao
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_220px_240px]">
              <Input
                aria-label="Buscar no cronograma"
                placeholder="Buscar compromisso, ordem, pessoa ou veículo…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <select
                aria-label="Filtrar recursos"
                className={selectClass}
                value={recurso}
                onChange={(e) => setRecurso(e.target.value)}
              >
                <option value="">Equipes e veículos</option>
                <option value="equipes">Somente com equipe</option>
                <option value="veiculos">Somente com veículo</option>
              </select>
              <select
                aria-label="Filtrar equipe"
                className={selectClass}
                value={equipeFiltro}
                onChange={(e) => setEquipeFiltro(e.target.value)}
              >
                <option value="">Todas as equipes de planejamento</option>
                {data.recursos.equipes
                  .filter((e) => e.ativo)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome} — {e.setor}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-primary" />
                Agendamento
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-amber-500" />
                Reserva de urgência
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-destructive" />
                Urgência
              </span>
              <span className="flex items-center gap-1.5">
                <ClipboardList className="size-3.5" />
                Ordem ainda não agendada
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-emerald-500" />
                Programação de serviços
              </span>
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-amber-600" />
                Recurso compartilhado
              </span>
            </div>

            {search.visao === "diario" && (
              <VisaoDiaria dia={search.data} eventos={filtrados} onOpen={abrirEvento} />
            )}
            {search.visao === "semanal" && (
              <VisaoSemanal
                dias={dias}
                hoje={hoje}
                eventos={filtrados}
                onOpen={abrirEvento}
                onDia={abrirDia}
              />
            )}
            {search.visao === "mensal" && (
              <VisaoMensal
                dias={dias}
                anchor={search.data}
                hoje={hoje}
                eventos={filtrados}
                onOpen={abrirEvento}
                onDia={abrirDia}
              />
            )}
          </section>
        </div>
      )}

      {editor && data && (
        <AgendamentoDialog
          key={
            editor.agendamento?.id ??
            `${editor.tipo ?? "Agendamento"}-${editor.data ?? search.data}`
          }
          recursos={data.recursos}
          ordensLivres={data.ordensAbertas}
          agendamento={editor.agendamento}
          tipoInicial={editor.tipo ?? "Agendamento"}
          dataInicial={editor.data ?? search.data}
          podeEditar={podeGerir}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

function EventoCard({
  evento: e,
  onOpen,
  compacto = false,
}: {
  evento: Evento;
  onOpen: (e: Evento) => void;
  compacto?: boolean;
}) {
  const equipeNome =
    e.origem === "programacao" && !e.equipeId && e.equipeNome
      ? abreviarNome(e.equipeNome)
      : e.equipeNome;
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      className={cn(
        "w-full rounded-xl border p-3 text-left shadow-sm transition",
        TOM_EVENTO[e.tipo],
        e.conflito && "ring-2 ring-amber-400/70",
      )}
    >
      <div className="flex items-start gap-2">
        <IconeEvento tipo={e.tipo} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold">{e.titulo}</p>
          {e.ordemNumero && (
            <p className="mt-0.5 text-xs text-muted-foreground">Ordem nº {e.ordemNumero}</p>
          )}
          {e.conflito && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3" />
              Recurso compartilhado
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {e.horaInicio
            ? `${horarioCurto(e.horaInicio)}–${horarioCurto(e.horaFim)}`
            : "Dia inteiro"}
        </span>
        {e.dataInicio !== e.dataFim && (
          <Badge variant="outline" className="bg-card px-1.5 py-0 text-2xs">
            até {dataBR(e.dataFim)}
          </Badge>
        )}
        {e.tipo !== "Agendamento" && e.tipo !== "Programação" && (
          <Badge variant="outline" className="bg-card px-1.5 py-0 text-2xs">
            {e.tipo}
          </Badge>
        )}
      </div>
      {!compacto && (
        <div className="mt-3 space-y-1.5 text-xs">
          {e.equipeNome && (
            <p title={e.equipeNome} className="flex items-center gap-1.5 font-medium text-primary">
              <UsersRound className="size-3.5 shrink-0" />
              {[
                equipeNome,
                e.setor,
                e.capacidade != null ? `${e.capacidade.toLocaleString("pt-BR")} h/dia` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <p className="flex items-start gap-1.5">
            <UsersRound className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span title={e.pessoas.map((p) => p.nome).join(", ")} className="line-clamp-2">
              {e.pessoas.length
                ? e.pessoas.map((p) => abreviarNome(p.nome)).join(", ")
                : "Sem equipe definida"}
            </span>
          </p>
          <p className="flex items-center gap-1.5">
            <Truck className="size-3.5 shrink-0 text-muted-foreground" />
            <span>{e.veiculoRotulo ?? "Sem veículo"}</span>
          </p>
          {e.cliente && <p className="truncate text-muted-foreground">{e.cliente}</p>}
        </div>
      )}
    </button>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <CalendarDays className="mx-auto mb-2 size-8 text-muted-foreground opacity-50" />
      <p className="text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

function VisaoDiaria({
  dia,
  eventos,
  onOpen,
}: {
  dia: string;
  eventos: Evento[];
  onOpen: (e: Evento) => void;
}) {
  const doDia = eventos
    .filter((e) => eventoNoDia(e, dia))
    .sort(
      (a, b) =>
        (a.horaInicio ?? "").localeCompare(b.horaInicio ?? "") || a.titulo.localeCompare(b.titulo),
    );
  if (!doDia.length) return <Vazio texto="Nenhum compromisso para este dia." />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {doDia.map((e) => (
        <EventoCard key={e.chave} evento={e} onOpen={onOpen} />
      ))}
    </div>
  );
}

function VisaoSemanal({
  dias,
  hoje,
  eventos,
  onOpen,
  onDia,
}: {
  dias: string[];
  hoje: string;
  eventos: Evento[];
  onOpen: (e: Evento) => void;
  onDia: (dia: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <div className="grid min-w-[840px] grid-cols-7 divide-x">
        {dias.map((dia, i) => {
          const doDia = eventos.filter((e) => eventoNoDia(e, dia));
          return (
            <section key={dia} className={cn("min-h-72", dia === hoje && "bg-primary/5")}>
              <button
                type="button"
                onClick={() => onDia(dia)}
                className="w-full border-b bg-muted px-2 py-3 text-center hover:bg-primary/10"
              >
                <span className="block text-xs font-medium text-muted-foreground uppercase">
                  {DIAS_SEMANA_CURTOS[i]}
                </span>
                <span
                  className={cn(
                    "mt-1 inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold",
                    dia === hoje && "bg-primary text-primary-foreground",
                  )}
                >
                  {dia.slice(8)}
                </span>
              </button>
              <div className="space-y-2 p-2">
                {doDia.map((e) => (
                  <EventoCard key={e.chave} evento={e} onOpen={onOpen} compacto />
                ))}
                {!doDia.length && (
                  <p className="py-8 text-center text-xs text-muted-foreground">Livre</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function VisaoMensal({
  dias,
  anchor,
  hoje,
  eventos,
  onOpen,
  onDia,
}: {
  dias: string[];
  anchor: string;
  hoje: string;
  eventos: Evento[];
  onOpen: (e: Evento) => void;
  onDia: (dia: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-7 border-b bg-muted">
          {DIAS_SEMANA_CURTOS.map((d) => (
            <div
              key={d}
              className="p-2 text-center text-xs font-semibold text-muted-foreground uppercase"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {dias.map((dia) => {
            const doDia = eventos.filter((e) => eventoNoDia(e, dia));
            const foraDoMes = dia.slice(0, 7) !== anchor.slice(0, 7);
            return (
              <section
                key={dia}
                className={cn(
                  "min-h-32 border-r border-b p-1.5",
                  foraDoMes ? "bg-muted/60" : dia === hoje && "bg-primary/5",
                )}
              >
                <button
                  type="button"
                  onClick={() => onDia(dia)}
                  className={cn(
                    "mb-1 flex size-7 items-center justify-center rounded-full text-xs font-semibold hover:bg-primary/10",
                    dia === hoje
                      ? "bg-primary text-primary-foreground"
                      : foraDoMes && "text-muted-foreground",
                  )}
                >
                  {dia.slice(8)}
                </button>
                <div className="space-y-1">
                  {doDia.slice(0, 3).map((e) => (
                    <button
                      type="button"
                      key={e.chave}
                      title={e.titulo}
                      onClick={() => onOpen(e)}
                      className={cn(
                        "flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left text-xs",
                        TOM_EVENTO[e.tipo],
                        e.conflito && "ring-1 ring-amber-400",
                      )}
                    >
                      {e.conflito ? (
                        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                      ) : (
                        <IconeEvento tipo={e.tipo} />
                      )}
                      <span className="truncate">
                        {e.horaInicio ? `${horarioCurto(e.horaInicio)} ` : ""}
                        {e.titulo}
                      </span>
                    </button>
                  ))}
                  {doDia.length > 3 && (
                    <button
                      type="button"
                      onClick={() => onDia(dia)}
                      className="w-full px-1 text-left text-xs font-medium text-primary hover:underline"
                    >
                      + {doDia.length - 3} compromisso(s)
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
