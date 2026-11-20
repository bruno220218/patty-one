import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Pencil, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Kpi, selectClass } from "@/components/app/operacao-ui";
import { useCurrentUser, useDataAction, useRecursosOperacao } from "@/hooks/use-data";
import {
  canGerirOperacao,
  normalizarPlaca,
  operacaoRepository,
  validarVeiculo,
  type Equipe,
  type Veiculo,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/planejamento/veiculos")({
  head: () => ({
    meta: [{ title: "Veículos — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: VeiculosPage,
});

function VeiculosPage() {
  const { data, isPending, error } = useRecursosOperacao();
  const { data: me } = useCurrentUser();
  const podeGerir = canGerirOperacao(me);
  const [busca, setBusca] = useState("");
  const [editor, setEditor] = useState<{ veiculo?: Veiculo } | null>(null);
  const equipeNome = useMemo(
    () => new Map((data?.equipes ?? []).map((e) => [e.id, e.nome])),
    [data],
  );
  const veiculos = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return (data?.veiculos ?? []).filter(
      (v) =>
        !termo ||
        [v.placa, v.modelo, v.marca, v.apelido, v.equipeId ? equipeNome.get(v.equipeId) : ""].some(
          (x) => x?.toLocaleLowerCase("pt-BR").includes(termo),
        ),
    );
  }, [data, busca, equipeNome]);

  return (
    <>
      <PageHeader
        title="Veículos"
        description="Cadastro usado na programação, nos agendamentos e nas equipes."
        action={
          podeGerir && (
            <Button className="h-10" onClick={() => setEditor({})}>
              <Plus />
              Novo veículo
            </Button>
          )
        }
      />
      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState
          icon={Truck}
          title="Não foi possível abrir os veículos"
          description={error.message}
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi
              icon={Truck}
              label="Veículos ativos"
              value={data.veiculos.filter((v) => v.ativo).length}
            />
            <Kpi
              icon={Truck}
              label="Com equipe padrão"
              value={data.veiculos.filter((v) => v.equipeId).length}
              tom="sucesso"
            />
            <Kpi icon={Truck} label="Total cadastrado" value={data.veiculos.length} tom="neutro" />
          </div>
          <Input
            aria-label="Buscar veículos"
            placeholder="Buscar por placa, apelido, modelo ou equipe…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-xl"
          />
          {!podeGerir && (
            <p className="text-sm text-muted-foreground">
              Só Gestão e PCP alteram o cadastro de veículos.
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {veiculos.map((v) => (
              <article key={v.id} className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Truck />
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-semibold">{v.apelido || v.modelo || "Veículo"}</h2>
                      <p className="text-sm text-muted-foreground">
                        {v.placa}
                        {v.modelo && v.apelido ? ` · ${v.modelo}` : ""}
                      </p>
                    </div>
                  </div>
                  {podeGerir && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${v.rotulo}`}
                      onClick={() => setEditor({ veiculo: v })}
                    >
                      <Pencil />
                    </Button>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant={v.ativo ? "outline" : "secondary"}>
                    {v.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                  {v.equipeId && (
                    <Badge variant="outline">Equipe: {equipeNome.get(v.equipeId) ?? "—"}</Badge>
                  )}
                </div>
                {v.observacao && (
                  <p className="mt-3 text-sm whitespace-pre-wrap text-muted-foreground">
                    {v.observacao}
                  </p>
                )}
              </article>
            ))}
          </div>
          {!veiculos.length && (
            <p className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
              Nenhum veículo encontrado.
            </p>
          )}
        </div>
      )}
      {editor && data && (
        <VeiculoDialog
          key={editor.veiculo?.id ?? "novo"}
          veiculo={editor.veiculo}
          equipes={data.equipes.filter((e) => e.ativo)}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

function VeiculoDialog({
  veiculo,
  equipes,
  onClose,
}: {
  veiculo: Veiculo | undefined;
  equipes: Equipe[];
  onClose: () => void;
}) {
  const run = useDataAction();
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [f, setF] = useState({
    placa: veiculo?.placa ?? "",
    apelido: veiculo?.apelido ?? "",
    modelo: veiculo?.modelo ?? "",
    marca: veiculo?.marca ?? "",
    equipeId: veiculo?.equipeId ?? "",
    observacao: veiculo?.observacao ?? "",
    ativo: veiculo?.ativo ?? true,
  });
  const set = (p: Partial<typeof f>) => setF((a) => ({ ...a, ...p }));

  async function salvar() {
    const erro = validarVeiculo(f);
    if (erro) {
      toast.error(erro);
      return;
    }
    setSalvando(true);
    const ok = await run(
      () =>
        operacaoRepository
          .salvarVeiculo({ ...f, placa: normalizarPlaca(f.placa) }, veiculo?.id)
          .then(() => true),
      veiculo ? "Veículo atualizado." : "Veículo cadastrado.",
    );
    setSalvando(false);
    if (ok) onClose();
  }

  async function excluir() {
    if (!veiculo) return;
    const msg = await run(() => operacaoRepository.excluirVeiculo(veiculo.id));
    if (msg) {
      toast.success(msg);
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !salvando && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{veiculo ? "Editar veículo" : "Novo veículo"}</DialogTitle>
          <DialogDescription>
            Desmarque “Ativo” para tirar o veículo das novas programações sem apagar o histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vei-placa">Placa *</Label>
            <Input
              id="vei-placa"
              autoFocus
              value={f.placa}
              onChange={(e) => set({ placa: e.target.value })}
              placeholder="ABC1D23"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vei-apelido">Nome / apelido</Label>
            <Input
              id="vei-apelido"
              value={f.apelido}
              onChange={(e) => set({ apelido: e.target.value })}
              placeholder="Ex.: Caminhão da externa"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vei-modelo">Modelo</Label>
            <Input
              id="vei-modelo"
              value={f.modelo}
              onChange={(e) => set({ modelo: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vei-marca">Marca</Label>
            <Input
              id="vei-marca"
              value={f.marca}
              onChange={(e) => set({ marca: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="vei-equipe">Equipe padrão (opcional)</Label>
            <select
              id="vei-equipe"
              className={selectClass}
              value={f.equipeId}
              onChange={(e) => set({ equipeId: e.target.value })}
            >
              <option value="">Sem equipe padrão</option>
              {equipes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome} — {e.setor}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Ao escolher este veículo, a equipe padrão é preenchida sozinha.
            </p>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="vei-observacao">Observações</Label>
            <Textarea
              id="vei-observacao"
              rows={3}
              value={f.observacao}
              onChange={(e) => set({ observacao: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={f.ativo}
              onChange={(e) => set({ ativo: e.target.checked })}
            />
            Ativo para novos lançamentos
          </label>
        </div>
        <DialogFooter className="gap-2">
          {veiculo && (
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
            Cancelar
          </Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar veículo
          </Button>
        </DialogFooter>
        <ConfirmDialog
          open={excluindo}
          onOpenChange={setExcluindo}
          title={`Excluir ${veiculo?.rotulo ?? "veículo"}?`}
          description="Se o veículo já tiver histórico, ele só é desativado e sai das listas."
          onConfirm={() => void excluir()}
        />
      </DialogContent>
    </Dialog>
  );
}
