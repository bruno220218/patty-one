import { useMemo, useState } from "react";
import { Loader2, Save, ShieldAlert, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ImagensButton, ImagensLinks, TOM, selectClass } from "@/components/app/operacao-ui";
import { useDataAction } from "@/hooks/use-data";
import {
  abreviarNome,
  operacaoRepository,
  TIPOS_AGENDAMENTO,
  validarAgendamento,
  type Agendamento,
  type AgendamentoInput,
  type OrdemResumo,
  type Recursos,
  type TipoAgendamento,
} from "@/lib/data";
import { cn } from "@/lib/utils";

/** Create or edit an appointment in the schedule (Gestão and PCP; the database checks conflicts). */
export function AgendamentoDialog({
  recursos,
  ordensLivres,
  agendamento,
  tipoInicial = "Agendamento",
  dataInicial,
  podeEditar,
  onClose,
}: {
  recursos: Recursos;
  /** Open orders without an appointment. */
  ordensLivres: OrdemResumo[];
  agendamento?: Agendamento | undefined;
  tipoInicial?: TipoAgendamento;
  dataInicial: string;
  podeEditar: boolean;
  onClose: () => void;
}) {
  const run = useDataAction();
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [f, setF] = useState<AgendamentoInput>(() =>
    agendamento
      ? {
          titulo: agendamento.titulo,
          tipo: agendamento.tipo,
          dataInicio: agendamento.dataInicio,
          dataFim: agendamento.dataFim,
          horaInicio: agendamento.horaInicio?.slice(0, 5) ?? "",
          horaFim: agendamento.horaFim?.slice(0, 5) ?? "",
          veiculoId: agendamento.veiculoId ?? "",
          ordemId: agendamento.ordemId ?? "",
          equipeId: agendamento.equipeId ?? "",
          equipe: agendamento.colaboradores.map((c) => c.id),
          observacao: agendamento.observacao,
        }
      : {
          titulo: tipoInicial === "Reserva de urgência" ? "Reserva para urgências" : "",
          tipo: tipoInicial,
          dataInicio: dataInicial,
          dataFim: dataInicial,
          horaInicio: "",
          horaFim: "",
          veiculoId: "",
          ordemId: "",
          equipeId: "",
          equipe: [],
          observacao: "",
        },
  );
  const set = (p: Partial<AgendamentoInput>) => setF((a) => ({ ...a, ...p }));

  const ordens = useMemo(() => {
    const lista = [...ordensLivres];
    if (agendamento?.ordem && !lista.some((o) => o.id === agendamento.ordem?.id))
      lista.push(agendamento.ordem);
    return lista;
  }, [ordensLivres, agendamento]);
  const equipesAtivas = recursos.equipes.filter((e) => e.ativo || e.id === f.equipeId);
  const equipeSelecionada = recursos.equipes.find((e) => e.id === f.equipeId);
  const veiculosDisponiveis = equipeSelecionada
    ? equipeSelecionada.veiculos
    : recursos.veiculos.filter((v) => v.ativo || v.id === f.veiculoId);
  const colaboradores = recursos.colaboradores.filter(
    (c) =>
      (c.ativo || f.equipe.includes(c.id)) &&
      c.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  function escolherOrdem(id: string) {
    const o = ordens.find((x) => x.id === id);
    set({
      ordemId: id,
      titulo:
        o && (!f.titulo.trim() || f.titulo === "Reserva para urgências")
          ? `Ordem nº ${o.numero} — ${o.descricao}`
          : f.titulo,
      veiculoId: o?.veiculoId ?? f.veiculoId,
      equipe: o?.equipe.length ? o.equipe.map((c) => c.id) : f.equipe,
    });
  }
  function escolherEquipe(id: string) {
    const e = recursos.equipes.find((x) => x.id === id);
    set({
      equipeId: id,
      equipe: e ? e.colaboradores.map((c) => c.id) : f.equipe,
      veiculoId: e?.veiculos[0]?.id ?? f.veiculoId,
    });
  }
  function escolherVeiculo(id: string) {
    const v = recursos.veiculos.find((x) => x.id === id);
    const e = v?.equipeId
      ? recursos.equipes.find((x) => x.id === v.equipeId && x.ativo)
      : undefined;
    set({
      veiculoId: id,
      ...(e ? { equipeId: e.id, equipe: e.colaboradores.map((c) => c.id) } : {}),
    });
  }
  function escolherTipo(tipo: TipoAgendamento) {
    set({
      tipo,
      titulo:
        tipo === "Reserva de urgência" && !f.titulo.trim() ? "Reserva para urgências" : f.titulo,
      ordemId: tipo === "Reserva de urgência" ? "" : f.ordemId,
    });
  }

  async function salvar() {
    const erro = validarAgendamento(f);
    if (erro) {
      toast.error(erro);
      return;
    }
    setSalvando(true);
    const id = await run(
      () => operacaoRepository.salvarAgendamento(f, agendamento?.id),
      agendamento
        ? "Agendamento atualizado"
        : f.tipo === "Reserva de urgência"
          ? "Reserva para urgências criada"
          : "Agendamento criado",
    );
    setSalvando(false);
    if (id) onClose();
  }

  async function excluir() {
    if (!agendamento) return;
    const ok = await run(
      () => operacaoRepository.excluirAgendamento(agendamento.id).then(() => true),
      "Agendamento excluído",
    );
    if (ok) onClose();
  }

  const bloqueado = !podeEditar;

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !salvando && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {agendamento
              ? podeEditar
                ? "Editar agendamento"
                : "Agendamento"
              : f.tipo === "Reserva de urgência"
                ? "Reservar capacidade para urgências"
                : "Novo agendamento"}
          </DialogTitle>
          <DialogDescription>
            Organize a equipe e o veículo em um período. O sistema avisa se houver conflito.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="ag-titulo">Título</Label>
            <Input
              id="ag-titulo"
              value={f.titulo}
              disabled={bloqueado}
              onChange={(e) => set({ titulo: e.target.value })}
              placeholder="Ex.: Instalação no ponto B46"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-tipo">Categoria</Label>
            <select
              id="ag-tipo"
              className={selectClass}
              value={f.tipo}
              disabled={bloqueado}
              onChange={(e) => escolherTipo(e.target.value as TipoAgendamento)}
            >
              {TIPOS_AGENDAMENTO.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-ordem">Ordem de produção (opcional)</Label>
            <select
              id="ag-ordem"
              className={selectClass}
              value={f.ordemId}
              disabled={bloqueado || f.tipo === "Reserva de urgência"}
              onChange={(e) => escolherOrdem(e.target.value)}
            >
              <option value="">Sem vínculo com ordem</option>
              {ordens.map((o) => (
                <option key={o.id} value={o.id}>
                  Ordem nº {o.numero} — {o.clienteNome || o.descricao}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="ag-equipe">Equipe de planejamento (opcional)</Label>
            <select
              id="ag-equipe"
              className={selectClass}
              value={f.equipeId}
              disabled={bloqueado}
              onChange={(e) => escolherEquipe(e.target.value)}
            >
              <option value="">Montar recursos manualmente</option>
              {equipesAtivas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome} — {e.setor} · {e.capacidade.toLocaleString("pt-BR")} h/dia
                </option>
              ))}
            </select>
            {equipeSelecionada && (
              <p className="text-xs text-muted-foreground">
                Os colaboradores e veículos desta equipe foram preenchidos automaticamente.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-inicio">Data inicial</Label>
            <Input
              id="ag-inicio"
              type="date"
              value={f.dataInicio}
              disabled={bloqueado}
              onChange={(e) =>
                set({
                  dataInicio: e.target.value,
                  dataFim: f.dataFim < e.target.value ? e.target.value : f.dataFim,
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-fim">Data final</Label>
            <Input
              id="ag-fim"
              type="date"
              min={f.dataInicio}
              value={f.dataFim}
              disabled={bloqueado}
              onChange={(e) => set({ dataFim: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-hora-inicio">Hora inicial (opcional)</Label>
            <Input
              id="ag-hora-inicio"
              type="time"
              value={f.horaInicio}
              disabled={bloqueado}
              onChange={(e) => set({ horaInicio: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-hora-fim">Hora final (opcional)</Label>
            <Input
              id="ag-hora-fim"
              type="time"
              value={f.horaFim}
              disabled={bloqueado}
              onChange={(e) => set({ horaFim: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="ag-veiculo">Veículo</Label>
            <select
              id="ag-veiculo"
              className={selectClass}
              value={f.veiculoId}
              disabled={bloqueado}
              onChange={(e) => escolherVeiculo(e.target.value)}
            >
              <option value="">Nenhum veículo</option>
              {veiculosDisponiveis.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(f.tipo === "Reserva de urgência" || f.tipo === "Urgência") && (
          <div className={cn("flex gap-3 rounded-xl border p-3 text-sm", TOM.aviso)}>
            <ShieldAlert className="mt-0.5 size-5 shrink-0" />
            <p className="text-foreground">
              {f.tipo === "Reserva de urgência"
                ? "Os recursos selecionados ficarão bloqueados para trabalhos comuns neste período."
                : "A urgência pode usar uma reserva existente, mas não pode sobrepor outro trabalho agendado."}
            </p>
          </div>
        )}

        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <UsersRound className="size-4 text-primary" />
                Colaboradores
              </h3>
              <p className="text-xs text-muted-foreground">{f.equipe.length} selecionado(s)</p>
            </div>
            <Input
              aria-label="Buscar colaborador"
              className="h-9 max-w-56"
              placeholder="Buscar colaborador…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border bg-muted/40 p-2 sm:grid-cols-2">
            {colaboradores.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-start gap-2 rounded-md bg-card p-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={f.equipe.includes(c.id)}
                  disabled={bloqueado || Boolean(f.equipeId)}
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
                Nenhum colaborador encontrado.
              </p>
            )}
          </div>
        </section>

        {agendamento ? (
          <div className="flex items-center gap-3 rounded-xl border p-3">
            <ImagensButton
              entidade="agendamento"
              entidadeId={agendamento.id}
              quantidade={agendamento.imagens.length}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Imagens</p>
              <ImagensLinks imagens={agendamento.imagens} />
              {!agendamento.imagens.length && (
                <p className="text-xs text-muted-foreground">Nenhuma imagem anexada.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
            Salve o agendamento para adicionar imagens.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ag-observacao">Observações</Label>
          <Textarea
            id="ag-observacao"
            rows={3}
            value={f.observacao}
            disabled={bloqueado}
            onChange={(e) => set({ observacao: e.target.value })}
            placeholder="Orientações, materiais ou contato…"
          />
        </div>

        <DialogFooter className="gap-2">
          {agendamento && podeEditar && (
            <Button
              type="button"
              variant="destructive"
              className="mr-auto"
              disabled={salvando}
              onClick={() => setExcluindo(true)}
            >
              <Trash2 />
              Excluir
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={salvando}>
            {podeEditar ? "Cancelar" : "Fechar"}
          </Button>
          {podeEditar && (
            <Button type="button" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar agendamento
            </Button>
          )}
        </DialogFooter>
        <ConfirmDialog
          open={excluindo}
          onOpenChange={setExcluindo}
          title="Excluir agendamento?"
          description="O agendamento sai do cronograma. Os links das imagens dele também são removidos."
          onConfirm={() => void excluir()}
        />
      </DialogContent>
    </Dialog>
  );
}
