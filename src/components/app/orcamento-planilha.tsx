import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  CornerUpLeft,
  FileText,
  Loader2,
  PackageSearch,
  Plus,
  Save,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProdutoPicker } from "@/components/app/estoque-produto-picker";
import { ClientePicker, selectClass } from "@/components/app/operacao-ui";
import {
  useCurrentUser,
  useDataAction,
  useEmpresas,
  useRevisoesOrcamentoPE,
} from "@/hooks/use-data";
import {
  brl,
  CAMADAS_MATERIAL,
  CAMADAS_ORCAMENTO,
  canDecidirOrcamento,
  canMontarOrcamento,
  canVender,
  CLASSE_SITUACAO_ORCAMENTO,
  formatQtd,
  lerNumero,
  NOME_SITUACAO_ORCAMENTO,
  orcamentosPERepository,
  rotuloOrcamento,
  situacaoDaLinha,
  totaisPlanilha,
  type CamadaOrcamento,
  type LinhaOrcamentoPE,
  type OrcamentoConfig,
  type OrcamentoPE,
  type ProdutoEstoque,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A planilha de Orçamento de Projetos Especiais (migration 0052), with the app's colors: each
 * layer under a black bar with yellow title, filled lines light up in yellow, red marks what
 * needs attention (stock missing, quantity without price). Projetos fills it; the Gestão closes
 * or returns it; the Comercial turns it into a proposta.
 */

type Linha = {
  key: string;
  secao: CamadaOrcamento;
  descricao: string;
  unidade: string;
  quantidade: string;
  valor: string;
  produtoId: string | null;
  custoId: string | null;
  observacao: string;
};
type Cab = {
  cliente: string;
  informacoes: string;
  endereco: string;
  responsavel: string;
  observacao: string;
};

let seq = 0;
const chave = () => `p${++seq}`;
const qtdCampo = (n: number) => (n === 0 ? "" : formatQtd(n));
const valorCampo = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const camadaDe = (s: string): CamadaOrcamento =>
  (CAMADAS_ORCAMENTO as readonly string[]).includes(s) ? (s as CamadaOrcamento) : "Outros";

const paraForm = (linhas: LinhaOrcamentoPE[]): Linha[] =>
  [...linhas]
    .sort(
      (a, b) =>
        CAMADAS_ORCAMENTO.indexOf(camadaDe(a.secao)) -
          CAMADAS_ORCAMENTO.indexOf(camadaDe(b.secao)) || a.ordem - b.ordem,
    )
    .map((l) => ({
      key: chave(),
      secao: camadaDe(l.secao),
      descricao: l.descricao,
      unidade: l.unidade,
      quantidade: qtdCampo(l.quantidade),
      valor: valorCampo(l.valorUnitario),
      produtoId: l.produtoId,
      custoId: l.custoId,
      observacao: l.observacao ?? "",
    }));

const DICA_CAMADA: Partial<Record<CamadaOrcamento, string>> = {
  "Mão de obra": "Horas de cada setor",
  Deslocamento: "Distância em km",
};

export function OrcamentoPlanilha({
  orcamento: o,
  linhas: linhasSalvas,
  produtos,
  config,
}: {
  orcamento: OrcamentoPE;
  linhas: LinhaOrcamentoPE[];
  produtos: ProdutoEstoque[];
  config: OrcamentoConfig;
}) {
  const me = useCurrentUser().data;
  const run = useDataAction();
  const revisoes = useRevisoesOrcamentoPE(o.id);
  const inicial = useMemo(() => paraForm(linhasSalvas), [linhasSalvas]);
  const [linhas, setLinhas] = useState<Linha[]>(inicial);
  const [cab, setCab] = useState<Cab>({
    cliente: o.cliente,
    informacoes: o.informacoes,
    endereco: o.endereco,
    responsavel: o.responsavel,
    observacao: o.observacao,
  });
  const [salvando, setSalvando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pedindo, setPedindo] = useState<"devolver" | "ajuste" | "proposta" | null>(null);

  const editavel =
    canMontarOrcamento(me) && (o.situacao === "em_orcamento" || o.situacao === "devolvido");
  const alterado =
    JSON.stringify({ cab, l: linhas.map(({ key: _k, ...r }) => r) }) !==
    JSON.stringify({
      cab: {
        cliente: o.cliente,
        informacoes: o.informacoes,
        endereco: o.endereco,
        responsavel: o.responsavel,
        observacao: o.observacao,
      },
      l: inicial.map(({ key: _k, ...r }) => r),
    });

  const numeros = linhas.map((l) => ({
    secao: l.secao,
    quantidade: lerNumero(l.quantidade) ?? 0,
    valorUnitario: lerNumero(l.valor) ?? 0,
  }));
  const t = totaisPlanilha(numeros, config);
  const saldo = (id: string | null) =>
    id ? (produtos.find((p) => p.id === id)?.quantidade ?? null) : null;
  const preenchidas = numeros.filter((l) => l.quantidade > 0).length;
  const semPreco = numeros.filter((l) => l.quantidade > 0 && l.valorUnitario <= 0).length;

  const setLinha = (key: string, p: Partial<Linha>) =>
    setLinhas((a) => a.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const addLinha = (secao: CamadaOrcamento) =>
    setLinhas((a) => {
      const nova: Linha = {
        key: chave(),
        secao,
        descricao: "",
        unidade: secao === "Mão de obra" ? "h" : secao === "Deslocamento" ? "km" : "un",
        quantidade: "",
        valor: "",
        produtoId: null,
        custoId: null,
        observacao: "",
      };
      const ultimo = a.map((l) => l.secao).lastIndexOf(secao);
      if (ultimo < 0) return [...a, nova];
      return [...a.slice(0, ultimo + 1), nova, ...a.slice(ultimo + 1)];
    });

  async function salvar() {
    if (linhas.some((l) => !l.descricao.trim())) {
      setSalvando(false);
      return;
    }
    setSalvando(true);
    await run(async () => {
      await orcamentosPERepository.salvar(
        o.id,
        cab,
        linhas.map((l) => ({
          secao: l.secao,
          descricao: l.descricao.trim(),
          unidade: l.unidade.trim() || "un",
          quantidade: lerNumero(l.quantidade) ?? 0,
          valorUnitario: lerNumero(l.valor) ?? 0,
          produtoId: l.produtoId,
          custoId: l.custoId,
          observacao: l.observacao.trim() || null,
        })),
      );
      return true;
    }, "Orçamento salvo");
    setSalvando(false);
  }

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setOcupado(true);
    const ok = await run(async () => {
      await fn();
      return true;
    }, msg);
    setOcupado(false);
    if (ok) {
      setPedindo(null);
      setMotivo("");
    }
  }

  const vazias = linhas.filter((l) => !l.descricao.trim()).length;
  const ultima = revisoes.data?.[0] ?? null;

  return (
    <div className="space-y-4 pb-24">
      {/* Cabeçalho */}
      <section className="overflow-hidden rounded-2xl border shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-primary px-5 py-4 text-primary-foreground">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            ORÇAMENTO DE PROJETOS ESPECIAIS
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tabular-nums">
              {rotuloOrcamento(o)}
              <span className="ml-1 text-sm font-normal opacity-80">{o.ano}</span>
            </span>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                o.situacao === "aprovado"
                  ? "bg-primary-foreground text-primary"
                  : CLASSE_SITUACAO_ORCAMENTO[o.situacao],
              )}
            >
              {NOME_SITUACAO_ORCAMENTO[o.situacao]}
              {o.revisao > 0 && ` · R${o.revisao}`}
            </span>
          </div>
        </div>
        <div className="grid gap-3 bg-card p-5 md:grid-cols-2">
          {(
            [
              ["cliente", "CLIENTE"],
              ["informacoes", "INFORMAÇÕES"],
              ["endereco", "ENDEREÇO"],
              ["responsavel", "RESPONSÁVEL PELO ORÇAMENTO"],
            ] as const
          ).map(([k, rotulo]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`cab-${k}`} className="text-xs font-bold tracking-wide">
                {rotulo}
              </Label>
              <Input
                id={`cab-${k}`}
                value={cab[k]}
                disabled={!editavel}
                className={cn(k === "cliente" && "font-semibold")}
                onChange={(e) => setCab((a) => ({ ...a, [k]: e.target.value }))}
              />
            </div>
          ))}
          {(o.briefingId || o.vendaId) && (
            <p className="flex flex-wrap gap-3 text-xs text-muted-foreground md:col-span-2">
              {o.briefingId && (
                <Link
                  to="/briefings/$briefingId"
                  params={{ briefingId: o.briefingId }}
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  Ver o briefing
                </Link>
              )}
              {o.vendaId && (
                <Link
                  to="/comercial/$vendaId"
                  params={{ vendaId: o.vendaId }}
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  Ver a proposta gerada
                </Link>
              )}
            </p>
          )}
        </div>
      </section>

      {/* Fluxo */}
      <FluxoBar
        o={o}
        alterado={alterado}
        ocupado={ocupado}
        semPreco={semPreco}
        preenchidas={preenchidas}
        motivoDevolvido={o.situacao === "devolvido" ? (ultima?.motivo ?? null) : null}
        motivoAjuste={o.situacao === "em_orcamento" ? (ultima?.ajusteMotivo ?? null) : null}
        onEnviar={() =>
          void acao(() => orcamentosPERepository.enviar(o.id), "Enviado para a Gestão")
        }
        onFechar={() =>
          void acao(
            () => orcamentosPERepository.decidir(o.id, true),
            "Orçamento fechado: o Comercial foi avisado",
          )
        }
        onPedir={setPedindo}
      />

      {pedindo === "devolver" || pedindo === "ajuste" ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <Label htmlFor="motivo">
            {pedindo === "devolver"
              ? "O que Projetos precisa revisar"
              : "O que o cliente quer ajustar"}
          </Label>
          <Textarea
            id="motivo"
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPedindo(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={ocupado || !motivo.trim()}
              onClick={() =>
                void (pedindo === "devolver"
                  ? acao(
                      () => orcamentosPERepository.decidir(o.id, false, motivo.trim()),
                      "Devolvido para Projetos",
                    )
                  : acao(
                      () => orcamentosPERepository.reabrir(o.id, motivo.trim()),
                      "Ajuste enviado para Projetos",
                    ))
              }
            >
              {pedindo === "devolver" ? "Devolver" : "Mandar para Projetos"}
            </Button>
          </div>
        </div>
      ) : null}
      {pedindo === "proposta" && (
        <GerarProposta o={o} t={t} config={config} onClose={() => setPedindo(null)} />
      )}

      {/* Camadas */}
      {CAMADAS_ORCAMENTO.map((camada, i) => {
        const daCamada = linhas.filter((l) => l.secao === camada);
        if (!daCamada.length && !editavel) return null;
        if (!daCamada.length && camada === "Outros") return null;
        const material = CAMADAS_MATERIAL.includes(camada);
        return (
          <section key={camada} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2.5 text-primary-foreground">
              <h2 className="flex items-center gap-3 text-lg font-bold tracking-wide">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary-foreground text-sm text-primary">
                  {i + 1}
                </span>
                {camada.toUpperCase()}
                {DICA_CAMADA[camada] && (
                  <span className="text-xs font-normal opacity-80">{DICA_CAMADA[camada]}</span>
                )}
              </h2>
              <span className="text-lg font-bold tabular-nums">{brl(t.porCamada[camada])}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs font-semibold tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-28 p-2">
                      {material ? "QUANT" : camada === "Deslocamento" ? "KM" : "HORAS"}
                    </th>
                    <th className="w-16 p-2">UNIT</th>
                    <th className="p-2">{material ? "MATERIAL" : "SETOR"}</th>
                    <th className="w-32 p-2 text-right">VALOR</th>
                    <th className="w-32 p-2 text-right">VALOR TOTAL</th>
                    {material && <th className="w-32 p-2">SITUAÇÃO</th>}
                    <th className="p-2">OBSERVAÇÕES</th>
                    {editavel && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {daCamada.map((l) => (
                    <LinhaPlanilhaRow
                      key={l.key}
                      l={l}
                      material={material}
                      editavel={editavel}
                      produtos={produtos}
                      saldo={saldo(l.produtoId)}
                      onChange={(p) => setLinha(l.key, p)}
                      onRemove={() => setLinhas((a) => a.filter((x) => x.key !== l.key))}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-primary bg-accent font-bold text-accent-foreground">
                    <td className="p-2" colSpan={editavel ? 2 : 2}>
                      {editavel && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          onClick={() => addLinha(camada)}
                        >
                          <Plus />
                          Linha
                        </Button>
                      )}
                    </td>
                    <td className="p-2">TOTAL</td>
                    <td />
                    <td className="p-2 text-right tabular-nums">{brl(t.porCamada[camada])}</td>
                    <td colSpan={(material ? 2 : 1) + (editavel ? 1 : 0)} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}
      {editavel && !linhas.some((l) => l.secao === "Outros") && (
        <Button variant="outline" size="sm" onClick={() => addLinha("Outros")}>
          <Plus />
          Camada “Outros”
        </Button>
      )}

      {/* Somatória e preços */}
      <section className="grid gap-4 rounded-2xl border bg-primary p-5 text-primary-foreground shadow-sm md:grid-cols-2">
        <dl className="space-y-1.5 text-sm">
          <Par rotulo="Valor MP (materiais e serviços)" valor={t.materiaPrima} />
          <Par rotulo="Valor MOD (mão de obra e deslocamento)" valor={t.maoDeObra} />
          <div className="flex justify-between gap-2 border-t border-primary-foreground/30 pt-2 text-lg font-bold">
            <dt>SOMATÓRIA FINAL</dt>
            <dd className="tabular-nums">{brl(t.custo)}</dd>
          </div>
        </dl>
        <dl className="space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-2 rounded-lg bg-primary-foreground px-3 py-2 text-primary">
            <dt className="font-semibold">
              PREÇO DE VENDA{" "}
              <span className="text-xs font-normal">(÷ {fmtFator(config.fatorVenda)})</span>
            </dt>
            <dd className="text-2xl font-bold tabular-nums">{brl(t.venda)}</dd>
          </div>
          <Par
            rotulo={`Preço com desconto (÷ ${fmtFator(config.fatorDesconto)})`}
            valor={t.desconto}
          />
          <Par
            rotulo={`Com desconto sem nota (÷ ${fmtFator(config.fatorSemNota)})`}
            valor={t.semNota}
          />
          <Par rotulo={`Entrada do serviço (${fmtFator(config.entradaPct)}%)`} valor={t.entrada} />
        </dl>
      </section>

      {(revisoes.data?.length ?? 0) > 0 && (
        <details className="rounded-2xl border bg-card p-4 text-sm shadow-sm">
          <summary className="cursor-pointer font-medium">
            Revisões ({revisoes.data?.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {revisoes.data?.map((r) => (
              <li key={r.id} className="rounded-lg border px-3 py-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    R{r.numero} · {r.enviadaPorNome || "—"} · {formatDateTime(r.enviadaEm)}
                  </span>
                  <span className="tabular-nums">
                    custo {brl(r.custo)} · venda {brl(r.venda)}
                  </span>
                </div>
                {r.decisao && (
                  <p className="text-muted-foreground">
                    {r.decisao === "aprovado" ? "Fechado" : "Devolvido"} por{" "}
                    {r.decididoPorNome ?? "—"}
                    {r.decididoEm && ` em ${formatDateTime(r.decididoEm)}`}
                    {r.motivo && `: ${r.motivo}`}
                  </p>
                )}
                {r.ajusteMotivo && (
                  <p className="text-muted-foreground">Cliente pediu ajuste: {r.ajusteMotivo}</p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Barra de salvar, sempre à vista enquanto edita */}
      {editavel && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 py-3 shadow-lg backdrop-blur md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border">
          <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
            <span className="text-muted-foreground">
              {preenchidas} {preenchidas === 1 ? "linha" : "linhas"} · custo{" "}
              <span className="font-semibold text-foreground">{brl(t.custo)}</span> · venda{" "}
              <span className="font-semibold text-foreground">{brl(t.venda)}</span>
            </span>
            {vazias > 0 && (
              <span className="text-xs text-destructive">
                {vazias} linha(s) sem material/descrição
              </span>
            )}
            <Button onClick={() => void salvar()} disabled={salvando || !alterado || vazias > 0}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />}
              {alterado ? "Salvar" : "Salvo"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const fmtFator = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

const Par = ({ rotulo, valor }: { rotulo: string; valor: number }) => (
  <div className="flex justify-between gap-2">
    <dt className="opacity-85">{rotulo}</dt>
    <dd className="font-semibold tabular-nums">{brl(valor)}</dd>
  </div>
);

function LinhaPlanilhaRow({
  l,
  material,
  editavel,
  produtos,
  saldo,
  onChange,
  onRemove,
}: {
  l: Linha;
  material: boolean;
  editavel: boolean;
  produtos: ProdutoEstoque[];
  saldo: number | null;
  onChange: (p: Partial<Linha>) => void;
  onRemove: () => void;
}) {
  const [escolhendo, setEscolhendo] = useState(false);
  const qtd = lerNumero(l.quantidade) ?? 0;
  const valor = lerNumero(l.valor) ?? 0;
  const ativa = qtd > 0;
  const semPreco = ativa && valor <= 0;
  const sit = situacaoDaLinha(qtd, saldo);
  const produto = l.produtoId ? produtos.find((p) => p.id === l.produtoId) : null;

  return (
    <tr className={cn("border-b last:border-b-0", ativa ? "bg-accent/70" : "hover:bg-muted/30")}>
      <td className="p-1.5">
        <Input
          aria-label={`Quantidade de ${l.descricao || "linha"}`}
          inputMode="decimal"
          placeholder="0"
          value={l.quantidade}
          disabled={!editavel}
          className={cn(
            "h-9 text-right text-base font-semibold tabular-nums",
            ativa && "border-primary bg-background ring-1 ring-primary",
          )}
          onChange={(e) => onChange({ quantidade: e.target.value })}
        />
      </td>
      <td className="p-1.5 text-xs text-muted-foreground uppercase">
        {editavel && !l.produtoId && !l.custoId ? (
          <Input
            aria-label="Unidade"
            value={l.unidade}
            className="h-8 px-1 text-xs"
            onChange={(e) => onChange({ unidade: e.target.value })}
          />
        ) : (
          l.unidade
        )}
      </td>
      <td className="p-1.5">
        {escolhendo ? (
          <div className="space-y-1">
            <ProdutoPicker
              produtos={produtos}
              value=""
              onChange={(id) => {
                const p = produtos.find((x) => x.id === id);
                if (p) {
                  onChange({
                    produtoId: p.id,
                    descricao: p.nome,
                    unidade: p.unidade,
                    valor: p.custo === null ? l.valor : valorCampo(p.custo),
                  });
                }
                setEscolhendo(false);
              }}
            />
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setEscolhendo(false)}
            >
              Cancelar
            </button>
          </div>
        ) : editavel && !l.custoId ? (
          <div className="flex items-center gap-1">
            <Input
              aria-label="Material"
              placeholder="Material ou serviço"
              value={l.descricao}
              className={cn(
                "h-9",
                ativa && "font-semibold",
                !l.descricao.trim() && "border-destructive",
              )}
              onChange={(e) => onChange({ descricao: e.target.value, produtoId: null })}
            />
            {material && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Escolher do estoque"
                title="Escolher do estoque"
                onClick={() => setEscolhendo(true)}
              >
                <PackageSearch />
              </Button>
            )}
          </div>
        ) : (
          <span className={cn(ativa && "font-semibold")}>{l.descricao}</span>
        )}
        {produto && (
          <span className="mt-0.5 block text-[11px] text-muted-foreground tabular-nums">
            {produto.codigo} · estoque
          </span>
        )}
      </td>
      <td className="p-1.5">
        <Input
          aria-label={`Valor de ${l.descricao || "linha"}`}
          inputMode="decimal"
          value={l.valor}
          disabled={!editavel}
          className={cn(
            "h-9 text-right tabular-nums",
            semPreco && "border-destructive ring-1 ring-destructive",
          )}
          onChange={(e) => onChange({ valor: e.target.value })}
        />
      </td>
      <td
        className={cn("p-2 text-right tabular-nums", ativa ? "font-bold" : "text-muted-foreground")}
      >
        {brl(qtd * valor)}
      </td>
      {material && (
        <td className="p-2 text-xs">
          {sit.tipo === "ok" && (
            <span className="inline-flex items-center gap-1 font-medium">
              <Check className="size-3.5" />
              em estoque
            </span>
          )}
          {sit.tipo === "comprar" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 font-semibold text-destructive">
              <AlertTriangle className="size-3.5" />
              comprar {formatQtd(sit.falta)}
            </span>
          )}
          {sit.tipo === "sem_estoque" && (
            <span className="text-muted-foreground">fora do estoque</span>
          )}
          {semPreco && <span className="block font-semibold text-destructive">sem valor</span>}
        </td>
      )}
      <td className="p-1.5">
        {editavel ? (
          <Input
            aria-label="Observação"
            value={l.observacao}
            className="h-8 text-xs"
            onChange={(e) => onChange({ observacao: e.target.value })}
          />
        ) : (
          <span className="text-xs text-muted-foreground">{l.observacao}</span>
        )}
      </td>
      {editavel && (
        <td className="p-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Tirar a linha"
            onClick={onRemove}
          >
            <X />
          </Button>
        </td>
      )}
    </tr>
  );
}

function FluxoBar({
  o,
  alterado,
  ocupado,
  semPreco,
  preenchidas,
  motivoDevolvido,
  motivoAjuste,
  onEnviar,
  onFechar,
  onPedir,
}: {
  o: OrcamentoPE;
  alterado: boolean;
  ocupado: boolean;
  semPreco: number;
  preenchidas: number;
  motivoDevolvido: string | null;
  motivoAjuste: string | null;
  onEnviar: () => void;
  onFechar: () => void;
  onPedir: (p: "devolver" | "ajuste" | "proposta") => void;
}) {
  const me = useCurrentUser().data;
  const etapa = o.situacao === "aguardando_aprovacao" ? 1 : o.situacao === "aprovado" ? 2 : 0;
  const passos = ["Projetos monta", "Gestão fecha", "Comercial envia ao cliente"];
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        {passos.map((p, i) => (
          <li
            key={p}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2",
              i === etapa &&
                "border-primary bg-status-progress font-semibold text-status-progress-foreground",
              i < etapa && "text-muted-foreground",
              i > etapa && "text-muted-foreground",
            )}
          >
            {i < etapa ? <Check className="size-4" /> : <span className="font-bold">{i + 1}</span>}
            {p}
          </li>
        ))}
      </ol>
      {motivoDevolvido && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          A Gestão devolveu: <span className="font-semibold">{motivoDevolvido}</span>
        </p>
      )}
      {motivoAjuste && (
        <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
          O cliente pediu ajuste: <span className="font-semibold">{motivoAjuste}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(o.situacao === "em_orcamento" || o.situacao === "devolvido") &&
          canMontarOrcamento(me) && (
            <>
              <Button
                disabled={ocupado || alterado || preenchidas === 0}
                title={alterado ? "Salve antes" : undefined}
                onClick={onEnviar}
              >
                <Send />
                Enviar para a Gestão
              </Button>
              {alterado && (
                <span className="text-xs text-muted-foreground">Salve antes de enviar.</span>
              )}
              {semPreco > 0 && (
                <span className="text-xs font-medium text-destructive">
                  {semPreco} linha(s) com quantidade e sem valor
                </span>
              )}
            </>
          )}
        {o.situacao === "aguardando_aprovacao" && canDecidirOrcamento(me) && (
          <>
            <Button disabled={ocupado} onClick={onFechar}>
              <Check />
              Fechar orçamento
            </Button>
            <Button variant="outline" disabled={ocupado} onClick={() => onPedir("devolver")}>
              <CornerUpLeft />
              Devolver para Projetos
            </Button>
          </>
        )}
        {o.situacao === "aguardando_aprovacao" && !canDecidirOrcamento(me) && (
          <span className="text-sm text-muted-foreground">
            Com a Gestão para aprovar preço e margem. A planilha fica travada.
          </span>
        )}
        {o.situacao === "aprovado" && canVender(me) && (
          <>
            <Button disabled={ocupado} onClick={() => onPedir("proposta")}>
              <FileText />
              {o.vendaId ? "Atualizar a proposta" : "Gerar proposta"}
            </Button>
            <Button variant="outline" disabled={ocupado} onClick={() => onPedir("ajuste")}>
              <CornerUpLeft />
              Cliente pediu ajuste
            </Button>
          </>
        )}
        {o.situacao === "aprovado" && !canVender(me) && (
          <span className="text-sm text-muted-foreground">
            Fechado pela Gestão: o Comercial gera a proposta e envia ao cliente.
          </span>
        )}
      </div>
    </section>
  );
}

function GerarProposta({
  o,
  t,
  config,
  onClose,
}: {
  o: OrcamentoPE;
  t: ReturnType<typeof totaisPlanilha>;
  config: OrcamentoConfig;
  onClose: () => void;
}) {
  const run = useDataAction();
  const empresas = useEmpresas();
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);
  const [empresaId, setEmpresaId] = useState("");
  const [preco, setPreco] = useState<"venda" | "desconto" | "sem_nota">("venda");
  const [ocupado, setOcupado] = useState(false);
  const opcoes = [
    { v: "venda" as const, nome: "Preço de venda", valor: t.venda, f: config.fatorVenda },
    { v: "desconto" as const, nome: "Com desconto", valor: t.desconto, f: config.fatorDesconto },
    {
      v: "sem_nota" as const,
      nome: "Com desconto sem nota",
      valor: t.semNota,
      f: config.fatorSemNota,
    },
  ];
  const nova = !o.vendaId;

  async function gerar() {
    setOcupado(true);
    const ok = await run(
      async () => {
        await orcamentosPERepository.gerarProposta(
          o.id,
          cliente?.id ?? null,
          empresaId || null,
          preco,
        );
        return true;
      },
      nova ? "Proposta gerada: o material entrou na previsão do estoque" : "Proposta atualizada",
    );
    setOcupado(false);
    if (ok) onClose();
  }

  return (
    <section className="space-y-3 rounded-2xl border-2 border-primary bg-card p-4 shadow-sm">
      <h2 className="font-semibold">
        {nova ? "Gerar a proposta para o cliente" : "Atualizar a proposta"}
      </h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {opcoes.map((op) => (
          <button
            key={op.v}
            type="button"
            onClick={() => setPreco(op.v)}
            className={cn(
              "rounded-xl border p-3 text-left transition",
              preco === op.v
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            <span className="block text-xs">
              {op.nome} (÷ {fmtFator(op.f)})
            </span>
            <span className="text-xl font-bold tabular-nums">{brl(op.valor)}</span>
          </button>
        ))}
      </div>
      {nova && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Cliente no cadastro {o.cliente && `(${o.cliente})`}</Label>
            <ClientePicker value={cliente} onChange={setCliente} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gp-empresa">Empresa do grupo</Label>
            <select
              id="gp-empresa"
              className={selectClass}
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
            >
              <option value="">Escolha…</option>
              {(empresas.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={ocupado}>
          Cancelar
        </Button>
        <Button
          onClick={() => void gerar()}
          disabled={ocupado || (nova && (!cliente || !empresaId))}
        >
          <FileText />
          {nova ? "Gerar proposta" : "Atualizar proposta"}
        </Button>
      </div>
    </section>
  );
}
