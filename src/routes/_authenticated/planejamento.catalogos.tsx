import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Package, Pencil, Plus, Trash2, UsersRound, Wrench } from "lucide-react";
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
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { OpcoesListCard } from "@/components/app/opcoes-list-card";
import { useCurrentUser, useDataAction, useRecursosOperacao, useSetores } from "@/hooks/use-data";
import {
  abreviarNome,
  canGerirOperacao,
  operacaoRepository,
  setoresRepository,
  type Colaborador,
  type Produto,
  type ServicoCatalogo,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/planejamento/catalogos")({
  head: () => ({
    meta: [
      { title: "Produtos, serviços e colaboradores — Patty One" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CatalogosPage,
});

type Editor =
  | { tipo: "produto"; item?: Produto }
  | { tipo: "servico"; item?: ServicoCatalogo }
  | { tipo: "colaborador"; item?: Colaborador };

function CatalogosPage() {
  const { data, isPending, error } = useRecursosOperacao();
  const { data: me } = useCurrentUser();
  const podeGerir = canGerirOperacao(me);
  const [busca, setBusca] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const tem = (...v: string[]) =>
    !termo || v.some((x) => x.toLocaleLowerCase("pt-BR").includes(termo));
  const produtos = useMemo(() => (data?.produtos ?? []).filter((p) => tem(p.nome)), [data, termo]); // eslint-disable-line react-hooks/exhaustive-deps
  const servicos = useMemo(
    () => (data?.servicos ?? []).filter((s) => tem(s.nome, s.produto)),
    [data, termo],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const colaboradores = useMemo(
    () => (data?.colaboradores ?? []).filter((c) => tem(c.nome, c.empresa)),
    [data, termo],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader
        title="Produtos, serviços e colaboradores"
        description="As opções que aparecem na programação, nas ordens de produção e nas equipes."
        action={
          podeGerir && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-10"
                onClick={() => setEditor({ tipo: "colaborador" })}
              >
                <Plus />
                Colaborador
              </Button>
              <Button
                variant="outline"
                className="h-10"
                onClick={() => setEditor({ tipo: "produto" })}
              >
                <Plus />
                Produto
              </Button>
              <Button className="h-10" onClick={() => setEditor({ tipo: "servico" })}>
                <Plus />
                Serviço
              </Button>
            </div>
          )
        }
      />
      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState
          icon={Package}
          title="Não foi possível abrir os catálogos"
          description={error.message}
        />
      ) : (
        <div className="space-y-5">
          {!podeGerir && (
            <p className="text-sm text-muted-foreground">
              Você pode consultar. Só Gestão e PCP incluem ou alteram.
            </p>
          )}
          <Input
            aria-label="Buscar"
            placeholder="Buscar por nome, produto ou empresa…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-xl"
          />
          <div className="grid items-start gap-5 xl:grid-cols-3">
            <Lista
              icon={UsersRound}
              titulo="Colaboradores"
              resumo={`${data.colaboradores.filter((c) => c.ativo).length} ativos · ${data.colaboradores.length} no total`}
              vazio="Nenhum colaborador encontrado."
              itens={colaboradores.map((c) => ({
                id: c.id,
                nome: abreviarNome(c.nome),
                titulo: c.nome,
                detalhe: c.empresa,
                ativo: c.ativo,
                editar: () => setEditor({ tipo: "colaborador", item: c }),
              }))}
              podeGerir={podeGerir}
            />
            <Lista
              icon={Package}
              titulo="Produtos"
              resumo={`${data.produtos.filter((p) => p.ativo).length} ativos · ${data.produtos.length} no total`}
              vazio="Nenhum produto encontrado."
              itens={produtos.map((p) => ({
                id: p.id,
                nome: p.nome,
                titulo: p.nome,
                detalhe: "",
                ativo: p.ativo,
                editar: () => setEditor({ tipo: "produto", item: p }),
              }))}
              podeGerir={podeGerir}
            />
            <Lista
              icon={Wrench}
              titulo="Serviços"
              resumo={`${data.servicos.filter((s) => s.ativo).length} ativos · inclui os do SIGE`}
              vazio="Nenhum serviço encontrado."
              itens={servicos.map((s) => ({
                id: s.id,
                nome: s.nome,
                titulo: s.nome,
                detalhe: s.produto || "Sem produto associado",
                ativo: s.ativo,
                editar: () => setEditor({ tipo: "servico", item: s }),
              }))}
              podeGerir={podeGerir}
            />
          </div>
          <SetoresCard podeGerir={podeGerir} />
        </div>
      )}
      {editor && data && (
        <ItemDialog
          key={`${editor.tipo}-${editor.item?.id ?? "novo"}`}
          editor={editor}
          produtos={data.produtos}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

function Lista({
  icon: Icon,
  titulo,
  resumo,
  vazio,
  itens,
  podeGerir,
}: {
  icon: typeof Package;
  titulo: string;
  resumo: string;
  vazio: string;
  itens: {
    id: string;
    nome: string;
    titulo: string;
    detalhe: string;
    ativo: boolean;
    editar: () => void;
  }[];
  podeGerir: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-primary" />
          {titulo}
        </h2>
        <p className="text-xs text-muted-foreground">{resumo}</p>
      </div>
      <div className="max-h-[65vh] divide-y overflow-y-auto">
        {itens.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium" title={i.titulo}>
                {i.nome}
              </p>
              {(i.detalhe || !i.ativo) && (
                <p className="text-xs text-muted-foreground">
                  {i.detalhe}
                  {!i.ativo && (
                    <Badge variant="secondary" className="ml-1">
                      Inativo
                    </Badge>
                  )}
                </p>
              )}
            </div>
            {podeGerir && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Editar ${i.titulo}`}
                onClick={i.editar}
              >
                <Pencil />
              </Button>
            )}
          </div>
        ))}
        {!itens.length && <p className="p-8 text-center text-sm text-muted-foreground">{vazio}</p>}
      </div>
    </section>
  );
}

const ROTULO = { produto: "produto", servico: "serviço", colaborador: "colaborador" } as const;

function ItemDialog({
  editor,
  produtos,
  onClose,
}: {
  editor: Editor;
  produtos: Produto[];
  onClose: () => void;
}) {
  const run = useDataAction();
  const item = editor.item;
  const [nome, setNome] = useState(item?.nome ?? "");
  const [extra, setExtra] = useState(
    editor.tipo === "servico"
      ? (editor.item?.produto ?? "")
      : editor.tipo === "colaborador"
        ? (editor.item?.empresa ?? "")
        : "",
  );
  const [ativo, setAtivo] = useState(item?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const rotulo = ROTULO[editor.tipo];

  async function salvar() {
    if (!nome.trim()) {
      toast.error(`Informe o nome do ${rotulo}.`);
      return;
    }
    setSalvando(true);
    const ok = await run(
      () =>
        (editor.tipo === "produto"
          ? operacaoRepository.salvarProduto({ nome, ativo }, item?.id)
          : editor.tipo === "servico"
            ? operacaoRepository.salvarServico({ nome, produto: extra, ativo }, item?.id)
            : operacaoRepository.salvarColaborador({ nome, empresa: extra, ativo }, item?.id)
        ).then(() => true),
      item ? "Atualizado." : "Cadastrado.",
    );
    setSalvando(false);
    if (ok) onClose();
  }

  async function excluir() {
    if (!item) return;
    const msg = await run(() =>
      editor.tipo === "colaborador"
        ? operacaoRepository.excluirColaborador(item.id)
        : operacaoRepository.excluirItemCatalogo(editor.tipo, item.id),
    );
    if (msg) {
      toast.success(msg);
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !salvando && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? `Editar ${rotulo}` : `Novo ${rotulo}`}</DialogTitle>
          <DialogDescription>
            {editor.tipo === "colaborador"
              ? "Aparece nas equipes, nas ordens e na programação."
              : editor.tipo === "servico"
                ? "Fica disponível na programação e nas ordens de produção."
                : "Fica disponível para seleção na programação."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="item-nome">
              {editor.tipo === "colaborador" ? "Nome completo" : "Nome"}
            </Label>
            <Input
              id="item-nome"
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          {editor.tipo !== "produto" && (
            <div className="space-y-2">
              <Label htmlFor="item-extra">
                {editor.tipo === "servico" ? "Produto associado (opcional)" : "Empresa (opcional)"}
              </Label>
              <Input
                id="item-extra"
                list={editor.tipo === "servico" ? "catalogo-produtos" : undefined}
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
              {editor.tipo === "servico" && (
                <datalist id="catalogo-produtos">
                  {produtos
                    .filter((p) => p.ativo)
                    .map((p) => (
                      <option key={p.id} value={p.nome} />
                    ))}
                </datalist>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            Ativo para novos lançamentos
          </label>
        </div>
        <DialogFooter className="gap-2">
          {item && (
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
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
        <ConfirmDialog
          open={excluindo}
          onOpenChange={setExcluindo}
          title={`Excluir “${item?.nome ?? ""}”?`}
          description="Se já tiver sido usado, ele só é desativado e sai das listas de seleção."
          onConfirm={() => void excluir()}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Setores da Produção (Impressão, Corte, Pintura…): the sectors of the programação and the
 * teams, and where each person of Produção works (chosen in Equipe). Renaming renames them
 * everywhere; a sector in use can't be removed (database rules, migration 0031).
 */
function SetoresCard({ podeGerir }: { podeGerir: boolean }) {
  const { data: setores } = useSetores();
  const run = useDataAction();
  const [removendo, setRemovendo] = useState<{ id: string; valor: string } | null>(null);
  // Before migration 0031 there is no editable list yet.
  if (!setores) return null;
  const opcoes = setores.map((s) => ({ id: s.id, valor: s.nome }));
  return (
    <section className="max-w-xl space-y-2">
      <OpcoesListCard
        titulo="Setores da Produção"
        opcoes={opcoes}
        disabled={!podeGerir}
        onAdd={(valor) =>
          run(
            () => setoresRepository.add(valor).then(() => true),
            `Setor "${valor.trim()}" criado.`,
          )
        }
        onRename={(id, valor) =>
          run(
            () => setoresRepository.rename(id, valor).then(() => true),
            "Setor renomeado na programação e nas equipes.",
          )
        }
        onReorder={(ids) => run(() => setoresRepository.reorder(ids).then(() => true))}
        onRemove={setRemovendo}
      />
      <p className="text-xs text-muted-foreground">
        Usados na programação e nas equipes. Quem é de cada setor se define em Equipe. Renomear muda
        em todo lugar; setor em uso não pode ser removido.
      </p>
      <ConfirmDialog
        open={removendo !== null}
        onOpenChange={(open) => !open && setRemovendo(null)}
        title={`Remover o setor "${removendo?.valor ?? ""}"?`}
        description="Só dá para remover um setor que nenhum serviço da programação nem equipe usa. As pessoas desse setor deixam de estar nele."
        confirmLabel="Remover"
        onConfirm={async () => {
          const alvo = removendo;
          setRemovendo(null);
          if (alvo) await run(() => setoresRepository.remove(alvo.id), "Setor removido.");
        }}
      />
    </section>
  );
}
