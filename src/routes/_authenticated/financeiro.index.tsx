import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownCircle,
  CalendarClock,
  CalendarPlus,
  Check,
  Percent,
  Home,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ClientePicker, Kpi, TOM, selectClass } from "@/components/app/operacao-ui";
import {
  useContasPagar,
  useContasReceber,
  useContratosAluguel,
  useContratosEnergia,
  useCurrentUser,
  useDataAction,
  useEmpresas,
  usePedidosAbertos,
  usePercentuaisVendedores,
  usePontosMidia,
} from "@/hooks/use-data";
import {
  aluguelMensal,
  brl,
  CATEGORIAS_PAGAR,
  comissoesPorFavorecido,
  financeiroPagarRepository,
  parsePercentual,
  resumoPagar,
  situacaoPagar,
  SITUACOES_PAGAR,
  somarDias,
  validarPagar,
  type CategoriaPagar,
  type ContaPagar,
  type PagarForm,
  type SituacaoPagar,
  canExcluirFinanceiro,
  canFinanceiro,
  codigosMidias,
  dataBR,
  financeiroRepository,
  hojeISO,
  parseValor,
  PERIODICIDADES,
  resumoFinanceiro,
  situacaoConta,
  SITUACOES_CONTA,
  validarAluguel,
  validarConta,
  validarEnergia,
  valorParaCampo,
  type AluguelForm,
  type ContaForm,
  type ContaReceber,
  type ContratoAluguel,
  type ContratoEnergia,
  type EnergiaForm,
  type SituacaoConta,
} from "@/lib/data";
import { cn } from "@/lib/utils";

const ABAS = ["receber", "pagar", "comissoes", "aluguel", "energia"] as const;
type Aba = (typeof ABAS)[number];

export const Route = createFileRoute("/_authenticated/financeiro/")({
  validateSearch: (s: Record<string, unknown>): { aba: Aba } => ({
    aba: ABAS.includes(s["aba"] as Aba) ? (s["aba"] as Aba) : "receber",
  }),
  head: () => ({
    meta: [{ title: "Financeiro — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: FinanceiroPage,
});

const TOM_SITUACAO: Record<SituacaoConta | SituacaoPagar, string> = {
  "A vencer": TOM.aviso,
  Vencido: TOM.perigo,
  Recebido: TOM.sucesso,
  Pago: TOM.sucesso,
  Cancelado: TOM.neutro,
};
function Situacao({ s }: { s: SituacaoConta | SituacaoPagar }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TOM_SITUACAO[s],
      )}
    >
      {s}
    </span>
  );
}
const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={cn("p-3 font-medium whitespace-nowrap", right && "text-right")}>{children}</th>
);
const Campo = ({
  id,
  label,
  children,
  className,
}: {
  id?: string;
  label: string;
  children: React.ReactNode;
  className?: string | undefined;
}) => (
  <div className={cn("space-y-1.5", className)}>
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);

