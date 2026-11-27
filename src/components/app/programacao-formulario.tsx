import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Copy,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Table2,
  Trash2,
  Truck,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ImagensButton, ImagensLinks, TOM_STATUS_PROGRAMACAO } from "@/components/app/operacao-ui";
import { ProgramacaoGrid } from "@/components/app/programacao-grid";
import { ServicoDialog } from "@/components/app/servico-dialog";
import { useCurrentUser, useDataAction, useSetores } from "@/hooks/use-data";
import {
  abreviarNome,
  agruparResumo,
  dataCurtaBR,
  duplicarLinha,
  itemResumoDoServico,
  linhaDoServico,
  linhaVazia,
  nomesDosSetores,
  operacaoRepository,
  ordenarPorSetor,
  textoWhatsApp,
  type LinhaProgramacao,
  type OrdemResumo,
  type ProgramacaoDia,
  type ServicoProgramado,
} from "@/lib/data";
import { cn } from "@/lib/utils";

/** New service already filled from a production order ("Programar" in Pendências). */
export function linhaDaOrdem(o: OrdemResumo, data: string): LinhaProgramacao {
  return {
    ...linhaVazia(data),
    ordemId: o.id,
    cadastroId: o.cadastroId ?? "",
    cliente: o.clienteNome,
    servico: o.servicoNome,
    detalhamento: o.descricao,
    local: o.localInstalacao,
    pontoId: o.pontoId ?? "",
    veiculoId: o.veiculoId ?? "",
  };
}

