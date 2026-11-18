import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCheck,
  FileText,
  History,
  MonitorPlay,
  Pencil,
  Plus,
  Search,
  SearchX,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
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
import { PaineisGrade } from "@/components/app/paineis-grade";
import { EntradaAcoes } from "@/components/app/ci-entrada";
import {
  SITUACAO_FUNDO,
  SITUACAO_TEXTO,
  situacaoCurta,
  TIPO_PONTO,
  TIPO_TEXTO,
} from "@/components/app/vinheta-cores";
import {
  useCis,
  useCurrentUser,
  useDataAction,
  usePaineis,
  usePessoasDaFuncao,
} from "@/hooks/use-data";
import {
  canEditarPaineis,
  ciRepository,
  dobrar,
  localToday,
  paineisRepository,
  precisaAtencao,
  situacaoVinheta,
  VINHETA_TIPO_LABEL,
  type Ci,
  type CiPainel,
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

type Aba = "geral" | "painel" | "resumo";
type DialogState =
  | { mode: "create"; painel: Painel; posicao: number }
  | { mode: "edit"; painel: Painel; vinheta: Vinheta }
  | null;

const curta = (iso: string | null) => (iso ? formatDateOnly(iso) : "");
const periodoCi = (ci: Ci) =>
  ci.inicio || ci.fim
    ? `${ci.inicio ? formatDateOnly(ci.inicio).slice(0, 5) : "…"} a ${ci.fim ? formatDateOnly(ci.fim) : "sem fim"}`
    : "";

/** Same colors as the old "espaços vagos" e-mail: plenty, few, none. */
function vagosTone(vagos: number) {
  if (vagos > 5) return "text-status-done-foreground";
  if (vagos > 0) return "text-status-progress-foreground";
  return "text-destructive";
}

function PaineisPage() {
  const { data, isPending, error } = usePaineis();
  const { data: cis } = useCis();
  const { data: me } = useCurrentUser();
  const { data: comerciais = [] } = usePessoasDaFuncao(["comercial"], Boolean(me?.isMember));
  const podeEditar = canEditarPaineis(me);
  const run = useDataAction();
  const hoje = localToday();

  const [aba, setAba] = useState<Aba>("geral");
  const [painelId, setPainelId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [retirar, setRetirar] = useState<Vinheta | null>(null);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [entrandoCi, setEntrandoCi] = useState<string | null>(null);

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

  // Vinhetas waiting to enter (from CIs), per CI and per panel.
  const ciPendentes = useMemo(
    () => (cis ?? []).filter((c) => c.paineis.some((p) => p.status === "pendente")),
    [cis],
  );
  const pendentesPorPainel = useMemo(() => {
    const m = new Map<string, { ci: Ci; cp: CiPainel }[]>();
    for (const ci of ciPendentes)
      for (const cp of ci.paineis)
        if (cp.status === "pendente")
          m.set(cp.painelId, [...(m.get(cp.painelId) ?? []), { ci, cp }]);
    return m;
  }, [ciPendentes]);
  const pendentesCount = useMemo(
    () => new Map([...pendentesPorPainel].map(([k, v]) => [k, v.length] as const)),
    [pendentesPorPainel],
  );

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
    setAba("painel");
    setQuery("");
  };

  const darEntradaCi = async (ci: Ci) => {
    setEntrandoCi(ci.id);
    const entrou: string[] = [];
    for (const cp of ci.paineis.filter((p) => p.status === "pendente")) {
      const pos = await run(() => ciRepository.aprovar(cp.id));
      if (pos === undefined) break;
      entrou.push(`${painelPorId.get(cp.painelId)?.codigo ?? "painel"} (${pos})`);
    }
    setEntrandoCi(null);
    if (entrou.length) toast.success(`${ci.cliente} entrou em ${entrou.join(", ")}.`);
  };

  // ---------- Dense table row for one panel / search results ----------
  const linha = (v: Vinheta, mostrarPainel: boolean) => {
    const s = situacoes.get(v.id) ?? situacaoVinheta(v, hoje);
    const p = painelPorId.get(v.painelId);
    return (
      <tr key={v.id} className={cn("border-b last:border-0", SITUACAO_FUNDO[s.tipo])}>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
          {mostrarPainel && p ? `${p.codigo} · ` : ""}
          {v.posicao}
        </td>
        <td className="max-w-0 px-2 py-1.5">
          <span
            className={cn("flex items-center gap-1.5 truncate font-medium", TIPO_TEXTO[v.tipo])}
            title={v.cliente}
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TIPO_PONTO[v.tipo])} />
            <span className="truncate">{v.cliente}</span>
          </span>
          {v.observacao && (
            <span className="block truncate text-[11px] text-muted-foreground">{v.observacao}</span>
          )}
        </td>
        <td className="hidden px-2 py-1.5 text-xs text-muted-foreground md:table-cell">
          {v.tipo !== "indisponivel" ? VINHETA_TIPO_LABEL[v.tipo] : ""}
        </td>
        <td className="px-2 py-1.5 text-xs tabular-nums">{v.ci}</td>
        <td className="hidden px-2 py-1.5 text-xs tabular-nums text-muted-foreground lg:table-cell">
          {curta(v.inicio)}
        </td>
        <td className="px-2 py-1.5 text-xs tabular-nums">
          {v.fim ? curta(v.fim) : v.tipo === "indisponivel" ? "" : "sem fim"}
        </td>
        <td className={cn("whitespace-nowrap px-2 py-1.5 text-xs", SITUACAO_TEXTO[s.tipo])}>
          {situacaoCurta(s)}
        </td>
        <td className="hidden px-2 py-1.5 text-xs sm:table-cell">{v.representanteNome}</td>
        <td className="hidden px-2 py-1.5 text-[11px] tabular-nums text-muted-foreground xl:table-cell">
          {v.tipo !== "indisponivel" ? `${v.duracaoSeg}s · ${v.loop} · ${v.insercoesDia}` : ""}
        </td>
        {podeEditar && (
          <td className="px-1 py-0.5">
            {p && (
              <div className="flex justify-end">
                <IconAction
                  icon={Pencil}
                  label={`Editar ${v.cliente}`}
                  onClick={() => setDialog({ mode: "edit", painel: p, vinheta: v })}
                />
                <IconAction
                  icon={Undo2}
                  label={`Retirar ${v.cliente}`}
                  onClick={() => setRetirar(v)}
                />
              </div>
            )}
          </td>
        )}
      </tr>
    );
  };

  const cabecalho = (mostrarPainel: boolean) => (
    <thead>
      <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <th className={cn("px-2 py-2 text-right font-medium", mostrarPainel ? "w-20" : "w-10")}>
          {mostrarPainel ? "Painel" : "Nº"}
        </th>
        <th className="px-2 py-2 font-medium">Cliente</th>
        <th className="hidden w-24 px-2 py-2 font-medium md:table-cell">Tipo</th>
        <th className="w-16 px-2 py-2 font-medium">CI</th>
        <th className="hidden w-24 px-2 py-2 font-medium lg:table-cell">Início</th>
        <th className="w-24 px-2 py-2 font-medium">Fim</th>
        <th className="w-28 px-2 py-2 font-medium">Situação</th>
        <th className="hidden w-20 px-2 py-2 font-medium sm:table-cell">Repr.</th>
        <th className="hidden w-28 px-2 py-2 font-medium xl:table-cell">Exibição</th>
        {podeEditar && <th className="w-20 px-2 py-2" aria-label="Ações" />}
      </tr>
    </thead>
  );

  const doPainel = vinhetas.filter((v) => v.painelId === painel.id);
  const porPosicao = new Map(doPainel.map((v) => [v.posicao, v]));
  const vagosPainel = painel.espacos - doPainel.length;
  const entradasPainel = pendentesPorPainel.get(painel.id) ?? [];
  const totalPendentes = [...pendentesCount.values()].reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Painéis RGB"
        description="O que está rodando em cada painel, o que vai entrar e o que vence."
        action={
          <Button variant="outline" asChild className="h-10">
            <Link to="/cis">
              <FileText />
              CIs de vinheta
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{totalVagos}</span>{" "}
          <span className="text-muted-foreground">vagas de {totalEspacos}</span>
        </span>
        <button
          type="button"
          onClick={() => setAba("resumo")}
          className="text-left underline-offset-4 hover:underline"
        >
          <span
            className={cn(
              "font-semibold tabular-nums",
              vencimentos.length > 0 && "text-status-progress-foreground",
            )}
          >
            {vencimentos.length}
          </span>{" "}
          <span className="text-muted-foreground">vencendo ou vencidos</span>
        </button>
        {totalPendentes > 0 && (
          <span>
            <span className="font-semibold tabular-nums text-status-progress-foreground">
              {totalPendentes}
            </span>{" "}
            <span className="text-muted-foreground">para entrar</span>
          </span>
        )}
      </div>

      {ciPendentes.length > 0 && (
        <section className="surface-card mb-5 overflow-hidden" aria-labelledby="fila-titulo">
          <h2
            id="fila-titulo"
            className="border-b bg-status-progress/40 px-4 py-2 text-sm font-semibold"
          >
            Aguardando entrada · {ciPendentes.length} {ciPendentes.length === 1 ? "CI" : "CIs"}
          </h2>
          <ul className="divide-y divide-border">
            {ciPendentes.map((ci) => {
              const pend = ci.paineis.filter((p) => p.status === "pendente");
              return (
                <li key={ci.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2">
                  <Link
                    to="/cis/$ciId"
                    params={{ ciId: ci.id }}
                    className="text-sm font-semibold tabular-nums hover:underline"
                  >
                    CI {ci.rotulo}
                  </Link>
                  <span className={cn("min-w-0 truncate text-sm font-medium", TIPO_TEXTO[ci.tipo])}>
                    {ci.cliente}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {pend.map((cp) => (
                      <span
                        key={cp.id}
                        className="rounded bg-status-progress px-1.5 text-[11px] font-semibold text-status-progress-foreground"
                      >
                        {painelPorId.get(cp.painelId)?.codigo ?? "?"}
                      </span>
                    ))}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[periodoCi(ci), ci.representanteNome].filter(Boolean).join(" · ")}
                  </span>
                  {podeEditar && (
                    <Button
                      size="sm"
                      className="ml-auto h-8"
                      disabled={entrandoCi === ci.id}
                      onClick={() => darEntradaCi(ci)}
                    >
                      <CheckCheck />
                      Dar entrada{pend.length > 1 ? ` (${pend.length})` : ""}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList>
            <TabsTrigger value="geral">Visão geral</TabsTrigger>
            <TabsTrigger value="painel">Por painel</TabsTrigger>
            <TabsTrigger value="resumo" className="gap-1.5">
              Vencimentos
              {vencimentos.length > 0 && (
                <span className="rounded-full bg-status-progress px-1.5 text-[11px] tabular-nums text-status-progress-foreground">
                  {vencimentos.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {aba !== "resumo" && (
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente, CI ou representante…"
              aria-label="Buscar vinheta"
              className="h-9 pl-9"
            />
          </div>
        )}
      </div>

      {aba !== "resumo" && query.trim() ? (
        resultados.length === 0 ? (
          <EmptyState icon={SearchX} title="Nada encontrado" description="Ajuste a busca." />
        ) : (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              {resultados.length} {resultados.length === 1 ? "vinheta" : "vinhetas"} em{" "}
              {new Set(resultados.map((r) => r.painelId)).size} painel(is)
            </p>
            <div className="surface-card overflow-x-auto">
              <table className="w-full min-w-[36rem] table-fixed text-sm">
                {cabecalho(true)}
                <tbody>{resultados.map((v) => linha(v, true))}</tbody>
              </table>
            </div>
          </>
        )
      ) : aba === "geral" ? (
        <PaineisGrade
          paineis={paineis}
          vinhetas={vinhetas}
          situacoes={situacoes}
          pendentes={pendentesCount}
          podeEditar={podeEditar}
          onEditar={(v) => {
            const p = painelPorId.get(v.painelId);
            if (p) setDialog({ mode: "edit", painel: p, vinheta: v });
          }}
          onRetirar={setRetirar}
          onOcupar={(p, posicao) => setDialog({ mode: "create", painel: p, posicao })}
          onAbrirPainel={abrirPainel}
        />
      ) : aba === "painel" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Painel">
            {paineis.map((p) => {
              const vagos = p.espacos - (ocupacao.get(p.id) ?? 0);
              const pend = pendentesCount.get(p.id) ?? 0;
              const ativo = p.id === painel.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  onClick={() => setPainelId(p.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
                    ativo ? "border-primary bg-accent font-semibold" : "bg-card hover:bg-muted/50",
                  )}
                >
                  {p.codigo}
                  <span className={cn("text-[11px] tabular-nums", vagosTone(vagos))}>{vagos}</span>
                  {pend > 0 && (
                    <span className="rounded bg-status-progress px-1 text-[10px] font-semibold text-status-progress-foreground">
                      +{pend}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold">{painel.codigo}</span>
              <span className="text-muted-foreground">
                {" "}
                · {painel.nome.replace(/^Painel\s+/i, "")} · {doPainel.length}/{painel.espacos}{" "}
                ocupados ·{" "}
              </span>
              <span className={vagosTone(vagosPainel)}>
                {vagosPainel} {vagosPainel === 1 ? "vago" : "vagos"}
              </span>
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setHistoricoOpen(true)}
            >
              <History />
              Histórico
            </Button>
          </div>

          {entradasPainel.length > 0 && (
            <ul className="mb-3 divide-y divide-border overflow-hidden rounded-lg border border-status-progress-foreground/30 bg-status-progress/30">
              {entradasPainel.map(({ ci, cp }) => (
                <li
                  key={cp.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-status-progress-foreground">
                    Para entrar
                  </span>
                  <Link
                    to="/cis/$ciId"
                    params={{ ciId: ci.id }}
                    className="font-medium hover:underline"
                  >
                    {ci.cliente}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {[`CI ${ci.rotulo}`, periodoCi(ci), ci.representanteNome]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {podeEditar && (
                    <span className="ml-auto">
                      <EntradaAcoes cp={cp} painelCodigo={painel.codigo} compact />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="surface-card overflow-x-auto">
            <table className="w-full min-w-[36rem] table-fixed text-sm">
              {cabecalho(false)}
              <tbody>
                {Array.from({ length: painel.espacos }, (_, i) => i + 1).map((pos) => {
                  const v = porPosicao.get(pos);
                  if (v) return linha(v, false);
                  return (
                    <tr key={`vago-${pos}`} className="border-b last:border-0">
                      <td className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground">
                        {pos}
                      </td>
                      <td colSpan={podeEditar ? 9 : 8} className="px-2 py-1">
                        {podeEditar ? (
                          <button
                            type="button"
                            onClick={() => setDialog({ mode: "create", painel, posicao: pos })}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="h-3 w-3" />
                            vago · ocupar
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">vago</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!podeEditar && (
            <p className="mt-3 text-xs text-muted-foreground">
              Só Criação e Gestão alteram os painéis.
            </p>
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
                  <li
                    key={`${g.cliente}|${g.ci}|${g.fim}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
                  >
                    <span className="font-medium">{g.cliente}</span>
                    <VinhetaSituacaoPill situacao={g.situacao} />
                    <span className="text-xs text-muted-foreground">
                      {[
                        `fim ${formatDateOnly(g.fim)}`,
                        g.ci ? `CI ${g.ci}` : "",
                        g.representante || "sem representante",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className="flex flex-wrap gap-1 sm:ml-auto">
                      {g.itens
                        .map((v) => painelPorId.get(v.painelId))
                        .filter((p): p is Painel => Boolean(p))
                        .sort((a, b) => a.ordem - b.ordem)
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => abrirPainel(p.id)}
                            className="rounded-md border px-1.5 py-px text-[11px] font-semibold hover:bg-muted"
                          >
                            {p.codigo}
                          </button>
                        ))}
                    </span>
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
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
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
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => abrirPainel(p.id)}
                            className="text-left font-medium underline-offset-4 hover:underline"
                          >
                            {p.codigo} · {p.nome.replace(/^Painel\s+/i, "")}
                          </button>
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2 text-center font-semibold tabular-nums",
                            vagosTone(vagos),
                          )}
                        >
                          {String(vagos).padStart(2, "0")} de {String(p.espacos).padStart(2, "0")}
                        </td>
                        <td className={cn("px-4 py-2 text-center font-medium", vagosTone(vagos))}>
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