function FinanceiroPage() {
  const { aba } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: me, isPending } = useCurrentUser();
  const pode = canFinanceiro(me);
  const contas = useContasReceber(pode);
  const aluguel = useContratosAluguel(pode);
  const energia = useContratosEnergia(pode);
  const pagar = useContasPagar(pode);
  const hoje = hojeISO();
  const resumo = useMemo(
    () => resumoFinanceiro(contas.data ?? [], aluguel.data ?? [], hoje),
    [contas.data, aluguel.data, hoje],
  );
  const resumoP = useMemo(() => resumoPagar(pagar.data ?? [], hoje), [pagar.data, hoje]);

  if (isPending) return <CardGridSkeleton />;
  if (!pode) {
    return (
      <EmptyState
        icon={Lock}
        title="Sem acesso ao Financeiro"
        description="Só Gestão, Direção e Financeiro abrem esta tela. Peça a função na tela Equipe."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Contas a receber e a pagar, comissões, aluguel dos pontos e energia."
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Wallet} label="A receber" value={brl(resumo.aVencer)} />
        <Kpi
          icon={AlertTriangle}
          label="Vencido a receber"
          value={brl(resumo.vencido)}
          tom="perigo"
        />
        <Kpi
          icon={CalendarClock}
          label="A pagar em 30 dias"
          value={brl(resumoP.proximos30)}
          tom="aviso"
        />
        <Kpi
          icon={ArrowDownCircle}
          label="Vencido a pagar"
          value={brl(resumoP.vencido)}
          tom="perigo"
        />
      </div>
      <Tabs
        value={aba}
        onValueChange={(v) => void navigate({ search: { aba: v as Aba }, replace: true })}
      >
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="receber">Contas a receber</TabsTrigger>
          <TabsTrigger value="pagar">Contas a pagar</TabsTrigger>
          <TabsTrigger value="comissoes">Comissões</TabsTrigger>
          <TabsTrigger value="aluguel">Aluguel</TabsTrigger>
          <TabsTrigger value="energia">Energia</TabsTrigger>
        </TabsList>
        <TabsContent value="receber">
          <Receber linhas={contas.data} erro={contas.error} hoje={hoje} />
        </TabsContent>
        <TabsContent value="pagar">
          <Pagar linhas={pagar.data} erro={pagar.error} hoje={hoje} />
        </TabsContent>
        <TabsContent value="comissoes">
          <Comissoes linhas={pagar.data} erro={pagar.error} hoje={hoje} />
        </TabsContent>
        <TabsContent value="aluguel">
          <p className="pt-3 text-sm text-muted-foreground">
            Aluguel por mês: <strong>{brl(resumo.aluguelMes)}</strong> · {resumo.alugueisVencendo}{" "}
            contratos vencendo em 30 dias
          </p>
          <Aluguel linhas={aluguel.data} erro={aluguel.error} hoje={hoje} />
        </TabsContent>
        <TabsContent value="energia">
          <Energia linhas={energia.data} erro={energia.error} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Estado({ erro, vazio }: { erro: Error | null; vazio: string }) {
  return (
    <tr>
      <td colSpan={9} className="p-10 text-center text-muted-foreground">
        {erro ? erro.message : vazio}
      </td>
    </tr>
  );
}

// ---------- Contas a receber ----------

function Receber({
  linhas,
  erro,
  hoje,
}: {
  linhas: ContaReceber[] | undefined;
  erro: Error | null;
  hoje: string;
}) {
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const [filtro, setFiltro] = useState<"" | SituacaoConta>("");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ContaReceber | "nova" | null>(null);
  const [excluir, setExcluir] = useState<ContaReceber | null>(null);
  const q = busca.trim().toLowerCase();
  const vis = (linhas ?? [])
    .map((c) => ({ ...c, sit: situacaoConta(c.status, c.vencimento, hoje) }))
    .filter(
      (c) =>
        (!filtro || c.sit === filtro) &&
        (!q ||
          [c.descricao, c.clienteNome, c.empresaNome].some((v) => v.toLowerCase().includes(q))),
    );
  const total = vis.reduce((s, c) => s + c.valor, 0);

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Buscar contas"
          placeholder="Buscar descrição, cliente ou empresa…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-10 max-w-sm"
        />
        <select
          aria-label="Filtrar situação"
          className={cn(selectClass, "w-auto")}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as "" | SituacaoConta)}
        >
          <option value="">Todas as situações</option>
          {SITUACOES_CONTA.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <Button className="ml-auto h-10" onClick={() => setEditando("nova")}>
          <Plus />
          Nova conta a receber
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {vis.length} contas · {brl(total)}
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <Th>Vencimento</Th>
              <Th>Descrição</Th>
              <Th>Cliente</Th>
              <Th>Situação</Th>
              <Th right>Valor</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {!linhas ? (
              <Estado erro={erro} vazio="Carregando…" />
            ) : vis.length === 0 ? (
              <Estado erro={null} vazio="Nenhuma conta a receber." />
            ) : (
              vis.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 whitespace-nowrap">{dataBR(c.vencimento)}</td>
                  <td className="min-w-48 p-3">
                    {c.descricao}
                    {c.pedidoNumero !== null && c.vendaId && (
                      <Link
                        to="/comercial/$vendaId"
                        params={{ vendaId: c.vendaId }}
                        className="ml-2 text-xs text-primary hover:underline"
                      >
                        Pedido {c.pedidoNumero}
                      </Link>
                    )}
                    {c.empresaNome && (
                      <span className="block text-xs text-muted-foreground">{c.empresaNome}</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{c.clienteNome || "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    <Situacao s={c.sit} />
                    {c.recebidoEm && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        em {dataBR(c.recebidoEm)}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right font-medium whitespace-nowrap">{brl(c.valor)}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      {c.status === "Aberto" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void run(
                                () => financeiroRepository.mudarStatus(c.id, "Recebido"),
                                "Recebimento registrado",
                              )
                            }
                          >
                            <Check />
                            Receber
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Cancelar ${c.descricao}`}
                            title="Cancelar"
                            onClick={() =>
                              void run(
                                () => financeiroRepository.mudarStatus(c.id, "Cancelado"),
                                "Conta cancelada",
                              )
                            }
                          >
                            <X />
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Reabrir ${c.descricao}`}
                          title="Reabrir"
                          onClick={() =>
                            void run(
                              () => financeiroRepository.mudarStatus(c.id, "Aberto"),
                              "Conta reaberta",
                            )
                          }
                        >
                          <RotateCcw />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Editar ${c.descricao}`}
                        onClick={() => setEditando(c)}
                      >
                        <Pencil />
                      </Button>
                      {canExcluirFinanceiro(me) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Excluir ${c.descricao}`}
                          onClick={() => setExcluir(c)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <ContaDialog
          conta={editando === "nova" ? null : editando}
          onClose={() => setEditando(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(excluir)}
        onOpenChange={(o) => !o && setExcluir(null)}
        title="Excluir conta a receber?"
        description={`"${excluir?.descricao ?? ""}" sai do financeiro. Para só tirar da cobrança, use Cancelar.`}
        onConfirm={() => {
          const id = excluir?.id;
          setExcluir(null);
          if (id) void run(() => financeiroRepository.excluirConta(id), "Conta excluída");
        }}
      />
    </div>
  );
}

function ContaDialog({ conta, onClose }: { conta: ContaReceber | null; onClose: () => void }) {
  const run = useDataAction();
  const empresas = useEmpresas();
  const pedidos = usePedidosAbertos();
  const [f, setF] = useState<ContaForm & { vendaId: string }>({
    descricao: conta?.descricao ?? "",
    vencimento: conta?.vencimento ?? hojeISO(),
    valor: valorParaCampo(conta?.valor),
    cadastroId: conta?.cadastroId ?? "",
    cadastroNome: conta?.clienteNome ?? "",
    empresaId: conta?.empresaId ?? "",
    observacao: conta?.observacao ?? "",
    vendaId: conta?.vendaId ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<typeof f>) => setF((v) => ({ ...v, ...p }));

  async function salvar() {
    const problema = validarConta(f, parseValor(f.valor));
    setErro(problema);
    if (problema) return;
    setSalvando(true);
    const ok = await run(
      () => financeiroRepository.salvarConta(f, conta?.id).then(() => true),
      conta ? "Conta atualizada" : "Conta criada",
    );
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{conta ? "Editar conta a receber" : "Nova conta a receber"}</DialogTitle>
          <DialogDescription>Cliente, pedido e empresa são opcionais.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Cliente" className="sm:col-span-2">
            <ClientePicker
              value={f.cadastroId ? { id: f.cadastroId, nome: f.cadastroNome } : null}
              onChange={(c) => set({ cadastroId: c?.id ?? "", cadastroNome: c?.nome ?? "" })}
            />
          </Campo>
          <Campo id="cr-desc" label="Descrição" className="sm:col-span-2">
            <Input
              id="cr-desc"
              value={f.descricao}
              placeholder="Ex.: Pedido 12 — parcela 1/3"
              onChange={(e) => set({ descricao: e.target.value })}
            />
          </Campo>
          <Campo id="cr-venc" label="Vencimento">
            <Input
              id="cr-venc"
              type="date"
              value={f.vencimento}
              onChange={(e) => set({ vencimento: e.target.value })}
            />
          </Campo>
          <Campo id="cr-valor" label="Valor (R$)">
            <Input
              id="cr-valor"
              inputMode="decimal"
              placeholder="0,00"
              value={f.valor}
              onChange={(e) => set({ valor: e.target.value })}
            />
          </Campo>
          <Campo id="cr-pedido" label="Pedido">
            <select
              id="cr-pedido"
              className={selectClass}
              value={f.vendaId}
              onChange={(e) => {
                const p = pedidos.data?.find((x) => x.id === e.target.value);
                set({
                  vendaId: e.target.value,
                  ...(p && !f.cadastroId && p.cadastroId
                    ? { cadastroId: p.cadastroId, cadastroNome: p.clienteNome }
                    : {}),
                });
              }}
            >
              <option value="">Sem pedido</option>
              {f.vendaId && !pedidos.data?.some((p) => p.id === f.vendaId) && (
                <option value={f.vendaId}>Pedido {conta?.pedidoNumero ?? ""}</option>
              )}
              {(pedidos.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.numero} — {p.clienteNome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="cr-empresa" label="Empresa">
            <select
              id="cr-empresa"
              className={selectClass}
              value={f.empresaId}
              onChange={(e) => set({ empresaId: e.target.value })}
            >
              <option value="">—</option>
              {(empresas.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="cr-obs" label="Observação" className="sm:col-span-2">
            <Textarea
              id="cr-obs"
              rows={2}
              value={f.observacao}
              onChange={(e) => set({ observacao: e.target.value })}
            />
          </Campo>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Aluguel dos pontos ----------

function Aluguel({
  linhas,
  erro,
  hoje,
}: {
  linhas: ContratoAluguel[] | undefined;
  erro: Error | null;
  hoje: string;
}) {
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const pontos = usePontosMidia();
  const pontoPorCodigo = useMemo(
    () => new Map((pontos.data ?? []).filter((p) => p.codigo).map((p) => [p.codigo, p.id])),
    [pontos.data],
  );
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [editando, setEditando] = useState<ContratoAluguel | "novo" | null>(null);
  const [excluir, setExcluir] = useState<ContratoAluguel | null>(null);
  const q = busca.trim().toLowerCase();
  const vis = (linhas ?? []).filter(
    (a) =>
      (situacao === "todos" || a.ativo === (situacao === "ativos")) &&
      (!q || [a.proprietario, a.midias, a.contrato].some((v) => v.toLowerCase().includes(q))),
  );

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Buscar aluguel"
          placeholder="Buscar proprietário, ponto ou contrato…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-10 max-w-sm"
        />
        <select
          aria-label="Situação do contrato"
          className={cn(selectClass, "w-auto")}
          value={situacao}
          onChange={(e) => setSituacao(e.target.value as typeof situacao)}
        >
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
        <Button className="ml-auto h-10" onClick={() => setEditando("novo")}>
          <Plus />
          Novo contrato de aluguel
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{vis.length} contratos</p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <Th>Contrato</Th>
              <Th>Proprietário</Th>
              <Th>Pontos</Th>
              <Th>Período</Th>
              <Th>Próx. vencimento</Th>
              <Th>Vigência até</Th>
              <Th right>Valor</Th>
              <Th right>Por mês</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {!linhas ? (
              <Estado erro={erro} vazio="Carregando…" />
            ) : vis.length === 0 ? (
              <Estado erro={null} vazio="Nenhum contrato encontrado." />
            ) : (
              vis.map((a) => (
                <tr key={a.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">{a.contrato || "—"}</td>
                  <td className="min-w-44 p-3">
                    {a.proprietario}
                    {!a.ativo && (
                      <Badge variant="outline" className="ml-2">
                        Inativo
                      </Badge>
                    )}
                    {!a.validado && (
                      <span className="ml-2 text-xs text-muted-foreground">não validado</span>
                    )}
                  </td>
                  <td className="max-w-60 p-3">
                    <div className="flex flex-wrap gap-1">
                      {codigosMidias(a.midias).map((c) => {
                        const id = pontoPorCodigo.get(c);
                        return id ? (
                          <Link
                            key={c}
                            to="/midia-ooh/$pontoId"
                            params={{ pontoId: id }}
                            className="rounded border px-1.5 text-xs text-primary hover:underline"
                          >
                            {c}
                          </Link>
                        ) : (
                          <span
                            key={c}
                            className="rounded border px-1.5 text-xs text-muted-foreground"
                          >
                            {c}
                          </span>
                        );
                      })}
                      {!a.midias && "—"}
                    </div>
                  </td>
                  <td className="p-3">{a.periodicidade}</td>
                  <td
                    className={cn(
                      "p-3 whitespace-nowrap",
                      a.ativo && a.vencimento && a.vencimento < hoje && "text-destructive",
                    )}
                  >
                    {dataBR(a.vencimento) || "—"}
                  </td>
                  <td className="p-3 whitespace-nowrap">{dataBR(a.vigencia) || "—"}</td>
                  <td className="p-3 text-right font-medium whitespace-nowrap">{brl(a.valor)}</td>
                  <td className="p-3 text-right whitespace-nowrap text-muted-foreground">
                    {a.periodicidade === "Sem recorrência"
                      ? "—"
                      : brl(aluguelMensal(a.valor, a.periodicidade))}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Editar contrato de ${a.proprietario}`}
                        onClick={() => setEditando(a)}
                      >
                        <Pencil />
                      </Button>
                      {canExcluirFinanceiro(me) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Excluir contrato de ${a.proprietario}`}
                          onClick={() => setExcluir(a)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <AluguelDialog
          contrato={editando === "novo" ? null : editando}
          onClose={() => setEditando(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(excluir)}
        onOpenChange={(o) => !o && setExcluir(null)}
        title="Excluir contrato de aluguel?"
        description={`O contrato de ${excluir?.proprietario ?? ""} sai do financeiro. Para guardar o histórico, marque como inativo.`}
        onConfirm={() => {
          const id = excluir?.id;
          setExcluir(null);
          if (id) void run(() => financeiroRepository.excluirAluguel(id), "Contrato excluído");
        }}
      />
    </div>
  );
}

function AluguelDialog({
  contrato,
  onClose,
}: {
  contrato: ContratoAluguel | null;
  onClose: () => void;
}) {
  const run = useDataAction();
  const [f, setF] = useState<AluguelForm>({
    contrato: contrato?.contrato ?? "",
    proprietario: contrato?.proprietario ?? "",
    midias: contrato?.midias ?? "",
    periodicidade: contrato?.periodicidade ?? "Mensal",
    vigencia: contrato?.vigencia ?? "",
    vencimento: contrato?.vencimento ?? "",
    valor: valorParaCampo(contrato?.valor),
    ativo: contrato?.ativo ?? true,
    validado: contrato?.validado ?? false,
    observacao: contrato?.observacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<AluguelForm>) => setF((v) => ({ ...v, ...p }));

  async function salvar() {
    const problema = validarAluguel(f, parseValor(f.valor));
    setErro(problema);
    if (problema) return;
    setSalvando(true);
    const ok = await run(
      () => financeiroRepository.salvarAluguel(f, contrato?.id).then(() => true),
      contrato ? "Contrato atualizado" : "Contrato criado",
    );
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {contrato ? "Editar contrato de aluguel" : "Novo contrato de aluguel"}
          </DialogTitle>
          <DialogDescription>
            Aluguel pago ao dono do terreno ou prédio dos pontos.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="al-prop" label="Proprietário" className="sm:col-span-2">
            <Input
              id="al-prop"
              value={f.proprietario}
              onChange={(e) => set({ proprietario: e.target.value })}
            />
          </Campo>
          <Campo id="al-contrato" label="Nº do contrato">
            <Input
              id="al-contrato"
              value={f.contrato}
              onChange={(e) => set({ contrato: e.target.value })}
            />
          </Campo>
          <Campo id="al-per" label="Periodicidade">
            <select
              id="al-per"
              className={selectClass}
              value={f.periodicidade}
              onChange={(e) =>
                set({ periodicidade: e.target.value as AluguelForm["periodicidade"] })
              }
            >
              {PERIODICIDADES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Campo>
          <Campo
            id="al-midias"
            label="Pontos (códigos separados por vírgula)"
            className="sm:col-span-2"
          >
            <Input
              id="al-midias"
              placeholder="Ex.: 062, 1040, 007"
              value={f.midias}
              onChange={(e) => set({ midias: e.target.value })}
            />
          </Campo>
          <Campo id="al-valor" label="Valor (R$)">
            <Input
              id="al-valor"
              inputMode="decimal"
              placeholder="0,00"
              value={f.valor}
              onChange={(e) => set({ valor: e.target.value })}
            />
          </Campo>
          <Campo id="al-venc" label="Próximo vencimento">
            <Input
              id="al-venc"
              type="date"
              value={f.vencimento}
              onChange={(e) => set({ vencimento: e.target.value })}
            />
          </Campo>
          <Campo id="al-vig" label="Vigência até">
            <Input
              id="al-vig"
              type="date"
              value={f.vigencia}
              onChange={(e) => set({ vigencia: e.target.value })}
            />
          </Campo>
          <div className="flex items-end gap-4 pb-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.ativo}
                onChange={(e) => set({ ativo: e.target.checked })}
              />
              Ativo
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.validado}
                onChange={(e) => set({ validado: e.target.checked })}
              />
              Validado
            </label>
          </div>
          <Campo id="al-obs" label="Observação" className="sm:col-span-2">
            <Textarea
              id="al-obs"
              rows={2}
              value={f.observacao}
              onChange={(e) => set({ observacao: e.target.value })}
            />
          </Campo>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Energia ----------

function Energia({ linhas, erro }: { linhas: ContratoEnergia[] | undefined; erro: Error | null }) {
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ContratoEnergia | "novo" | null>(null);
  const [excluir, setExcluir] = useState<ContratoEnergia | null>(null);
  const q = busca.trim().toLowerCase();
  const vis = (linhas ?? []).filter(
    (e) =>
      !q ||
      [e.local, e.titular, e.numCliente, e.numInstalacao, e.unidade].some((v) =>
        v.toLowerCase().includes(q),
      ),
  );

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Buscar energia"
          placeholder="Buscar endereço, titular ou número…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-10 max-w-sm"
        />
        <Button className="ml-auto h-10" onClick={() => setEditando("novo")}>
          <Plus />
          Novo contrato de energia
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{vis.length} contratos de energia</p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <Th>
                <Zap className="inline size-3.5" /> Nº cliente
              </Th>
              <Th>Instalação</Th>
              <Th>Unidade</Th>
              <Th>Titular</Th>
              <Th>Local</Th>
              <Th>Desde</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {!linhas ? (
              <Estado erro={erro} vazio="Carregando…" />
            ) : vis.length === 0 ? (
              <Estado erro={null} vazio="Nenhum contrato de energia." />
            ) : (
              vis.map((e) => (
                <tr key={e.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-medium">{e.numCliente || "—"}</td>
                  <td className="p-3 whitespace-nowrap">{e.numInstalacao || "—"}</td>
                  <td className="p-3 whitespace-nowrap">{e.unidade || "—"}</td>
                  <td className="p-3">
                    {e.titular || "—"}
                    {!e.ativo && (
                      <Badge variant="outline" className="ml-2">
                        Inativo
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{e.local || "—"}</td>
                  <td className="p-3 whitespace-nowrap">{dataBR(e.dataInicio) || "—"}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Editar energia ${e.numCliente || e.local}`}
                        onClick={() => setEditando(e)}
                      >
                        <Pencil />
                      </Button>
                      {canExcluirFinanceiro(me) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Excluir energia ${e.numCliente || e.local}`}
                          onClick={() => setExcluir(e)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <EnergiaDialog
          contrato={editando === "novo" ? null : editando}
          onClose={() => setEditando(null)}
        />
      )}
      <ConfirmDialog
        open={Boolean(excluir)}
        onOpenChange={(o) => !o && setExcluir(null)}
        title="Excluir contrato de energia?"
        description="Para guardar o histórico, marque como inativo em vez de excluir."
        onConfirm={() => {
          const id = excluir?.id;
          setExcluir(null);
          if (id) void run(() => financeiroRepository.excluirEnergia(id), "Contrato excluído");
        }}
      />
    </div>
  );
}

function EnergiaDialog({
  contrato,
  onClose,
}: {
  contrato: ContratoEnergia | null;
  onClose: () => void;
}) {
  const run = useDataAction();
  const [f, setF] = useState<EnergiaForm>({
    numCliente: contrato?.numCliente ?? "",
    numInstalacao: contrato?.numInstalacao ?? "",
    unidade: contrato?.unidade ?? "",
    dataInicio: contrato?.dataInicio ?? "",
    titular: contrato?.titular ?? "",
    local: contrato?.local ?? "",
    ativo: contrato?.ativo ?? true,
    observacao: contrato?.observacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<EnergiaForm>) => setF((v) => ({ ...v, ...p }));

  async function salvar() {
    const problema = validarEnergia(f);
    setErro(problema);
    if (problema) return;
    setSalvando(true);
    const ok = await run(
      () => financeiroRepository.salvarEnergia(f, contrato?.id).then(() => true),
      contrato ? "Contrato atualizado" : "Contrato criado",
    );
    setSalvando(false);
    if (ok) onClose();
  }

  const campo = (
    k: keyof EnergiaForm,
    label: string,
    extra?: { type?: string; span?: boolean },
  ) => (
    <Campo id={`en-${k}`} label={label} className={extra?.span ? "sm:col-span-2" : undefined}>
      <Input
        id={`en-${k}`}
        type={extra?.type ?? "text"}
        value={f[k] as string}
        onChange={(e) => set({ [k]: e.target.value })}
      />
    </Campo>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {contrato ? "Editar contrato de energia" : "Novo contrato de energia"}
          </DialogTitle>
          <DialogDescription>Ligação de energia de um ponto ou imóvel.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("numCliente", "Nº do cliente")}
          {campo("numInstalacao", "Nº da instalação")}
          {campo("unidade", "Unidade consumidora")}
          {campo("dataInicio", "Desde", { type: "date" })}
          {campo("titular", "Titular", { span: true })}
          {campo("local", "Local", { span: true })}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.ativo}
              onChange={(e) => set({ ativo: e.target.checked })}
            />
            Ativo
          </label>
          <Campo id="en-obs" label="Observação" className="sm:col-span-2">
            <Textarea
              id="en-obs"
              rows={2}
              value={f.observacao}
              onChange={(e) => set({ observacao: e.target.value })}
            />
          </Campo>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Contas a pagar ----------

function Pagar({
  linhas,
  erro,
  hoje,
}: {
  linhas: ContaPagar[] | undefined;
  erro: Error | null;
  hoje: string;
}) {
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const [filtro, setFiltro] = useState<"" | SituacaoPagar>("");
  const [categoria, setCategoria] = useState<"" | CategoriaPagar>("");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<ContaPagar | "nova" | null>(null);
  const [excluir, setExcluir] = useState<ContaPagar | null>(null);
  const [gerar, setGerar] = useState(false);
  const q = busca.trim().toLowerCase();
  const vis = (linhas ?? [])
    .map((c) => ({ ...c, sit: situacaoPagar(c.status, c.vencimento, hoje) }))
    .filter(
      (c) =>
        (!filtro || c.sit === filtro) &&
        (!categoria || c.categoria === categoria) &&
        (!q || [c.descricao, c.favorecido, c.empresaNome].some((v) => v.toLowerCase().includes(q))),
    );
  const total = vis.reduce((s, c) => s + c.valor, 0);

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Buscar contas a pagar"
          placeholder="Buscar descrição, favorecido ou empresa…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-10 max-w-sm"
        />
        <select
          aria-label="Filtrar categoria"
          className={cn(selectClass, "w-auto")}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as "" | CategoriaPagar)}
        >
          <option value="">Todas as categorias</option>
          {CATEGORIAS_PAGAR.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar situação"
          className={cn(selectClass, "w-auto")}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as "" | SituacaoPagar)}
        >
          <option value="">Todas as situações</option>
          {SITUACOES_PAGAR.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" className="h-10" onClick={() => setGerar(true)}>
            <CalendarPlus />
            Gerar parcelas do aluguel
          </Button>
          <Button className="h-10" onClick={() => setEditando("nova")}>
            <Plus />
            Nova conta a pagar
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {vis.length} contas · {brl(total)}
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <Th>Vencimento</Th>
              <Th>Descrição</Th>
              <Th>Categoria</Th>
              <Th>Favorecido</Th>
              <Th>Situação</Th>
              <Th right>Valor</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {!linhas ? (
              <Estado erro={erro} vazio="Carregando…" />
            ) : vis.length === 0 ? (
              <Estado erro={null} vazio="Nenhuma conta a pagar." />
            ) : (
              vis.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 whitespace-nowrap">{dataBR(c.vencimento)}</td>
                  <td className="min-w-48 p-3">
                    {c.descricao}
                    {c.empresaNome && (
                      <span className="block text-xs text-muted-foreground">{c.empresaNome}</span>
                    )}
                  </td>
                  <td className="p-3">{c.categoria}</td>
                  <td className="p-3 text-muted-foreground">{c.favorecido || "—"}</td>
                  <td className="p-3 whitespace-nowrap">
                    <Situacao s={c.sit} />
                    {c.pagoEm && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        em {dataBR(c.pagoEm)}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right font-medium whitespace-nowrap">{brl(c.valor)}</td>
                  <td className="p-3">
                    <AcoesPagar
                      conta={c}
                      podeExcluir={canExcluirFinanceiro(me)}
                      onEditar={() => setEditando(c)}
                      onExcluir={() => setExcluir(c)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <PagarDialog
          conta={editando === "nova" ? null : editando}
          onClose={() => setEditando(null)}
        />
      )}
      {gerar && <GerarAluguelDialog hoje={hoje} onClose={() => setGerar(false)} />}
      <ConfirmDialog
        open={Boolean(excluir)}
        onOpenChange={(o) => !o && setExcluir(null)}
        title="Excluir conta a pagar?"
        description={`"${excluir?.descricao ?? ""}" sai do financeiro. Para só não pagar, use Cancelar.`}
        onConfirm={() => {
          const id = excluir?.id;
          setExcluir(null);
          if (id) void run(() => financeiroPagarRepository.excluir(id), "Conta excluída");
        }}
      />
    </div>
  );
}

/** Pagar / Cancelar / Reabrir, editar e excluir: same buttons in Contas a pagar and Comissões. */
function AcoesPagar({
  conta,
  podeExcluir,
  onEditar,
  onExcluir,
}: {
  conta: ContaPagar;
  podeExcluir: boolean;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const run = useDataAction();
  return (
    <div className="flex justify-end gap-1">
      {conta.status === "Aberto" ? (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void run(
                () => financeiroPagarRepository.mudarStatus(conta.id, "Pago"),
                "Pagamento registrado",
              )
            }
          >
            <Check />
            Pagar
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Cancelar ${conta.descricao}`}
            title="Cancelar"
            onClick={() =>
              void run(
                () => financeiroPagarRepository.mudarStatus(conta.id, "Cancelado"),
                "Conta cancelada",
              )
            }
          >
            <X />
          </Button>
        </>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Reabrir ${conta.descricao}`}
          title="Reabrir"
          onClick={() =>
            void run(
              () => financeiroPagarRepository.mudarStatus(conta.id, "Aberto"),
              "Conta reaberta",
            )
          }
        >
          <RotateCcw />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Editar ${conta.descricao}`}
        onClick={onEditar}
      >
        <Pencil />
      </Button>
      {podeExcluir && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Excluir ${conta.descricao}`}
          onClick={onExcluir}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

function PagarDialog({ conta, onClose }: { conta: ContaPagar | null; onClose: () => void }) {
  const run = useDataAction();
  const empresas = useEmpresas();
  const alugueis = useContratosAluguel();
  const energias = useContratosEnergia();
  const [f, setF] = useState<PagarForm>({
    categoria: conta?.categoria ?? "Fornecedor",
    descricao: conta?.descricao ?? "",
    vencimento: conta?.vencimento ?? hojeISO(),
    valor: valorParaCampo(conta?.valor),
    cadastroId: conta?.cadastroId ?? "",
    cadastroNome: conta?.cadastroNome ?? "",
    favorecido: conta && !conta.cadastroId ? conta.favorecido : "",
    empresaId: conta?.empresaId ?? "",
    contratoAluguelId: conta?.contratoAluguelId ?? "",
    contratoEnergiaId: conta?.contratoEnergiaId ?? "",
    observacao: conta?.observacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<PagarForm>) => setF((v) => ({ ...v, ...p }));
  const comissao = conta?.categoria === "Comissão";

  async function salvar() {
    const problema = validarPagar(f, parseValor(f.valor), !conta);
    setErro(problema);
    if (problema) return;
    setSalvando(true);
    const ok = await run(
      () => financeiroPagarRepository.salvar(f, conta?.id).then(() => true),
      conta ? "Conta atualizada" : "Conta criada",
    );
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{conta ? "Editar conta a pagar" : "Nova conta a pagar"}</DialogTitle>
          <DialogDescription>
            {comissao && conta?.comissaoBase != null
              ? `Comissão de ${(conta.comissaoPercentual ?? 0).toLocaleString("pt-BR")}% sobre ${brl(conta.comissaoBase)} recebidos.`
              : "Fornecedor, aluguel, energia, imposto ou outra despesa."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="cp-cat" label="Categoria">
            <select
              id="cp-cat"
              className={selectClass}
              value={f.categoria}
              disabled={comissao}
              onChange={(e) => set({ categoria: e.target.value as CategoriaPagar })}
            >
              {CATEGORIAS_PAGAR.filter((c) => comissao || c !== "Comissão").map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Campo>
          <Campo id="cp-empresa" label="Empresa">
            <select
              id="cp-empresa"
              className={selectClass}
              value={f.empresaId}
              onChange={(e) => set({ empresaId: e.target.value })}
            >
              <option value="">—</option>
              {(empresas.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          {f.categoria === "Aluguel" && (
            <Campo id="cp-aluguel" label="Contrato de aluguel" className="sm:col-span-2">
              <select
                id="cp-aluguel"
                className={selectClass}
                value={f.contratoAluguelId}
                onChange={(e) => {
                  const c = alugueis.data?.find((a) => a.id === e.target.value);
                  set({
                    contratoAluguelId: e.target.value,
                    ...(c && !f.descricao ? { descricao: `Aluguel — ${c.proprietario}` } : {}),
                    ...(c && !f.favorecido && !f.cadastroId ? { favorecido: c.proprietario } : {}),
                    ...(c && !f.valor && c.valor ? { valor: valorParaCampo(c.valor) } : {}),
                  });
                }}
              >
                <option value="">Sem contrato</option>
                {(alugueis.data ?? [])
                  .filter((a) => a.ativo || a.id === f.contratoAluguelId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.proprietario}
                      {a.contrato ? ` (contrato ${a.contrato})` : ""}
                    </option>
                  ))}
              </select>
            </Campo>
          )}
          {f.categoria === "Energia" && (
            <Campo id="cp-energia" label="Contrato de energia" className="sm:col-span-2">
              <select
                id="cp-energia"
                className={selectClass}
                value={f.contratoEnergiaId}
                onChange={(e) => {
                  const c = energias.data?.find((x) => x.id === e.target.value);
                  set({
                    contratoEnergiaId: e.target.value,
                    ...(c && !f.descricao
                      ? { descricao: `Energia — ${c.local || c.numInstalacao || c.numCliente}` }
                      : {}),
                  });
                }}
              >
                <option value="">Sem contrato</option>
                {(energias.data ?? [])
                  .filter((x) => x.ativo || x.id === f.contratoEnergiaId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {[x.numCliente, x.local].filter(Boolean).join(" — ") || x.numInstalacao}
                    </option>
                  ))}
              </select>
            </Campo>
          )}
          <Campo id="cp-desc" label="Descrição" className="sm:col-span-2">
            <Input
              id="cp-desc"
              value={f.descricao}
              onChange={(e) => set({ descricao: e.target.value })}
            />
          </Campo>
          <Campo label="Fornecedor (cadastro)" className="sm:col-span-2">
            <ClientePicker
              value={f.cadastroId ? { id: f.cadastroId, nome: f.cadastroNome } : null}
              onChange={(c) => set({ cadastroId: c?.id ?? "", cadastroNome: c?.nome ?? "" })}
            />
          </Campo>
          {!f.cadastroId && (
            <Campo id="cp-fav" label="Ou nome de quem recebe" className="sm:col-span-2">
              <Input
                id="cp-fav"
                value={f.favorecido}
                onChange={(e) => set({ favorecido: e.target.value })}
              />
            </Campo>
          )}
          <Campo id="cp-venc" label="Vencimento">
            <Input
              id="cp-venc"
              type="date"
              value={f.vencimento}
              onChange={(e) => set({ vencimento: e.target.value })}
            />
          </Campo>
          <Campo id="cp-valor" label="Valor (R$)">
            <Input
              id="cp-valor"
              inputMode="decimal"
              placeholder="0,00"
              value={f.valor}
              onChange={(e) => set({ valor: e.target.value })}
            />
          </Campo>
          <Campo id="cp-obs" label="Observação" className="sm:col-span-2">
            <Textarea
              id="cp-obs"
              rows={2}
              value={f.observacao}
              onChange={(e) => set({ observacao: e.target.value })}
            />
          </Campo>
        </div>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GerarAluguelDialog({ hoje, onClose }: { hoje: string; onClose: () => void }) {
  const run = useDataAction();
  const [ate, setAte] = useState(somarDias(hoje, 30));
  const [rodando, setRodando] = useState(false);
  async function gerar() {
    setRodando(true);
    const n = await run(() => financeiroPagarRepository.gerarParcelasAluguel(ate));
    setRodando(false);
    if (n === undefined) return;
    toast.success(
      n === 0
        ? "Nenhuma parcela nova"
        : n === 1
          ? "1 parcela de aluguel criada"
          : `${n} parcelas de aluguel criadas`,
    );
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar parcelas do aluguel</DialogTitle>
          <DialogDescription>
            Cria as contas a pagar de cada contrato ativo e recorrente com valor, do próximo
            vencimento até a data abaixo, e avança o próximo vencimento do contrato. Rodar de novo
            não duplica.
          </DialogDescription>
        </DialogHeader>
        <Campo id="ga-ate" label="Até">
          <Input id="ga-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void gerar()} disabled={rodando || !ate}>
            {rodando && <Loader2 className="animate-spin" />}
            Gerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Comissões ----------

function Comissoes({
  linhas,
  erro,
  hoje,
}: {
  linhas: ContaPagar[] | undefined;
  erro: Error | null;
  hoje: string;
}) {
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const [favorecido, setFavorecido] = useState("");
  const [filtro, setFiltro] = useState<"" | SituacaoPagar>("");
  const [editando, setEditando] = useState<ContaPagar | null>(null);
  const [excluir, setExcluir] = useState<ContaPagar | null>(null);
  const [percentuais, setPercentuais] = useState(false);
  const comissoes = useMemo(
    () => (linhas ?? []).filter((c) => c.categoria === "Comissão"),
    [linhas],
  );
  const grupos = useMemo(() => comissoesPorFavorecido(comissoes), [comissoes]);
  const vis = comissoes
    .map((c) => ({ ...c, sit: situacaoPagar(c.status, c.vencimento, hoje) }))
    .filter(
      (c) => (!favorecido || (c.favorecido || "—") === favorecido) && (!filtro || c.sit === filtro),
    );

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A comissão nasce quando uma conta a receber ligada a um pedido vira “Recebido”: a do
          vendedor (com o percentual dele) e a da agência, quando o cadastro do cliente tem comissão
          de agência ou de representante.
        </p>
        <Button variant="outline" className="ml-auto h-10" onClick={() => setPercentuais(true)}>
          <Percent />
          Percentuais dos vendedores
        </Button>
      </div>
      {grupos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {grupos.map((g) => (
            <button
              key={g.favorecido}
              type="button"
              aria-pressed={favorecido === g.favorecido}
              onClick={() => setFavorecido((v) => (v === g.favorecido ? "" : g.favorecido))}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm transition hover:bg-muted",
                favorecido === g.favorecido && "border-primary bg-primary/10",
              )}
            >
              <span className="block font-medium">{g.favorecido}</span>
              <span className="text-xs text-muted-foreground">
                a pagar {brl(g.pendente)} · pago {brl(g.pago)}
              </span>
            </button>
          ))}
        </div>
      )}
      <select
        aria-label="Filtrar situação da comissão"
        className={cn(selectClass, "w-auto")}
        value={filtro}
        onChange={(e) => setFiltro(e.target.value as "" | SituacaoPagar)}
      >
        <option value="">Todas as situações</option>
        {SITUACOES_PAGAR.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <Th>Data</Th>
              <Th>Favorecido</Th>
              <Th>Tipo</Th>
              <Th>Pedido</Th>
              <Th right>Recebido</Th>
              <Th right>%</Th>
              <Th>Situação</Th>
              <Th right>Comissão</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {!linhas ? (
              <Estado erro={erro} vazio="Carregando…" />
            ) : vis.length === 0 ? (
              <Estado erro={null} vazio="Nenhuma comissão ainda." />
            ) : (
              vis.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 whitespace-nowrap">{dataBR(c.vencimento)}</td>
                  <td className="p-3">{c.favorecido || "—"}</td>
                  <td className="p-3">{c.comissaoTipo ?? "—"}</td>
                  <td className="p-3">
                    {c.vendaId && c.pedidoNumero !== null ? (
                      <Link
                        to="/comercial/$vendaId"
                        params={{ vendaId: c.vendaId }}
                        className="text-primary hover:underline"
                      >
                        {c.pedidoNumero}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {c.comissaoBase !== null ? brl(c.comissaoBase) : "—"}
                  </td>
                  <td className="p-3 text-right">
                    {c.comissaoPercentual !== null
                      ? c.comissaoPercentual.toLocaleString("pt-BR")
                      : "—"}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <Situacao s={c.sit} />
                  </td>
                  <td className="p-3 text-right font-medium whitespace-nowrap">{brl(c.valor)}</td>
                  <td className="p-3">
                    <AcoesPagar
                      conta={c}
                      podeExcluir={canExcluirFinanceiro(me)}
                      onEditar={() => setEditando(c)}
                      onExcluir={() => setExcluir(c)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {editando && <PagarDialog conta={editando} onClose={() => setEditando(null)} />}
      {percentuais && <PercentuaisDialog onClose={() => setPercentuais(false)} />}
      <ConfirmDialog
        open={Boolean(excluir)}
        onOpenChange={(o) => !o && setExcluir(null)}
        title="Excluir comissão?"
        description="Ela só volta se o recebimento for desfeito e registrado de novo."
        onConfirm={() => {
          const id = excluir?.id;
          setExcluir(null);
          if (id) void run(() => financeiroPagarRepository.excluir(id), "Comissão excluída");
        }}
      />
    </div>
  );
}

function PercentuaisDialog({ onClose }: { onClose: () => void }) {
  const run = useDataAction();
  const { data } = usePercentuaisVendedores();
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [novo, setNovo] = useState({ vendedor: "", percentual: "" });
  const atual = new Map((data?.percentuais ?? []).map((p) => [p.vendedor.toLowerCase(), p]));
  const nomes = [
    ...(data?.percentuais ?? []).map((p) => p.vendedor),
    ...(data?.vendedores ?? []).filter((v) => !atual.has(v.toLowerCase())),
  ];
  const valor = (nome: string) =>
    edicao[nome] ?? (atual.get(nome.toLowerCase())?.percentual.toLocaleString("pt-BR") || "");

  async function salvar(nome: string, texto: string) {
    if (!texto.trim()) {
      if (atual.has(nome.toLowerCase()))
        await run(() => financeiroPagarRepository.removerPercentual(nome), "Percentual removido");
      return;
    }
    const pct = parsePercentual(texto);
    if (pct === null) {
      toast.error("Use um percentual entre 0 e 100.");
      return;
    }
    await run(() => financeiroPagarRepository.salvarPercentual(nome, pct), "Percentual salvo");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Percentuais dos vendedores</DialogTitle>
          <DialogDescription>
            Comissão do vendedor sobre cada valor recebido de um pedido dele. Vale para os próximos
            recebimentos; vazio = sem comissão.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 divide-y overflow-auto rounded-md border">
          {nomes.map((nome) => (
            <li key={nome} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1 truncate">{nome}</span>
              <Input
                aria-label={`Percentual de ${nome}`}
                inputMode="decimal"
                className="h-8 w-20 text-right"
                placeholder="—"
                value={valor(nome)}
                onChange={(e) => setEdicao((v) => ({ ...v, [nome]: e.target.value }))}
                onBlur={(e) => {
                  if (edicao[nome] !== undefined) void salvar(nome, e.target.value);
                }}
              />
              <span className="text-muted-foreground">%</span>
            </li>
          ))}
          {nomes.length === 0 && (
            <li className="px-3 py-4 text-sm text-muted-foreground">
              Nenhum vendedor nos pedidos ainda. Adicione abaixo.
            </li>
          )}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!novo.vendedor.trim()) return;
            void salvar(novo.vendedor.trim(), novo.percentual).then(() =>
              setNovo({ vendedor: "", percentual: "" }),
            );
          }}
        >
          <Input
            aria-label="Nome do vendedor"
            placeholder="Vendedor (como no pedido)"
            value={novo.vendedor}
            onChange={(e) => setNovo((v) => ({ ...v, vendedor: e.target.value }))}
          />
          <Input
            aria-label="Percentual do novo vendedor"
            inputMode="decimal"
            className="w-20"
            placeholder="%"
            value={novo.percentual}
            onChange={(e) => setNovo((v) => ({ ...v, percentual: e.target.value }))}
          />
          <Button type="submit" disabled={!novo.vendedor.trim() || !novo.percentual.trim()}>
            Adicionar
          </Button>
        </form>
        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