/** The day's services as readable cards, grouped by sector. Gestão and PCP edit. */
export function ProgramacaoLista({
  dados,
  data,
  podeEditar,
  novoInicial,
  onNovoInicialUsado,
}: {
  dados: ProgramacaoDia;
  data: string;
  podeEditar: boolean;
  /** Pre-filled service to open (e.g. "Programar" an order from Pendências). */
  novoInicial?: LinhaProgramacao | null;
  onNovoInicialUsado?: () => void;
}) {
  const run = useDataAction();
  const [editando, setEditando] = useState<LinhaProgramacao | null>(null);
  const [excluir, setExcluir] = useState<ServicoProgramado | null>(null);
  const [planilha, setPlanilha] = useState(false);
  const aberto = editando ?? novoInicial ?? null;
  const { data: me } = useCurrentUser();
  const { data: setoresDb } = useSetores();
  const setores = nomesDosSetores(setoresDb);
  // People of Produção with sectors (chosen in Equipe) open on their own sectors first.
  const meusSetores = me?.setores ?? [];
  const [soMeus, setSoMeus] = useState(true);
  const filtrando = soMeus && meusSetores.length > 0;
  const itens = filtrando ? dados.itens.filter((s) => meusSetores.includes(s.setor)) : dados.itens;

  const porSetor = useMemo(() => {
    const mapa = new Map<string, ServicoProgramado[]>();
    for (const s of itens) mapa.set(s.setor, [...(mapa.get(s.setor) ?? []), s]);
    for (const lista of mapa.values())
      lista.sort((a, b) => (a.horaInicio ?? "99").localeCompare(b.horaInicio ?? "99"));
    return ordenarPorSetor(setores, [...mapa.keys()]).map((s) => [s, mapa.get(s)!] as const);
  }, [itens, setores]);

  if (planilha) {
    return (
      <div className="space-y-2">
        <Button variant="outline" size="sm" onClick={() => setPlanilha(false)}>
          <CalendarDays />
          Voltar para os cartões
        </Button>
        <ProgramacaoGrid key={data} dados={dados} data={data} podeEditar={podeEditar} />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            <b className="text-foreground">{itens.length}</b> serviço(s) neste dia
            {filtrando && ` em ${meusSetores.join(", ")}`}
          </p>
          {meusSetores.length > 0 && (
            <div className="inline-flex rounded-lg border bg-muted p-0.5 text-xs">
              {(
                [
                  [true, "Meus setores"],
                  [false, `Todos (${dados.itens.length})`],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={rotulo}
                  type="button"
                  aria-pressed={soMeus === valor}
                  onClick={() => setSoMeus(valor)}
                  className={cn(
                    "rounded-md px-3 py-1 font-medium transition",
                    soMeus === valor
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPlanilha(true)}>
            <Table2 />
            Ver como planilha
          </Button>
          {podeEditar && (
            <Button onClick={() => setEditando(linhaVazia(data))}>
              <Plus />
              Novo serviço
            </Button>
          )}
        </div>
      </div>

      {dados.itens.length > 0 && !itens.length && (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nada programado para os seus setores neste dia.{" "}
          <button type="button" className="font-medium underline" onClick={() => setSoMeus(false)}>
            Ver todos
          </button>
        </div>
      )}

      {!dados.itens.length && (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nada programado neste dia.
          {podeEditar ? " Clique em “Novo serviço” para começar." : ""}
        </div>
      )}

      {porSetor.map(([setor, lista]) => (
        <div key={setor} className="space-y-2">
          <h3 className="text-sm font-semibold">
            {setor} <span className="font-normal text-muted-foreground">({lista.length})</span>
          </h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lista.map((s) => (
              <CartaoServico
                key={s.id}
                s={s}
                podeEditar={podeEditar}
                onEditar={() => setEditando(linhaDoServico(s))}
                onDuplicar={() => setEditando(duplicarLinha(linhaDoServico(s)))}
                onExcluir={() => setExcluir(s)}
              />
            ))}
          </div>
        </div>
      ))}

      {aberto && (
        <ServicoDialog
          key={aberto.chave}
          dados={dados}
          inicial={aberto}
          onFechar={() => {
            setEditando(null);
            onNovoInicialUsado?.();
          }}
        />
      )}

      {excluir && (
        <AlertDialog open onOpenChange={(a) => !a && setExcluir(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir este serviço?</AlertDialogTitle>
              <AlertDialogDescription>
                {[excluir.cliente, excluir.servico].filter(Boolean).join(" — ")} em{" "}
                {dataCurtaBR(excluir.data)}. Os links de imagens dele também saem. Os outros dias do
                mesmo serviço continuam.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() =>
                  void run(
                    () => operacaoRepository.salvarProgramacao([], [excluir.id]),
                    "Serviço excluído.",
                  ).then(() => setExcluir(null))
                }
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}

function CartaoServico({
  s,
  podeEditar,
  onEditar,
  onDuplicar,
  onExcluir,
}: {
  s: ServicoProgramado;
  podeEditar: boolean;
  onEditar: () => void;
  onDuplicar: () => void;
  onExcluir: () => void;
}) {
  const equipe = s.equipeNome || (s.liderNome ? abreviarNome(s.liderNome) : "");
  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-l-4 bg-card p-3 shadow-sm",
        TOM_STATUS_PROGRAMACAO[s.status],
        "text-foreground",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold leading-tight">{s.cliente || "Sem cliente"}</p>
          <p className="text-sm">
            {s.servico}
            {s.produto ? ` · ${s.produto}` : ""}
            {s.quantidade !== 1 ? ` (${s.quantidade.toLocaleString("pt-BR")}x)` : ""}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium",
            TOM_STATUS_PROGRAMACAO[s.status],
          )}
        >
          {s.status}
        </span>
      </div>
      {s.detalhamento && <p className="text-xs text-muted-foreground">{s.detalhamento}</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock3 className="size-3.5" />
          {s.horaInicio
            ? `${s.horaInicio.slice(0, 5)}–${s.horaFim?.slice(0, 5) ?? ""}`
            : "Dia todo"}
        </span>
        <span className="flex items-center gap-1" title={s.ajudantes.map((a) => a.nome).join(", ")}>
          <UsersRound className="size-3.5" />
          {equipe || "Sem equipe"}
          {s.ajudantes.length ? ` +${s.ajudantes.length}` : ""}
        </span>
        <span className="flex items-center gap-1">
          <Truck className="size-3.5" />
          {s.veiculoNome || "Sem veículo"}
        </span>
        {s.ordemNumero && <span>OP nº {s.ordemNumero}</span>}
      </div>
      {s.local && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5" />
          {s.local}
        </p>
      )}
      {s.observacao && <p className="text-xs italic text-muted-foreground">💬 {s.observacao}</p>}
      {s.reagendamentos > 0 && (
        <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3" />
          Reagendado {s.reagendamentos}x · era {dataCurtaBR(s.dataOriginal)}
        </p>
      )}
      <ImagensLinks imagens={s.imagens} />
      <div className="mt-auto flex items-center justify-between gap-1 border-t pt-2">
        <div className="flex items-center">
          <ImagensButton entidade="programacao" entidadeId={s.id} quantidade={s.imagens.length} />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Enviar este serviço no WhatsApp"
            title="Enviar este serviço no WhatsApp (com os links das imagens)"
            onClick={() =>
              window.open(
                `https://wa.me/?text=${encodeURIComponent(
                  textoWhatsApp(s.data, agruparResumo([itemResumoDoServico(s)])),
                )}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            <MessageCircle />
          </Button>
        </div>
        {podeEditar && (
          <div className="flex">
            <Button variant="ghost" size="sm" onClick={onEditar}>
              <Pencil />
              Editar
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Duplicar"
              title="Duplicar"
              onClick={onDuplicar}
            >
              <Copy />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              aria-label="Excluir"
              title="Excluir"
              onClick={onExcluir}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
