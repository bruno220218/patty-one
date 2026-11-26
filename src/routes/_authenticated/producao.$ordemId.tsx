import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  History,
  Loader2,
  Lock,
  Save,
  Trash2,
  Truck,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ClientePicker, OrdemStatusBadge, TOM, selectClass } from "@/components/app/operacao-ui";
import { EtapasComTempo } from "@/components/app/etapas-tempo";
import { VinculosBriefingVisita } from "@/components/app/vinculos-briefing-visita";
import { ConclusaoOrdemPanel } from "@/components/app/ordem-conclusao";
import { AssistentePcp } from "@/components/app/assistente-pcp";
import { ColagemCampos, enderecoDoPonto } from "@/components/app/ordem-colagem-campos";
import {
  useChecklists,
  useCurrentUser,
  useDataAction,
  useOrdem,
  usePedidosAbertos,
  useRecursosOperacao,
} from "@/hooks/use-data";
import {
  abreviarNome,
  alertaPrazo,
  canExecutarOperacao,
  canGerirOperacao,
  canVender,
  COMPLEXIDADES,
  dataBR,
  etapasDaOrdem,
  MOTIVOS_SEM_PEDIDO,
  operacaoRepository,
  podeConcluirOrdem,
  PRIORIDADES_ORDEM,
  progressoOrdem,
  STATUS_AGUARDANDO_LIBERACAO,
  STATUS_DO_FLUXO,
  STATUS_ORDEM,
  textoAlertaPrazo,
  TIPOS_ORDEM,
  validarOrdem,
  type Complexidade,
  type MotivoSemPedido,
  type OrdemFicha,
  type Recursos,
  type StatusOrdem,
  type TipoOrdem,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "/producao/nova" opens an empty order; "?pedido=<id>" starts it linked to that pedido. */
export const Route = createFileRoute("/_authenticated/producao/$ordemId")({
  validateSearch: (s: Record<string, unknown>): { pedido?: string } =>
    typeof s["pedido"] === "string" && s["pedido"] ? { pedido: s["pedido"] } : {},
  head: () => ({
    meta: [{ title: "Ordem de produção — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: OrdemPage,
});

function OrdemPage() {
  const { ordemId } = Route.useParams();
  const nova = ordemId === "nova";
  const recursos = useRecursosOperacao();
  const ordem = useOrdem(nova ? "" : ordemId);
  if (recursos.isPending || (!nova && ordem.isPending)) return <CardGridSkeleton />;
  if (recursos.error || (!nova && (ordem.error || !ordem.data))) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Ordem não encontrada"
        description={(recursos.error ?? ordem.error)?.message ?? "Ela pode ter sido excluída."}
      />
    );
  }
  return (
    <Editor
      key={nova ? "nova" : `${ordemId}-${ordem.data?.updatedAt ?? ""}`}
      recursos={recursos.data}
      doc={nova ? undefined : ordem.data}
    />
  );
}

type Form = {
  tipo: TipoOrdem;
  status: StatusOrdem;
  prioridade: string;
  complexidade: Complexidade;
  cliente: { id: string; nome: string } | null;
  vendaId: string;
  motivoSemPedido: MotivoSemPedido | "";
  servicoId: string;
  /** "" = the service's or the type's steps. */
  checklistId: string;
  descricao: string;
  dataPrevista: string;
  localInstalacao: string;
  veiculoId: string;
  observacao: string;
  equipe: string[];
  etapas: string[];
  pontoId: string;
  bissemana: { ano: number; numero: number } | null;
};

function Editor({ recursos, doc }: { recursos: Recursos; doc: OrdemFicha | undefined }) {
  const { pedido: pedidoInicial } = Route.useSearch();
  const navigate = useNavigate();
  const run = useDataAction();
  const { data: me } = useCurrentUser();
  const podeGerir = canGerirOperacao(me);
  const podeExecutar = canExecutarOperacao(me);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [f, setF] = useState<Form>(() =>
    doc
      ? {
          tipo: doc.tipo,
          status: doc.status,
          prioridade: doc.prioridade,
          complexidade: doc.complexidade,
          cliente: doc.cadastroId ? { id: doc.cadastroId, nome: doc.clienteNome } : null,
          vendaId: doc.vendaId ?? "",
          motivoSemPedido: doc.motivoSemPedido,
          servicoId: doc.servicoId ?? "",
          checklistId: doc.checklistId ?? "",
          descricao: doc.descricao,
          dataPrevista: doc.dataPrevista ?? "",
          localInstalacao: doc.localInstalacao,
          veiculoId: doc.veiculoId ?? "",
          observacao: doc.observacao,
          equipe: doc.equipe.map((c) => c.id),
          etapas: doc.etapasDetalhe.map((e) => e.nome),
          pontoId: doc.pontoId ?? "",
          bissemana: doc.bissemana,
        }
      : {
          tipo: "Instalação",
          status: "Aguardando",
          prioridade: "Normal",
          complexidade: "Média",
          cliente: null,
          vendaId: pedidoInicial ?? "",
          motivoSemPedido: "",
          servicoId: "",
          checklistId: "",
          descricao: "",
          dataPrevista: "",
          localInstalacao: "",
          veiculoId: "",
          observacao: "",
          equipe: [],
          etapas: etapasDaOrdem("Instalação"),
          pontoId: "",
          bissemana: null,
        },
  );
  const set = (p: Partial<Form>) => setF((a) => ({ ...a, ...p }));
  const checklists = useChecklists();
  const padrao = useQuery({
    queryKey: ["operacao", "checklists-padrao"],
    queryFn: () => operacaoRepository.checklistsPadrao(),
    enabled: podeGerir,
  });
  const tarefasDo = (id: string) =>
    checklists.data?.find((c) => c.id === id)?.tasks.map((t) => t.title) ?? [];
  const checklistsComTarefas = (checklists.data ?? []).filter((c) => c.tasks.length > 0);

  // New order: start with the type's default checklist, once both lists have loaded.
  const [padraoAplicado, setPadraoAplicado] = useState(false);
  useEffect(() => {
    if (doc || padraoAplicado || !padrao.data || !checklists.data) return;
    setPadraoAplicado(true);
    const id = padrao.data[f.tipo];
    if (id && tarefasDo(id).length) set({ checklistId: id, etapas: tarefasDo(id) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padrao.data, checklists.data]);
  const pedidos = usePedidosAbertos();
  // A cancelled pedido isn't offered, but stays visible while it's the linked one.
  const pedidosVisiveis = (pedidos.data ?? []).concat(
    f.vendaId && pedidos.data && !pedidos.data.some((p) => p.id === f.vendaId)
      ? [
          {
            id: f.vendaId,
            numero: 0,
            cadastroId: null,
            clienteNome: "pedido atual",
            primeiroItem: "",
          },
        ]
      : [],
  );

  /** Linking a pedido fills the client and the description when they are still empty. */
  function escolherPedido(id: string) {
    const p = pedidos.data?.find((x) => x.id === id);
    setF((a) => ({
      ...a,
      vendaId: id,
      cliente: !a.cliente && p?.cadastroId ? { id: p.cadastroId, nome: p.clienteNome } : a.cliente,
      descricao: !a.descricao.trim() && p?.primeiroItem ? p.primeiroItem : a.descricao,
    }));
  }

  // Opened from a pedido ("Nova ordem"): fill in its client and first item once the list loads.
  const [pedidoAplicado, setPedidoAplicado] = useState(false);
  useEffect(() => {
    if (doc || !pedidoInicial || pedidoAplicado || !pedidos.data) return;
    setPedidoAplicado(true);
    escolherPedido(pedidoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos.data]);

  const servicosAtivos = recursos.servicos.filter((s) => s.ativo || s.id === f.servicoId);
  const servico = recursos.servicos.find((s) => s.id === f.servicoId);
  const colaboradores = recursos.colaboradores.filter((c) => c.ativo || f.equipe.includes(c.id));
  const veiculos = recursos.veiculos.filter((v) => v.ativo || v.id === f.veiculoId);
  const etapas = doc?.etapasDetalhe ?? [];
  /** A step done or any time recorded: the steps can't be swapped any more. */
  const comecou = etapas.some((e) => e.concluido || e.trechos.length > 0);
  const progresso = progressoOrdem(etapas);
  const fechada = f.status === "Concluída" || f.status === "Cancelada";
  /** Born from a liberação still waiting for approval: nobody executes it yet. */
  const esperandoLiberacao = doc?.status === STATUS_AGUARDANDO_LIBERACAO;
  const daLiberacao = Boolean(doc?.liberacaoId);
  const alerta = doc
    ? alertaPrazo(doc.dataPrevista, f.status, new Date().toISOString().slice(0, 10))
    : null;

  function escolherServico(id: string) {
    const s = recursos.servicos.find((x) => x.id === id);
    set({
      servicoId: id,
      descricao: !f.descricao.trim() && s ? s.nome : f.descricao,
      // With a checklist the steps stay (the database does the same).
      ...(f.checklistId ? {} : { etapas: etapasDaOrdem(f.tipo, s?.etapas) }),
    });
  }
  function escolherTipo(tipo: TipoOrdem) {
    // A new order on the old type's default checklist follows the new type's default.
    const seguePadrao = !doc && f.checklistId === (padrao.data?.[f.tipo] ?? "");
    const checklistId = seguePadrao ? (padrao.data?.[tipo] ?? "") : f.checklistId;
    set({
      tipo,
      status: doc ? f.status : "Aguardando",
      checklistId,
      etapas: checklistId ? tarefasDo(checklistId) : etapasDaOrdem(tipo, servico?.etapas),
    });
  }
  function escolherChecklist(id: string) {
    set({ checklistId: id, etapas: id ? tarefasDo(id) : etapasDaOrdem(f.tipo, servico?.etapas) });
  }

  async function salvar() {
    const erro = validarOrdem({
      tipo: f.tipo,
      descricao: f.descricao,
      localInstalacao: f.localInstalacao,
      etapas: f.etapas,
      // Old orders without pedido and without motivo stay editable (as in the database).
      semPedidoExigeMotivo: !f.vendaId && (!doc || Boolean(doc.vendaId)),
      motivoSemPedido: f.motivoSemPedido,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    setSalvando(true);
    const id = await run(
      () =>
        operacaoRepository.salvarOrdem(
          {
            tipo: f.tipo,
            status: f.status,
            prioridade: f.prioridade,
            complexidade: f.complexidade,
            cadastroId: f.cliente?.id ?? "",
            vendaId: f.vendaId,
            motivoSemPedido: f.vendaId ? "" : f.motivoSemPedido,
            servicoId: f.servicoId,
            checklistId: f.checklistId,
            descricao: f.descricao,
            dataPrevista: f.dataPrevista,
            localInstalacao: f.tipo === "Impressão" ? "" : f.localInstalacao,
            veiculoId: f.tipo === "Instalação" ? f.veiculoId : "",
            observacao: f.observacao,
            equipe: f.equipe,
            etapas: f.etapas,
            pontoId: f.tipo === "Colagem" ? f.pontoId : "",
            bissemana: f.tipo === "Colagem" ? f.bissemana : null,
          },
          doc?.id,
        ),
      doc ? "Ordem atualizada" : "Ordem de produção criada",
    );
    setSalvando(false);
    if (id && !doc) navigate({ to: "/producao/$ordemId", params: { ordemId: id }, replace: true });
  }

  async function excluir() {
    if (!doc) return;
    const ok = await run(
      () => operacaoRepository.excluirOrdem(doc.id).then(() => true),
      "Ordem excluída",
    );
    if (ok) navigate({ to: "/producao", search: { tipo: "", status: "", busca: "", pagina: 1 } });
  }

  const bloqueado = !podeGerir;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Voltar às ordens">
            <Link to="/producao" search={{ tipo: "", status: "", busca: "", pagina: 1 }}>
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {doc ? `Ordem nº ${doc.numero}` : "Nova ordem de produção"}
              </h1>
              {doc && <OrdemStatusBadge status={doc.status} />}
            </div>
            <p className="text-sm text-muted-foreground">
              {doc ? `Criada em ${dataBR(doc.createdAt)}` : "Instalação ou impressão"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {doc && podeGerir && (
            <Button variant="outline" onClick={() => setExcluindo(true)}>
              <Trash2 />
              Excluir
            </Button>
          )}
          {podeGerir && (
            <Button onClick={() => void salvar()} disabled={salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar ordem
            </Button>
          )}
        </div>
      </div>

      {!podeGerir && (
        <p className="text-sm text-muted-foreground">
          Só Gestão e PCP editam a ordem.{podeExecutar ? " Você pode marcar as etapas." : ""}
        </p>
      )}

      {doc && daLiberacao && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
            esperandoLiberacao ? TOM.primario : TOM.neutro,
          )}
        >
          <p className="text-sm">
            {esperandoLiberacao
              ? `Esta ordem nasceu da liberação nº ${doc.liberacaoNumero ?? "?"} e espera a aprovação do PCP. Até lá, ninguém inicia nem dá baixa nas etapas.`
              : `Ordem criada pela liberação nº ${doc.liberacaoNumero ?? "?"}.`}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/liberacoes/$liberacaoId" params={{ liberacaoId: doc.liberacaoId ?? "" }}>
              <ExternalLink />
              Abrir a liberação
            </Link>
          </Button>
        </div>
      )}

      {alerta && (
        <div
          role="alert"
          className={cn(
            "flex items-start gap-3 rounded-2xl border p-4",
            alerta.tipo === "atrasada" ? TOM.perigo : TOM.aviso,
          )}
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">{textoAlertaPrazo(alerta)}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Data prevista: {dataBR(doc?.dataPrevista)}. Revise as etapas e a prioridade desta
              ordem.
            </p>
          </div>
        </div>
      )}

      {/* Assistente do PCP: complexity, priority, stalled steps and, in conferência, what to check. */}
      {doc && podeGerir && doc.status !== "Concluída" && doc.status !== "Cancelada" && (
        <AssistentePcp
          pedido={{ momento: "ordem", id: doc.id }}
          versao={doc.updatedAt}
          onAplicarOrdem={(v) =>
            set({
              ...(v.complexidade ? { complexidade: v.complexidade as Complexidade } : {}),
              ...(v.prioridade ? { prioridade: v.prioridade } : {}),
            })
          }
        />
      )}

      {doc && (
        <ConclusaoOrdemPanel
          ordem={doc}
          podeConferir={podeGerir}
          podeConfirmarCliente={canVender(me)}
        />
      )}

      <section className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="tipo">Tipo de ordem</Label>
          <select
            id="tipo"
            className={selectClass}
            value={f.tipo}
            disabled={bloqueado}
            onChange={(e) => escolherTipo(e.target.value as TipoOrdem)}
          >
            {TIPOS_ORDEM.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prioridade">Prioridade</Label>
          <select
            id="prioridade"
            className={selectClass}
            value={f.prioridade}
            disabled={bloqueado}
            onChange={(e) => set({ prioridade: e.target.value })}
          >
            {PRIORIDADES_ORDEM.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="previsao">Data prevista</Label>
          <Input
            id="previsao"
            type="date"
            value={f.dataPrevista}
            disabled={bloqueado}
            onChange={(e) => set({ dataPrevista: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Situação</Label>
          <select
            id="status"
            className={selectClass}
            value={f.status}
            disabled={!doc || bloqueado}
            onChange={(e) => set({ status: e.target.value as StatusOrdem })}
          >
            {STATUS_ORDEM.filter((s) => !STATUS_DO_FLUXO.includes(s) || doc?.status === s).map(
              (s) => (
                <option
                  key={s}
                  disabled={s === "Concluída" && Boolean(doc) && !podeConcluirOrdem(etapas)}
                >
                  {s}
                </option>
              ),
            )}
          </select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="pedido">Pedido de venda (opcional)</Label>
          <div className="flex gap-2">
            <select
              id="pedido"
              className={selectClass}
              value={f.vendaId}
              disabled={bloqueado || pedidos.isPending || daLiberacao}
              title={daLiberacao ? "O pedido vem da liberação" : undefined}
              onChange={(e) => escolherPedido(e.target.value)}
            >
              <option value="">Sem vínculo com pedido</option>
              {pedidosVisiveis.map((p) => (
                <option key={p.id} value={p.id}>
                  Pedido {p.numero} — {p.clienteNome || "Sem cliente"}
                </option>
              ))}
            </select>
            {f.vendaId && (
              <Button variant="outline" size="icon" asChild aria-label="Abrir o pedido">
                <Link to="/comercial/$vendaId" params={{ vendaId: f.vendaId }}>
                  <ExternalLink />
                </Link>
              </Button>
            )}
          </div>
        </div>
        {!f.vendaId && (
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="motivo">Motivo da ordem sem pedido</Label>
            <select
              id="motivo"
              className={selectClass}
              value={f.motivoSemPedido}
              disabled={bloqueado}
              onChange={(e) => set({ motivoSemPedido: e.target.value as MotivoSemPedido | "" })}
            >
              <option value="">Escolha o motivo</option>
              {MOTIVOS_SEM_PEDIDO.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            {f.motivoSemPedido === "Urgência" && (
              <p className="text-xs text-muted-foreground">
                Na urgência, ligue o pedido aqui assim que ele existir.
              </p>
            )}
          </div>
        )}
        <div className="space-y-1.5 md:col-span-2">
          <Label>Cliente</Label>
          <ClientePicker
            value={f.cliente}
            disabled={bloqueado}
            onChange={(cliente) => set({ cliente })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="servico">Serviço</Label>
          <select
            id="servico"
            className={selectClass}
            value={f.servicoId}
            disabled={bloqueado}
            onChange={(e) => escolherServico(e.target.value)}
          >
            <option value="">Fluxo padrão do tipo</option>
            {servicosAtivos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="complexidade">Complexidade</Label>
          <select
            id="complexidade"
            className={selectClass}
            value={f.complexidade}
            disabled={bloqueado}
            title="O tempo das etapas é aprendido separadamente para cada nível"
            onChange={(e) => set({ complexidade: e.target.value as Complexidade })}
          >
            {COMPLEXIDADES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Input
            id="descricao"
            placeholder="O que precisa ser produzido ou instalado?"
            value={f.descricao}
            disabled={bloqueado}
            onChange={(e) => set({ descricao: e.target.value })}
          />
        </div>
        {f.tipo === "Colagem" && (
          <>
            <ColagemCampos
              pontoId={f.pontoId}
              bissemana={f.bissemana}
              disabled={bloqueado}
              onPonto={(p) =>
                set({
                  pontoId: p?.id ?? "",
                  localInstalacao:
                    p && !f.localInstalacao.trim() ? enderecoDoPonto(p) : f.localInstalacao,
                })
              }
              onBissemana={(bissemana) => set({ bissemana })}
            />
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="local-colagem">Local</Label>
              <Input
                id="local-colagem"
                placeholder="Endereço do ponto"
                value={f.localInstalacao}
                disabled={bloqueado}
                onChange={(e) => set({ localInstalacao: e.target.value })}
              />
            </div>
          </>
        )}
        {f.tipo === "Instalação" && (
          <>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="local">Local da instalação</Label>
              <Input
                id="local"
                placeholder="Endereço ou ponto de mídia"
                value={f.localInstalacao}
                disabled={bloqueado}
                onChange={(e) => set({ localInstalacao: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="veiculo">Veículo</Label>
              <div className="relative">
                <Truck className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
                <select
                  id="veiculo"
                  className={cn(selectClass, "pl-9")}
                  value={f.veiculoId}
                  disabled={bloqueado}
                  onChange={(e) => set({ veiculoId: e.target.value })}
                >
                  <option value="">Nenhum veículo</option>
                  {veiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="size-5 text-primary" />
                Etapas
              </h2>
              <p className="text-sm text-muted-foreground">
                {doc
                  ? `${etapas.filter((e) => e.concluido).length} de ${etapas.length} concluídas`
                  : "O fluxo será criado junto com a ordem"}
              </p>
            </div>
            {doc && <span className="text-lg font-semibold">{progresso}%</span>}
          </div>
          {podeGerir && (
            <div className="space-y-1.5">
              <Label htmlFor="checklist">Checklist das etapas</Label>
              <select
                id="checklist"
                className={selectClass}
                value={f.checklistId}
                disabled={bloqueado || comecou || fechada || checklists.isPending}
                onChange={(e) => escolherChecklist(e.target.value)}
              >
                <option value="">Etapas do serviço ou padrão do tipo</option>
                {checklistsComTarefas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.fixedParams ? " (parâmetros fixos)" : ""}
                  </option>
                ))}
                {f.checklistId && !checklistsComTarefas.some((c) => c.id === f.checklistId) && (
                  <option value={f.checklistId}>Checklist atual</option>
                )}
              </select>
              <p className="text-xs text-muted-foreground">
                {comecou
                  ? "A ordem já começou: as etapas não mudam mais."
                  : doc && f.checklistId !== (doc.checklistId ?? "")
                    ? "As etapas serão trocadas ao salvar a ordem."
                    : "As etapas vêm do checklist. Só dá para trocar antes de a ordem começar."}
              </p>
            </div>
          )}
          {doc?.etapasFixas && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Lock className="size-3.5" />
              Parâmetros fixos: as etapas desta ordem não podem ser alteradas.
            </p>
          )}
          {doc && (
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progresso}%` }}
              />
            </div>
          )}
          {doc ? (
            <EtapasComTempo
              etapas={etapas}
              equipeOrdem={doc.equipe}
              colaboradores={recursos.colaboradores}
              podeExecutar={podeExecutar && !esperandoLiberacao}
              podeReabrir={Boolean(me?.isGestor)}
              fechada={fechada}
            />
          ) : (
            <div className="space-y-2">
              {f.etapas.map((nome, i) => (
                <div key={`${i}-${nome}`} className="flex items-center gap-3 rounded-xl border p-3">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">{nome}</span>
                </div>
              ))}
            </div>
          )}
          {doc && (
            <p className="text-xs text-muted-foreground">
              Toque em Iniciar ao começar uma etapa, em Pausar quando parar e marque a caixa para
              dar baixa. O tempo medido ensina o sistema a estimar as próximas ordens. Para concluir
              a ordem, dê baixa em todas as etapas e altere a situação para “Concluída”.
            </p>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <UsersRound className="size-5 text-primary" />
              Equipe
            </h2>
            <p className="text-sm text-muted-foreground">
              {f.equipe.length
                ? `${f.equipe.length} colaborador(es) selecionado(s)`
                : "Selecione os colaboradores da ordem"}
            </p>
          </div>
          <details className="rounded-xl border" open={!doc}>
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Escolher colaboradores
            </summary>
            <div className="grid max-h-80 gap-1 overflow-y-auto border-t p-2 sm:grid-cols-2">
              {colaboradores.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg p-2 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={f.equipe.includes(c.id)}
                    disabled={bloqueado}
                    onChange={(e) =>
                      set({
                        equipe: e.target.checked
                          ? [...f.equipe, c.id]
                          : f.equipe.filter((id) => id !== c.id),
                      })
                    }
                  />
                  <span title={c.nome}>
                    {abreviarNome(c.nome)}
                    <span className="block text-xs text-muted-foreground">{c.empresa}</span>
                  </span>
                </label>
              ))}
              {!colaboradores.length && (
                <p className="col-span-full p-4 text-center text-sm text-muted-foreground">
                  Nenhum colaborador cadastrado. Cadastre em Produção › Produtos, serviços e
                  colaboradores.
                </p>
              )}
            </div>
          </details>
          <div className="space-y-1.5">
            <Label htmlFor="observacao">Observações</Label>
            <Textarea
              id="observacao"
              rows={5}
              placeholder="Materiais, medidas, orientações para a equipe…"
              value={f.observacao}
              disabled={bloqueado}
              onChange={(e) => set({ observacao: e.target.value })}
            />
          </div>
        </section>
      </div>

      {doc && <VinculosBriefingVisita ordemId={doc.id} />}

      {doc && (
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <History className="size-5 text-primary" />
            Histórico da ordem
          </h2>
          <div>
            {doc.eventos.map((e) => (
              <div key={e.id} className="relative flex gap-3 border-l pb-5 pl-5 last:pb-0">
                <Clock3 className="absolute top-0 -left-2 size-4 rounded-full bg-card text-primary" />
                <div>
                  <p className="text-sm font-medium">{e.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(e.createdAt)} · {e.autor || "Equipe"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={excluindo}
        onOpenChange={setExcluindo}
        title="Excluir ordem?"
        description="A ordem, as etapas e o histórico dela serão excluídos de vez. Agendamentos e serviços ligados a ela ficam, sem o vínculo."
        onConfirm={() => void excluir()}
      />
    </div>
  );
}
