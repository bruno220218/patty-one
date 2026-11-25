import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock3, Loader2, Pencil, Plus, Save, Truck, UsersRound } from "lucide-react";
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
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { Kpi, selectClass } from "@/components/app/operacao-ui";
import { useCurrentUser, useDataAction, useRecursosOperacao, useSetores } from "@/hooks/use-data";
import {
  abreviarNome,
  canGerirOperacao,
  capacidadeNumerica,
  operacaoRepository,
  nomesDosSetores,
  validarEquipe,
  type Equipe,
  type Recursos,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/planejamento/equipes")({
  head: () => ({
    meta: [
      { title: "Equipes de planejamento — Patty One" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EquipesPage,
});

function EquipesPage() {
  const { data, isPending, error } = useRecursosOperacao();
  const { data: me } = useCurrentUser();
  const podeGerir = canGerirOperacao(me);
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState("");
  const [editor, setEditor] = useState<{ equipe?: Equipe } | null>(null);
  const todas = data?.equipes ?? [];
  const setores = useMemo(() => [...new Set(todas.map((e) => e.setor))].sort(), [todas]);
  const equipes = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return todas.filter(
      (e) =>
        (!setor || e.setor === setor) &&
        (!termo ||
          [
            e.nome,
            e.setor,
            ...e.colaboradores.map((c) => c.nome),
            ...e.veiculos.map((v) => v.rotulo),
          ].some((v) => v.toLocaleLowerCase("pt-BR").includes(termo))),
    );
  }, [todas, busca, setor]);
  const ativas = todas.filter((e) => e.ativo);
  const capacidade = ativas.reduce((t, e) => t + e.capacidade, 0);

  return (
    <>
      <PageHeader
        title="Equipes de planejamento"
        description="Equipes por setor, com colaboradores, veículos e capacidade diária, usadas no cronograma e na programação."
        action={
          podeGerir && (
            <Button className="h-10" onClick={() => setEditor({})}>
              <Plus />
              Nova equipe
            </Button>
          )
        }
      />
      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState
          icon={UsersRound}
          title="Não foi possível abrir as equipes"
          description={error.message}
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi icon={UsersRound} label="Equipes ativas" value={ativas.length} />
            <Kpi
              icon={Clock3}
              label="Capacidade por dia"
              value={`${capacidade.toLocaleString("pt-BR")} h`}
              tom="sucesso"
            />
            <Kpi
              icon={UsersRound}
              label="Setores"
              value={new Set(ativas.map((e) => e.setor)).size}
              tom="neutro"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_240px]">
            <Input
              aria-label="Buscar equipes"
              placeholder="Buscar equipe, pessoa ou veículo…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <select
              aria-label="Filtrar setor"
              className={selectClass}
              value={setor}
              onChange={(e) => setSetor(e.target.value)}
            >
              <option value="">Todos os setores</option>
              {setores.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {!podeGerir && (
            <p className="text-sm text-muted-foreground">
              Só Gestão e PCP cadastram e alteram equipes.
            </p>
          )}
          {!equipes.length ? (
            <EmptyState
              icon={UsersRound}
              title="Nenhuma equipe encontrada"
              description={
                todas.length
                  ? "Ajuste a busca ou o setor."
                  : podeGerir
                    ? "Crie a primeira equipe para agilizar os agendamentos."
                    : "As equipes ainda não foram cadastradas."
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {equipes.map((e) => (
                <article key={e.id} className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold">{e.nome}</h2>
                        <Badge variant="outline">{e.setor}</Badge>
                        {!e.ativo && <Badge variant="secondary">Inativa</Badge>}
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock3 className="size-4" />
                        {e.capacidade.toLocaleString("pt-BR")} horas por dia
                      </p>
                    </div>
                    {podeGerir && (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Editar ${e.nome}`}
                        onClick={() => setEditor({ equipe: e })}
                      >
                        <Pencil />
                      </Button>
                    )}
                  </div>
                  <div className="mt-4 space-y-3 border-t pt-4 text-sm">
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 font-medium">
                        <UsersRound className="size-4 text-primary" />
                        {e.colaboradores.length} colaborador(es)
                      </p>
                      <p
                        title={e.colaboradores.map((c) => c.nome).join(", ")}
                        className="text-muted-foreground"
                      >
                        {e.colaboradores.map((c) => abreviarNome(c.nome)).join(", ") ||
                          "Nenhum colaborador"}
                      </p>
                    </div>
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 font-medium">
                        <Truck className="size-4 text-primary" />
                        {e.veiculos.length} veículo(s)
                      </p>
                      <p className="text-muted-foreground">
                        {e.veiculos.map((v) => v.rotulo).join(", ") || "Nenhum veículo"}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      {editor && data && (
        <EquipeDialog
          key={editor.equipe?.id ?? "nova"}
          recursos={data}
          equipe={editor.equipe}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

function EquipeDialog({
  recursos,
  equipe,
  onClose,
}: {
  recursos: Recursos;
  equipe: Equipe | undefined;
  onClose: () => void;
}) {
  const run = useDataAction();
  const { data: setoresDb } = useSetores();
  const setores = nomesDosSetores(setoresDb);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [f, setF] = useState(() => ({
    nome: equipe?.nome ?? "",
    setor: equipe?.setor ?? "",
    capacidade: String(equipe?.capacidade ?? 8),
    colaboradores: equipe?.colaboradores.map((c) => c.id) ?? [],
    veiculos: equipe?.veiculos.map((v) => v.id) ?? [],
    ativo: equipe?.ativo ?? true,
  }));
  const set = (p: Partial<typeof f>) => setF((a) => ({ ...a, ...p }));
  const colaboradores = recursos.colaboradores.filter(
    (c) => c.ativo && c.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );
  const veiculos = recursos.veiculos.filter((v) => v.ativo);

  async function salvar() {
    const erro = validarEquipe(f);
    if (erro) {
      toast.error(erro);
      return;
    }
    setSalvando(true);
    const ok = await run(
      () =>
        operacaoRepository
          .salvarEquipe({ ...f, capacidade: capacidadeNumerica(f.capacidade) }, equipe?.id)
          .then(() => true),
      equipe ? "Equipe atualizada" : "Equipe criada",
    );
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !salvando && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{equipe ? "Editar equipe" : "Nova equipe"}</DialogTitle>
          <DialogDescription>
            Defina o setor, a capacidade diária e os recursos que poderão ser agendados.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="eq-nome">Nome da equipe</Label>
            <Input
              id="eq-nome"
              value={f.nome}
              onChange={(e) => set({ nome: e.target.value })}
              placeholder="Ex.: Equipe Alfa"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-setor">Setor</Label>
            <select
              id="eq-setor"
              className={selectClass}
              value={f.setor}
              onChange={(e) => set({ setor: e.target.value })}
            >
              <option value="">Selecione</option>
              {/* A sector outside the list (old data) stays selectable. */}
              {[...setores, ...(f.setor && !setores.includes(f.setor) ? [f.setor] : [])].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-capacidade">Capacidade (horas por dia)</Label>
            <Input
              id="eq-capacidade"
              type="number"
              min="0.5"
              step="0.5"
              value={f.capacidade}
              onChange={(e) => set({ capacidade: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 self-end rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={f.ativo}
              onChange={(e) => set({ ativo: e.target.checked })}
            />
            Equipe disponível para agendamento
          </label>
        </div>
        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <UsersRound className="size-4 text-primary" />
                Colaboradores
              </h3>
              <p className="text-xs text-muted-foreground">
                {f.colaboradores.length} selecionado(s)
              </p>
            </div>
            <Input
              aria-label="Buscar colaborador da equipe"
              className="h-9 max-w-56"
              placeholder="Buscar colaborador…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border bg-muted/40 p-2 sm:grid-cols-2">
            {colaboradores.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-start gap-2 rounded-md bg-card p-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={f.colaboradores.includes(c.id)}
                  onChange={(e) =>
                    set({
                      colaboradores: e.target.checked
                        ? [...f.colaboradores, c.id]
                        : f.colaboradores.filter((id) => id !== c.id),
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
              <p className="col-span-full p-3 text-center text-sm text-muted-foreground">
                Nenhum colaborador ativo.
              </p>
            )}
          </div>
        </section>
        <section className="space-y-3 rounded-xl border p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="size-4 text-primary" />
            Veículos
          </h3>
          <div className="grid max-h-40 gap-1 overflow-y-auto rounded-lg border bg-muted/40 p-2 sm:grid-cols-2">
            {veiculos.map((v) => (
              <label
                key={v.id}
                className="flex cursor-pointer items-center gap-2 rounded-md bg-card p-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={f.veiculos.includes(v.id)}
                  onChange={(e) =>
                    set({
                      veiculos: e.target.checked
                        ? [...f.veiculos, v.id]
                        : f.veiculos.filter((id) => id !== v.id),
                    })
                  }
                />
                {v.rotulo}
              </label>
            ))}
            {!veiculos.length && (
              <p className="col-span-full p-3 text-center text-sm text-muted-foreground">
                Nenhum veículo ativo.
              </p>
            )}
          </div>
        </section>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar equipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
