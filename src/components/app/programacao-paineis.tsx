import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  MapPin,
  MessageCircle,
  Truck,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ConfirmacaoConflitos,
  ImagensButton,
  ImagensLinks,
  TOM,
  TOM_STATUS_PROGRAMACAO,
} from "@/components/app/operacao-ui";
import { useDataAction } from "@/hooks/use-data";
import {
  abreviarNome,
  adicionarDias,
  agruparResumo,
  alocacaoDaLinha,
  alocacaoDoAgendamento,
  dataCurtaBR,
  detectarConflitos,
  diasEmAberto,
  hojeISO,
  idsComAlertaPendente,
  itemResumoDoAgendamento,
  itemResumoDoServico,
  linhaDoServico,
  operacaoRepository,
  quantidadeServicosNoDia,
  STATUS_PROGRAMACAO,
  textoWhatsApp,
  type Conflito,
  type GrupoResumo,
  type ProgramacaoDia,
  type ServicoProgramado,
  type StatusProgramacao,
} from "@/lib/data";
import { cn } from "@/lib/utils";

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Texto copiado. Cole no WhatsApp.");
  } catch {
    toast.error("Não foi possível copiar automaticamente.");
  }
}

function abrirWhatsApp(texto: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener,noreferrer");
}

/** Appointments from the schedule on this day, so they're not left out of the programming. */
export function AgendamentosDoDia({ dados, data }: { dados: ProgramacaoDia; data: string }) {
  const agendamentos = dados.agendamentos.filter((a) => a.tipo !== "Reserva de urgência");
  if (!agendamentos.length) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarDays className="size-4 text-primary" />
            Agendamentos também programados neste dia
          </h2>
          <p className="text-xs text-muted-foreground">
            Vêm do cronograma e aparecem aqui para não ficarem de fora.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/planejamento" search={{ visao: "diario", data }}>
            Abrir cronograma
          </Link>
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {agendamentos.map((a) => {
          const nomes = a.colaboradores.map((c) => c.nome);
          return (
            <article key={a.id} className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{a.titulo}</h3>
                    <Badge variant="outline">{a.tipo}</Badge>
                  </div>
                  {a.ordem?.clienteNome && (
                    <p className="mt-1 text-xs text-muted-foreground">{a.ordem.clienteNome}</p>
                  )}
                </div>
                <ImagensButton
                  entidade="agendamento"
                  entidadeId={a.id}
                  quantidade={a.imagens.length}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock3 className="size-3.5" />
                  {a.horaInicio
                    ? `${a.horaInicio.slice(0, 5)}–${a.horaFim?.slice(0, 5)}`
                    : "Dia inteiro"}
                </span>
                <span title={nomes.join(", ")} className="flex items-center gap-1">
                  <UsersRound className="size-3.5" />
                  {a.equipe?.nome ?? (nomes.map(abreviarNome).join(", ") || "Sem equipe")}
                </span>
                <span className="flex items-center gap-1">
                  <Truck className="size-3.5" />
                  {a.veiculo?.rotulo ?? "Sem veículo"}
                </span>
              </div>
              <div className="mt-3">
                <ImagensLinks imagens={a.imagens} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Summary by team/vehicle, the situation of each service and the WhatsApp text. */
export function ResumoDia({
  dados,
  data,
  podeMudarStatus,
}: {
  dados: ProgramacaoDia;
  data: string;
  podeMudarStatus: boolean;
}) {
  const run = useDataAction();
  const grupos = useMemo(
    () =>
      agruparResumo([
        ...dados.itens.map(itemResumoDoServico),
        ...dados.agendamentos
          .filter((a) => a.tipo !== "Reserva de urgência")
          .map(itemResumoDoAgendamento),
      ]),
    [dados.itens, dados.agendamentos],
  );
  const alocacoes = useMemo(
    () => [
      ...dados.itens.map((s) => alocacaoDaLinha(linhaDoServico(s))),
      ...dados.agendamentos.map(alocacaoDoAgendamento),
    ],
    [dados],
  );
  const conflitos = useMemo(() => detectarConflitos(alocacoes), [alocacoes]);
  const alertas = useMemo(() => idsComAlertaPendente(conflitos, alocacoes), [conflitos, alocacoes]);
  const total = grupos.reduce(
    (t, g) => ({ p: t.p + g.programados, c: t.c + g.concluidos, x: t.x + g.pendentes }),
    { p: 0, c: 0, x: 0 },
  );
  const textoDia = () => textoWhatsApp(data, grupos);
  const mudarStatus = (id: string, status: StatusProgramacao) =>
    void run(() => operacaoRepository.mudarStatusServico(id, status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <Clock3 className="size-4 text-primary" />
            <b>{total.p}</b> programados
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <b>{total.c}</b> concluídos
          </span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="size-4 text-destructive" />
            <b>{total.x}</b> pendentes
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void copiar(textoDia())}
            disabled={!grupos.length}
          >
            <Copy />
            Copiar dia completo
          </Button>
          <Button onClick={() => abrirWhatsApp(textoDia())} disabled={!grupos.length}>
            <MessageCircle />
            Enviar programação do dia
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A mensagem completa reúne todos os setores, serviços e agendamentos, por equipe, veículo e
        horário, com os links das imagens no Drive.
      </p>
      {!grupos.length && (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum serviço salvo para este dia. Lance os serviços na aba “Lançamento rápido”.
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {grupos.map((g) => (
          <GrupoCard
            key={g.chave}
            grupo={g}
            data={data}
            alertas={alertas}
            conflitos={conflitos}
            podeMudarStatus={podeMudarStatus}
            onStatus={mudarStatus}
          />
        ))}
      </div>
    </div>
  );
}

function GrupoCard({
  grupo: g,
  data,
  alertas,
  conflitos,
  podeMudarStatus,
  onStatus,
}: {
  grupo: GrupoResumo;
  data: string;
  alertas: Set<string>;
  conflitos: Conflito[];
  podeMudarStatus: boolean;
  onStatus: (id: string, v: StatusProgramacao) => void;
}) {
  const texto = () => textoWhatsApp(data, [g]);
  const primeiro = g.itens[0];
  const titulo =
    [primeiro?.equipeNome, primeiro?.liderNome ? abreviarNome(primeiro.liderNome) : null]
      .filter(Boolean)
      .join(" / ") || g.titulo;
  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 title={g.titulo} className="flex items-center gap-1.5 font-semibold">
            <UsersRound className="size-4 text-primary" />
            {titulo}
          </h3>
          {g.ajudantes.length > 0 && (
            <p title={g.ajudantes.join(", ")} className="mt-0.5 text-xs text-muted-foreground">
              Ajudantes: {g.ajudantes.map(abreviarNome).join(", ")}
            </p>
          )}
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Truck className="size-3.5" />
            {g.veiculo ?? "Sem veículo"}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => void copiar(texto())}>
            <Copy />
            Copiar
          </Button>
          <Button variant="outline" size="sm" onClick={() => abrirWhatsApp(texto())}>
            <MessageCircle />
            WhatsApp
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className={cn("rounded-full border px-2 py-0.5", TOM.primario)}>
          {g.programados} programado(s)
        </span>
        <span className={cn("rounded-full border px-2 py-0.5", TOM.sucesso)}>
          {g.concluidos} concluído(s)
        </span>
        <span className={cn("rounded-full border px-2 py-0.5", TOM.perigo)}>
          {g.pendentes} pendente(s)
        </span>
      </div>
      <ol className="mt-3 divide-y">
        {g.itens.map((it, i) => {
          const noDia = quantidadeServicosNoDia(it.id, conflitos);
          return (
            <li key={it.id} className="flex items-start gap-3 py-3 text-sm">
              <span className="mt-0.5 w-5 text-xs text-muted-foreground">{i + 1}.</span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-medium">
                  {[it.cliente, [it.servico, it.produto].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(" — ")}
                  {alertas.has(it.id) && (
                    <span
                      className={cn(
                        "ml-2 inline-flex items-center gap-1 rounded border px-1.5 text-[11px]",
                        TOM.aviso,
                      )}
                    >
                      <AlertTriangle className="size-3" />
                      Recurso compartilhado
                    </span>
                  )}
                  {!alertas.has(it.id) && it.conflitoConfirmado && noDia > 1 && (
                    <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
                      {noDia} serviços no dia
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {it.setor}
                  {it.horaInicio ? ` · ${it.horaInicio.slice(0, 5)}` : ""}
                  {it.detalhamento ? ` · ${it.detalhamento}` : ""}
                </p>
                {it.observacao && (
                  <p className="text-xs text-muted-foreground">Observação: {it.observacao}</p>
                )}
                {it.local && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    {it.local}
                  </p>
                )}
                <ImagensLinks imagens={it.imagens} />
              </div>
              <div className="flex items-center gap-1">
                <ImagensButton
                  entidade={it.origem === "agendamento" ? "agendamento" : "programacao"}
                  entidadeId={it.origem === "agendamento" ? it.id.slice(3) : it.id}
                  quantidade={it.imagens.length}
                />
                {it.origem === "agendamento" ? (
                  <span className={cn("rounded-md border px-2 py-1 text-xs", TOM.primario)}>
                    Agendamento
                  </span>
                ) : (
                  <select
                    aria-label="Situação do serviço"
                    className={cn(
                      "h-7 rounded-md border px-1.5 text-xs",
                      TOM_STATUS_PROGRAMACAO[it.status],
                    )}
                    value={it.status}
                    disabled={!podeMudarStatus}
                    onChange={(e) => onStatus(it.id, e.target.value as StatusProgramacao)}
                  >
                    {STATUS_PROGRAMACAO.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

/** Services marked "Não realizado" or "Aguardando equipe", with one-click rescheduling. */
export function Pendencias({
  dados,
  podeReagendar,
}: {
  dados: ProgramacaoDia;
  podeReagendar: boolean;
}) {
  const hoje = hojeISO();
  if (!dados.pendencias.length) {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
        Nenhuma pendência. Serviços marcados como “Não realizado” ou “Aguardando equipe” aparecem
        aqui sozinhos.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="bg-muted text-left text-xs text-muted-foreground uppercase">
          <tr>
            {[
              "Em aberto",
              "Data",
              "Setor",
              "Cliente / serviço",
              "Equipe",
              "Situação",
              "Motivo",
              "",
            ].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {dados.pendencias.map((p) => {
            const dias = diasEmAberto(p.data, hoje);
            return (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-semibold",
                      dias >= 3 ? TOM.perigo : TOM.aviso,
                    )}
                  >
                    {dias === 0 ? "hoje" : `${dias} dia${dias === 1 ? "" : "s"}`}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {dataCurtaBR(p.data)}
                  {p.reagendamentos > 0 && (
                    <span className="block text-[11px] text-muted-foreground">
                      reagendado {p.reagendamentos}x · orig. {dataCurtaBR(p.dataOriginal)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{p.setor}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{p.cliente || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {[p.servico, p.produto, p.detalhamento].filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td title={p.liderNome} className="px-3 py-2 text-xs">
                  {p.equipeNome || (p.liderNome ? abreviarNome(p.liderNome) : "—")}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-xs",
                      TOM_STATUS_PROGRAMACAO[p.status],
                    )}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="max-w-56 px-3 py-2 text-xs text-muted-foreground">
                  {p.observacao || "—"}
                </td>
                <td className="px-3 py-2">
                  {podeReagendar && <Reagendar servico={p} dados={dados} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Destino = { data: string; equipe: string };

function Reagendar({ servico, dados }: { servico: ServicoProgramado; dados: ProgramacaoDia }) {
  const run = useDataAction();
  const amanha = adicionarDias(hojeISO(), 1);
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(amanha);
  const [equipe, setEquipe] = useState(servico.equipeId ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{ destino: Destino; mensagens: string[] } | null>(
    null,
  );
  const equipes = dados.recursos.equipes.filter((e) => e.ativo);

  function linhaNoDestino(destino: Destino, confirmado: boolean) {
    const linha = linhaDoServico(servico);
    const eq = equipes.find((e) => e.id === destino.equipe);
    const mudouEquipe = Boolean(eq && destino.equipe !== servico.equipeId);
    return {
      ...linha,
      data: destino.data,
      status: "Programado" as StatusProgramacao,
      conflitoConfirmado: confirmado,
      ...(mudouEquipe && eq
        ? {
            equipeId: eq.id,
            liderId: eq.colaboradores[0]?.id ?? "",
            veiculoId: eq.veiculos[0]?.id ?? "",
          }
        : {}),
    };
  }

  async function mover(destino: Destino, confirmado: boolean) {
    setOcupado(true);
    const ok = await run(
      () =>
        operacaoRepository
          .reagendarServico(linhaNoDestino(destino, confirmado), servico.posicao)
          .then(() => true),
      `Reagendado para ${dataCurtaBR(destino.data)}.`,
    );
    setOcupado(false);
    if (ok) {
      setAberto(false);
      setConfirmacao(null);
    }
  }

  async function solicitar(destino: Destino) {
    setOcupado(true);
    try {
      const atual = alocacaoDaLinha(linhaNoDestino(destino, false));
      const externas = await operacaoRepository.alocacoesExistentes([destino.data], [servico.id]);
      const conflitos = detectarConflitos([atual, ...externas]).filter((c) =>
        c.alocacoes.includes(atual.id),
      );
      const mensagens = [
        ...new Set(
          conflitos.map((c) => {
            const outro = externas.find((a) => a.id === c.alocacoes.find((id) => id !== atual.id));
            if (c.recurso === "colaborador") {
              const nome = abreviarNome(
                dados.recursos.colaboradores.find((x) => x.id === c.recursoId)?.nome ??
                  "Colaborador",
              );
              return `${nome} já está programado em outro serviço neste dia (${outro?.descricao ?? "serviço não identificado"}). Confirmar que estará nos dois serviços?`;
            }
            return `O veículo selecionado também está em ${outro?.descricao ?? "outro serviço"} neste dia. Confirmar o compartilhamento?`;
          }),
        ),
      ];
      setAberto(false);
      setOcupado(false);
      if (mensagens.length) setConfirmacao({ destino, mensagens });
      else await mover(destino, false);
    } catch (erro) {
      setOcupado(false);
      toast.error(erro instanceof Error ? erro.message : "Não foi possível verificar os recursos.");
    }
  }

  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={ocupado}
        onClick={() => void solicitar({ data: amanha, equipe: servico.equipeId ?? "" })}
        title="Reagendar para amanhã com a mesma equipe"
      >
        {ocupado ? <Loader2 className="animate-spin" /> : <CalendarClock />}
        Amanhã
      </Button>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" disabled={ocupado}>
            Outra data…
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2" align="end">
          <label className="block text-xs font-medium">
            Nova data
            <Input
              type="date"
              className="mt-1 h-8"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </label>
          <label className="block text-xs font-medium">
            Equipe
            <select
              className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={equipe}
              onChange={(e) => setEquipe(e.target.value)}
            >
              <option value="">Manter atual</option>
              {equipes.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.nome} — {eq.setor}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            className="w-full"
            disabled={!data || ocupado}
            onClick={() => void solicitar({ data, equipe })}
          >
            Reagendar
          </Button>
        </PopoverContent>
      </Popover>
      {confirmacao && (
        <ConfirmacaoConflitos
          mensagens={confirmacao.mensagens}
          salvando={ocupado}
          onConfirmar={() => void mover(confirmacao.destino, true)}
          onCancelar={() => setConfirmacao(null)}
        />
      )}
    </div>
  );
}
