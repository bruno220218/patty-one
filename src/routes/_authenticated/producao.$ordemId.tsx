import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  History,
  Loader2,
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
import { useCurrentUser, useDataAction, useOrdem, useRecursosOperacao } from "@/hooks/use-data";
import {
  abreviarNome,
  alertaPrazo,
  canExecutarOperacao,
  canGerirOperacao,
  dataBR,
  etapasDaOrdem,
  operacaoRepository,
  podeConcluirOrdem,
  PRIORIDADES_ORDEM,
  progressoOrdem,
  STATUS_ORDEM,
  textoAlertaPrazo,
  TIPOS_ORDEM,
  validarOrdem,
  type OrdemFicha,
  type Recursos,
  type StatusOrdem,
  type TipoOrdem,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "/producao/nova" opens an empty order. */
export const Route = createFileRoute("/_authenticated/producao/$ordemId")({
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
  cliente: { id: string; nome: string } | null;
  servicoId: string;
  descricao: string;
  dataPrevista: string;
  localInstalacao: string;
  veiculoId: string;
  observacao: string;
  equipe: string[];
  etapas: string[];
};

function Editor({ recursos, doc }: { recursos: Recursos; doc: OrdemFicha | undefined }) {
  const navigate = useNavigate();
  const run = useDataAction();
  const { data: me } = useCurrentUser();
  const podeGerir = canGerirOperacao(me);
  const podeExecutar = canExecutarOperacao(me);
  const [salvando, setSalvando] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [f, setF] = useState<Form>(() =>
    doc
      ? {
          tipo: doc.tipo,
          status: doc.status,
          prioridade: doc.prioridade,
          cliente: doc.cadastroId ? { id: doc.cadastroId, nome: doc.clienteNome } : null,
          servicoId: doc.servicoId ?? "",
          descricao: doc.descricao,
          dataPrevista: doc.dataPrevista ?? "",
          localInstalacao: doc.localInstalacao,
          veiculoId: doc.veiculoId ?? "",
          observacao: doc.observacao,
          equipe: doc.equipe.map((c) => c.id),
          etapas: doc.etapasDetalhe.map((e) => e.nome),
        }
      : {
          tipo: "Instalação",
          status: "Aguardando",
          prioridade: "Normal",
          cliente: null,
          servicoId: "",
          descricao: "",
          dataPrevista: "",
          localInstalacao: "",
          veiculoId: "",
          observacao: "",
          equipe: [],
          etapas: etapasDaOrdem("Instalação"),
        },
  );
  const set = (p: Partial<Form>) => setF((a) => ({ ...a, ...p }));
  const servicosAtivos = recursos.servicos.filter((s) => s.ativo || s.id === f.servicoId);
  const servico = recursos.servicos.find((s) => s.id === f.servicoId);
  const colaboradores = recursos.colaboradores.filter((c) => c.ativo || f.equipe.includes(c.id));
  const veiculos = recursos.veiculos.filter((v) => v.ativo || v.id === f.veiculoId);
  const etapas = doc?.etapasDetalhe ?? [];
  const progresso = progressoOrdem(etapas);
  const fechada = f.status === "Concluída" || f.status === "Cancelada";
  const alerta = doc
    ? alertaPrazo(doc.dataPrevista, f.status, new Date().toISOString().slice(0, 10))
    : null;

  function escolherServico(id: string) {
    const s = recursos.servicos.find((x) => x.id === id);
    set({
      servicoId: id,
      descricao: !f.descricao.trim() && s ? s.nome : f.descricao,
      etapas: etapasDaOrdem(f.tipo, s?.etapas),
    });
  }
  function escolherTipo(tipo: TipoOrdem) {
    set({
      tipo,
      status: doc ? f.status : "Aguardando",
      etapas: etapasDaOrdem(tipo, servico?.etapas),
    });
  }

  async function salvar() {
    const erro = validarOrdem({
      tipo: f.tipo,
      descricao: f.descricao,
      localInstalacao: f.localInstalacao,
      etapas: f.etapas,
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
            cadastroId: f.cliente?.id ?? "",
            servicoId: f.servicoId,
            descricao: f.descricao,
            dataPrevista: f.dataPrevista,
            localInstalacao: f.tipo === "Instalação" ? f.localInstalacao : "",
            veiculoId: f.tipo === "Instalação" ? f.veiculoId : "",
            observacao: f.observacao,
            equipe: f.equipe,
            etapas: f.etapas,
          },
          doc?.id,
        ),
      doc ? "Ordem atualizada" : "Ordem de produção criada",
    );
    setSalvando(false);
    if (id && !doc) navigate({ to: "/producao/$ordemId", params: { ordemId: id }, replace: true });
  }

  async function marcar(etapaId: string, concluida: boolean) {
    setMarcando(true);
    await run(() => operacaoRepository.marcarEtapa(etapaId, concluida));
    setMarcando(false);
  }

  async function excluir() {
    if (!doc) return;
    const ok = await run(
      () => operacaoRepository.excluirOrdem(doc.id).then(() => true),
      "Ordem excluída",
    );
    if (ok) navigate({ to: "/producao" });
  }

  const bloqueado = !podeGerir;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Voltar às ordens">
            <Link to="/producao">
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
            {STATUS_ORDEM.map((s) => (
              <option
                key={s}
                disabled={s === "Concluída" && Boolean(doc) && !podeConcluirOrdem(etapas)}
              >
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 md:col-span-2 lg:col-span-4">
          <Label>Cliente</Label>
          <ClientePicker
            value={f.cliente}
            disabled={bloqueado}
            onChange={(cliente) => set({ cliente })}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
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
          {doc && (
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progresso}%` }}
              />
            </div>
          )}
          <div className="space-y-2">
            {(doc
              ? etapas
              : f.etapas.map((nome, i) => ({
                  id: String(i),
                  nome,
                  concluido: false,
                  concluidoPorNome: "",
                  concluidoEm: null,
                }))
            ).map((e, i) => {
              const clicavel = Boolean(doc) && podeExecutar && !fechada;
              return (
                <label
                  key={e.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3",
                    clicavel && "cursor-pointer hover:bg-muted/50",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={e.concluido}
                    disabled={!clicavel || marcando}
                    onChange={(ev) => void marcar(e.id, ev.target.checked)}
                  />
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {e.concluido ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={e.concluido ? "text-muted-foreground line-through" : ""}>
                      {e.nome}
                    </span>
                    {e.concluido && e.concluidoPorNome && (
                      <span className="block text-xs text-muted-foreground">
                        {abreviarNome(e.concluidoPorNome)}
                        {e.concluidoEm ? ` · ${formatDateTime(e.concluidoEm)}` : ""}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          {doc && (
            <p className="text-xs text-muted-foreground">
              Para concluir a ordem, marque todas as etapas e depois altere a situação para
              “Concluída”.
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
