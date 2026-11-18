import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { History, MonitorPlay, Pencil, Plus, Search, SearchX, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { IconAction } from "@/components/app/icon-action";
import { VinhetaDialog } from "@/components/app/vinheta-dialog";
import { VinhetaSituacaoPill } from "@/components/app/vinheta-situacao";
import { PainelHistoricoSheet } from "@/components/app/painel-historico-sheet";
import { useCurrentUser, useDataAction, usePaineis, usePessoasDaFuncao } from "@/hooks/use-data";
import {
  canEditarPaineis,
  dobrar,
  localToday,
  paineisRepository,
  precisaAtencao,
  situacaoVinheta,
  VINHETA_TIPO_LABEL,
  type Painel,
  type Vinheta,
  type VinhetaSituacao,
} from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/paineis")({
  head: () => ({
    meta: [{ title: "Painéis RGB — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: PaineisPage,
});

type Aba = "paineis" | "resumo";
type DialogState =
  | { mode: "create"; painel: Painel; posicao: number }
  | { mode: "edit"; painel: Painel; vinheta: Vinheta }
  | null;

const periodo = (v: Vinheta) => {
  if (!v.inicio && !v.fim) return "";
  const ini = v.inicio ? formatDateOnly(v.inicio) : "…";
  const fim = v.fim ? formatDateOnly(v.fim) : "sem fim";
  return `${ini} a ${fim}`;
};

const painelNome = (p: Painel) => (p.nome ? `${p.codigo} · ${p.nome}` : p.codigo);

/** Same colors as the old "espaços vagos" e-mail: plenty, few, none. */
function vagosTone(vagos: number) {
  if (vagos > 5) return "text-status-done-foreground";
  if (vagos > 0) return "text-status-progress-foreground";
  return "text-destructive";
}

function PaineisPage() {
  const { data, isPending, error } = usePaineis();
  const { data: me } = useCurrentUser();
  const { data: comerciais = [] } = usePessoasDaFuncao(["comercial"], Boolean(me?.isMember));
  const podeEditar = canEditarPaineis(me);
  const run = useDataAction();
  const hoje = localToday();

  const [aba, setAba] = useState<Aba>("paineis");
  const [painelId, setPainelId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [retirar, setRetirar] = useState<Vinheta | null>(null);
  const [historicoOpen, setHistoricoOpen] = useState(false);

  const paineis = useMemo(() => data?.paineis ?? [], [data]);
  const vinhetas = useMemo(() => data?.vinhetas ?? [], [data]);
  const painel = paineis.find((p) => p.id === painelId) ?? paineis[0];
  const painelPorId = useMemo(() => new Map(paineis.map((p) => [p.id, p])), [paineis]);

  const situacoes = useMemo(
    () => new Map(vinhetas.map((v) => [v.id, situacaoVinheta(v, hoje)] as const)),
    [vinhetas, hoje],
  );

  const ocupacao = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vinhetas) m.set(v.painelId, (m.get(v.painelId) ?? 0) + 1);
    return m;
  }, [vinhetas]);

  const totalEspacos = paineis.reduce((n, p) => n + p.espacos, 0);
  const totalVagos = totalEspacos - vinhetas.length;

  // Due dates grouped like the e-mail: same client + CI + end date = one line, with every panel.
  const vencimentos = useMemo(() => {
    const grupos = new Map<
      string,
      {
        cliente: string;
        ci: string;
        fim: string;
        representante: string;
        situacao: VinhetaSituacao;
        itens: Vinheta[];
      }
    >();
    for (const v of vinhetas) {
      const s = situacoes.get(v.id);
      if (!s || !precisaAtencao(s) || !v.fim) continue;
      const chave = `${dobrar(v.cliente).replace(/\s+/g, "")}|${v.ci.toLowerCase()}|${v.fim}`;
      const g = grupos.get(chave);
      if (g) g.itens.push(v);
      else
        grupos.set(chave, {
          cliente: v.cliente,
          ci: v.ci,
          fim: v.fim,
          representante: v.representanteNome,
          situacao: s,
          itens: [v],
        });
    }
    return [...grupos.values()].sort((a, b) => a.fim.localeCompare(b.fim));
  }, [vinhetas, situacoes]);

  const atencaoCount = vencimentos.length;

  const representantes = useMemo(() => {
    const nomes = new Set<string>();
    for (const v of vinhetas) if (v.representanteNome) nomes.add(v.representanteNome);
    for (const p of comerciais) nomes.add(p.nome);
    return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [vinhetas, comerciais]);

  const resultados = useMemo(() => {
    const q = dobrar(query.trim());
    if (!q) return [];
    return vinhetas
      .filter((v) => dobrar(`${v.cliente} ${v.ci} ${v.representanteNome}`).includes(q))
      .sort(
        (a, b) =>
          (painelPorId.get(a.painelId)?.ordem ?? 0) - (painelPorId.get(b.painelId)?.ordem ?? 0) ||
          a.posicao - b.posicao,
      );
  }, [query, vinhetas, painelPorId]);

  if (isPending) return <CardGridSkeleton />;
  if (error) {
    return (
      <EmptyState icon={SearchX} title="Não foi possível carregar" description={error.message} />
    );
  }
  if (data === null) {
    return (
      <EmptyState
        icon={MonitorPlay}
        title="Painéis RGB ainda não ativados"
        description="Falta rodar a atualização do banco (migrações 0011 e 0012)."
      />
    );
  }
  if (!painel) {
    return (
      <EmptyState
        icon={MonitorPlay}
        title="Nenhum painel cadastrado"
        description="Os painéis entram com a atualização do banco."
      />
    );
  }

  const abrirPainel = (id: string) => {
    setPainelId(id);
    setAba("paineis");
    setQuery("");
  };

  const linhaVinheta = (v: Vinheta, mostrarPainel: boolean) => {
    const s = situacoes.get(v.id) ?? situacaoVinheta(v, hoje);
    const p = painelPorId.get(v.painelId);
    const detalhes = [
      mostrarPainel && p ? p.codigo : "",
      v.tipo !== "indisponivel" ? VINHETA_TIPO_LABEL[v.tipo] : "",
      v.ci ? `CI ${v.ci}` : "",
      periodo(v),
      v.representanteNome,
      v.tipo !== "indisponivel" ? `${v.duracaoSeg}s · ${v.loop} · ${v.insercoesDia}/dia` : "",
    ].filter(Boolean);
    return (
      <li
        key={v.id}
        className={cn(
          "flex items-start gap-3 px-4 py-3",
          s.tipo === "indisponivel" && "bg-muted/40",
        )}
        title={`Última alteração: ${v.updatedByNome || "—"}`}
      >
        <span className="mt-0.5 w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground">
          {v.posicao}º
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                "min-w-0 break-words font-medium",
                s.tipo === "indisponivel" && "text-muted-foreground",
              )}
            >
              {v.cliente}
            </span>
            <VinhetaSituacaoPill situacao={s} />
          </div>
          {detalhes.length > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">{detalhes.join(" · ")}</p>
          )}
          {v.observacao && <p className="mt-0.5 text-xs text-muted-foreground">{v.observacao}</p>}
        </div>
        {podeEditar && p && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconAction
              icon={Pencil}
              label={`Editar ${v.cliente}`}
              onClick={() => setDialog({ mode: "edit", painel: p, vinheta: v })}
            />
            <IconAction icon={Undo2} label={`Retirar ${v.cliente}`} onClick={() => setRetirar(v)} />
          </div>
        )}
      </li>
    );
  };

  const doPainel = vinhetas.filter((v) => v.painelId === painel.id);
  const porPosicao = new Map(doPainel.map((v) => [v.posicao, v]));
  const vagosPainel = painel.espacos - doPainel.length;

  return (
    <>
      <PageHeader
        title="Painéis RGB"
        description="O que está rodando em cada painel, quem vendeu e quando vence."
      />

      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{totalVagos}</span>{" "}
          <span className="text-muted-foreground">espaços vagos de {totalEspacos}</span>
        </span>
        <button
          type="button"
          onClick={() => setAba("resumo")}
          className="text-left underline-offset-4 hover:underline"
        >
          <span
            className={cn(
              "font-semibold tabular-nums",
              atencaoCount > 0 && "text-status-progress-foreground",
            )}
          >
            {atencaoCount}
          </span>{" "}
          <span className="text-muted-foreground">
            {atencaoCount === 1 ? "contrato vencendo ou vencido" : "contratos vencendo ou vencidos"}
          </span>
        </button>
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="mb-4">
        <TabsList>
          <TabsTrigger value="paineis">Painéis</TabsTrigger>
          <TabsTrigger value="resumo" className="gap-1.5">
            Vencimentos e vagas
            {atencaoCount > 0 && (
              <span className="rounded-full bg-status-progress px-1.5 text-[11px] tabular-nums text-status-progress-foreground">
                {atencaoCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {aba === "paineis" ? (
        <>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente, CI ou representante em todos os painéis…"
              aria-label="Buscar vinheta"
              className="h-9 pl-9"
            />
          </div>

          {query.trim() ? (
            resultados.length === 0 ? (
              <EmptyState icon={SearchX} title="Nada encontrado" description="Ajuste a busca." />
            ) : (
              <>
                <p className="mb-2 text-sm text-muted-foreground">
                  {resultados.length} {resultados.length === 1 ? "vinheta" : "vinhetas"} em{" "}
                  {new Set(resultados.map((r) => r.painelId)).size} painel(is)
                </p>
                <ul className="surface-card divide-y divide-border overflow-hidden">
                  {resultados.map((v) => linhaVinheta(v, true))}
                </ul>
              </>
            )
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Painel">
                {paineis.map((p) => {
                  const vagos = p.espacos - (ocupacao.get(p.id) ?? 0);
                  const ativo = p.id === painel.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-selected={ativo}
                      onClick={() => setPainelId(p.id)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors",
                        ativo
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-border bg-card hover:bg-muted/50",
                      )}
                    >
                      <span className="text-sm font-semibold">{p.codigo}</span>
                      <span className={cn("text-xs tabular-nums", vagosTone(vagos))}>
                        {vagos === 0 ? "sem vaga" : `${vagos} ${vagos === 1 ? "vaga" : "vagas"}`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">{painelNome(painel)}</h2>
                  <p className="text-xs text-muted-foreground">
                    {painel.espacos} espaços · {doPainel.length} ocupados ·{" "}
                    <span className={vagosTone(vagosPainel)}>
                      {vagosPainel} {vagosPainel === 1 ? "vago" : "vagos"}
                    </span>
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setHistoricoOpen(true)}>
                  <History />
                  Histórico
                </Button>
              </div>

              <ul className="surface-card divide-y divide-border overflow-hidden">
                {Array.from({ length: painel.espacos }, (_, i) => i + 1).map((pos) => {
                  const v = porPosicao.get(pos);
                  if (v) return linhaVinheta(v, false);
                  return (
                    <li key={`vago-${pos}`} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground">
                        {pos}º
                      </span>
                      <span className="flex-1 text-sm text-muted-foreground">Vago</span>
                      {podeEditar && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => setDialog({ mode: "create", painel, posicao: pos })}
                        >
                          <Plus />
                          Ocupar
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!podeEditar && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Só Criação e Gestão alteram os painéis.
                </p>
              )}
            </>
          )}
        </>
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="venc-titulo">
            <h2 id="venc-titulo" className="mb-1 text-base font-semibold">
              Vencimentos
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Vencem nos próximos 7 dias ou já venceram. O representante recebe o aviso no sino; o
              e-mail da planilha continua igual.
            </p>
            {vencimentos.length === 0 ? (
              <p className="surface-card px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhum contrato vencendo nos próximos 7 dias.
              </p>
            ) : (
              <ul className="surface-card divide-y divide-border overflow-hidden">
                {vencimentos.map((g) => (
                  <li key={`${g.cliente}|${g.ci}|${g.fim}`} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{g.cliente}</span>
                      <VinhetaSituacaoPill situacao={g.situacao} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        `fim ${formatDateOnly(g.fim)}`,
                        g.ci ? `CI ${g.ci}` : "",
                        g.representante || "sem representante",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {g.itens
                        .map((v) => painelPorId.get(v.painelId))
                        .filter((p): p is Painel => Boolean(p))
                        .sort((a, b) => a.ordem - b.ordem)
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => abrirPainel(p.id)}
                            className="rounded-md border px-2 py-0.5 text-xs font-medium hover:bg-muted"
                          >
                            {p.codigo}
                          </button>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="vagas-titulo">
            <h2 id="vagas-titulo" className="mb-3 text-base font-semibold">
              Espaços vagos por painel
            </h2>
            <div className="surface-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Painel</th>
                    <th className="px-4 py-2 text-center font-medium">Vagos</th>
                    <th className="px-4 py-2 text-center font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paineis.map((p) => {
                    const vagos = p.espacos - (ocupacao.get(p.id) ?? 0);
                    return (
                      <tr key={p.id}>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => abrirPainel(p.id)}
                            className="text-left font-medium underline-offset-4 hover:underline"
                          >
                            {painelNome(p)}
                          </button>
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2.5 text-center font-semibold tabular-nums",
                            vagosTone(vagos),
                          )}
                        >
                          {String(vagos).padStart(2, "0")} de {String(p.espacos).padStart(2, "0")}
                        </td>
                        <td className={cn("px-4 py-2.5 text-center font-medium", vagosTone(vagos))}>
                          {vagos === 0 ? "Indisponível" : "Disponível"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <PainelHistoricoSheet painel={painel} open={historicoOpen} onOpenChange={setHistoricoOpen} />

      {dialog?.mode === "create" && (
        <VinhetaDialog
          mode="create"
          open
          onOpenChange={(o) => !o && setDialog(null)}
          painel={dialog.painel}
          paineis={paineis}
          vinhetas={vinhetas}
          representantes={representantes}
          posicao={dialog.posicao}
          onSubmit={(input, extras) =>
            run(
              () => paineisRepository.criar(dialog.painel.id, input, extras).then(() => true),
              extras.length > 0
                ? `Vinheta colocada em ${extras.length + 1} painéis.`
                : "Vinheta colocada no painel.",
            )
          }
        />
      )}
      {dialog?.mode === "edit" && (
        <VinhetaDialog
          mode="edit"
          open
          onOpenChange={(o) => !o && setDialog(null)}
          painel={dialog.painel}
          paineis={paineis}
          vinhetas={vinhetas}
          representantes={representantes}
          vinheta={dialog.vinheta}
          onSubmit={(input) =>
            run(
              () => paineisRepository.atualizar(dialog.vinheta.id, input).then(() => true),
              "Vinheta salva.",
            )
          }
        />
      )}

      <ConfirmDialog
        open={retirar !== null}
        onOpenChange={(o) => !o && setRetirar(null)}
        title="Retirar do painel?"
        description={
          retirar
            ? `"${retirar.cliente}" sai do ${painelPorId.get(retirar.painelId)?.codigo ?? "painel"} (espaço ${retirar.posicao}) e o espaço fica vago. Fica registrado no histórico.`
            : ""
        }
        confirmLabel="Retirar"
        onConfirm={() => {
          const v = retirar;
          setRetirar(null);
          if (v) void run(() => paineisRepository.retirar(v.id), "Vinheta retirada.");
        }}
      />
    </>
  );
}
