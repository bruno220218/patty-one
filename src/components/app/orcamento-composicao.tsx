import { useMemo, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProdutoPicker } from "@/components/app/estoque-produto-picker";
import { selectClass } from "@/components/app/operacao-ui";
import { useDataAction } from "@/hooks/use-data";
import {
  brl,
  calcularComposicao,
  composicaoDoItem,
  formatQtd,
  lerNumero,
  orcamentoRepository,
  SECOES_ORCAMENTO,
  secaoDe,
  type Composicao,
  type CustoItem,
  type CustoOrcamento,
  type MaterialItem,
  type OrcamentoConfig,
  type ProdutoEstoque,
  type SecaoOrcamento,
} from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Composição de custo de um item (migration 0050), como a planilha "modelo orçamento": materiais
 * do estoque e serviços por seção, mão de obra por setor (horas) e deslocamento (km); o custo
 * vira preço de venda, com desconto e sem nota pelos fatores da Gestão. ResumoComposicao mostra;
 * EditorComposicao edita (Projetos, Estoque, Gestão, Direção).
 */

const grupoDe = (custos: CustoOrcamento[], id: string | null) =>
  custos.find((c) => c.id === id)?.grupo ?? null;

export function ResumoComposicao({
  materiais,
  outros,
  catalogo,
  config,
  podeAplicar,
  onAplicar,
}: {
  materiais: MaterialItem[];
  outros: CustoItem[];
  catalogo: CustoOrcamento[];
  config: OrcamentoConfig;
  podeAplicar: boolean;
  onAplicar: (valor: number) => void;
}) {
  const c = composicaoDoItem(materiais, outros, catalogo, config);
  const mod = outros.filter((o) => {
    const g = grupoDe(catalogo, o.custoId);
    return g === "Mão de obra" || g === "Deslocamento";
  });
  return (
    <div className="space-y-3">
      {SECOES_ORCAMENTO.map((s) => {
        const mats = materiais.filter((m) => secaoDe(m.secao) === s);
        const servs = outros.filter((o) => !mod.includes(o) && secaoDe(o.secao) === s);
        if (!mats.length && !servs.length) return null;
        return (
          <TabelaSecao key={s} titulo={s} subtotal={c.porSecao[s]}>
            {mats.map((m) => (
              <LinhaResumo
                key={m.id}
                nome={`${m.codigo} · ${m.produto}`}
                quantidade={m.quantidade}
                unidade={m.unidade}
                valor={m.valorUnitario}
              />
            ))}
            {servs.map((o) => (
              <LinhaResumo
                key={o.id}
                nome={o.descricao}
                quantidade={o.quantidade}
                unidade={o.unidade}
                valor={o.valorUnitario}
              />
            ))}
          </TabelaSecao>
        );
      })}
      {mod.length > 0 && (
        <TabelaSecao titulo="Mão de obra e deslocamento" subtotal={c.maoDeObra + c.deslocamento}>
          {mod.map((o) => (
            <LinhaResumo
              key={o.id}
              nome={o.descricao}
              quantidade={o.quantidade}
              unidade={o.unidade}
              valor={o.valorUnitario}
            />
          ))}
        </TabelaSecao>
      )}
      <Totais c={c} config={config} podeAplicar={podeAplicar} onAplicar={onAplicar} />
    </div>
  );
}

function TabelaSecao({
  titulo,
  subtotal,
  children,
}: {
  titulo: string;
  subtotal: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="p-2 font-semibold text-foreground">{titulo}</th>
            <th className="p-2 text-right font-medium">Qtd.</th>
            <th className="p-2 text-right font-medium">Valor</th>
            <th className="p-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
        <tfoot>
          <tr className="border-t font-medium">
            <td className="p-2" colSpan={3}>
              Total
            </td>
            <td className="p-2 text-right tabular-nums">{brl(subtotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function LinhaResumo({
  nome,
  quantidade,
  unidade,
  valor,
}: {
  nome: string;
  quantidade: number;
  unidade: string;
  valor: number | null;
}) {
  return (
    <tr className="border-t">
      <td className="p-2">{nome}</td>
      <td className="p-2 text-right whitespace-nowrap tabular-nums">
        {formatQtd(quantidade)} {unidade}
      </td>
      <td className="p-2 text-right tabular-nums">{valor === null ? "—" : brl(valor)}</td>
      <td className="p-2 text-right tabular-nums">{brl(quantidade * (valor ?? 0))}</td>
    </tr>
  );
}

function Totais({
  c,
  config,
  podeAplicar,
  onAplicar,
}: {
  c: Composicao;
  config: OrcamentoConfig;
  podeAplicar: boolean;
  onAplicar?: (valor: number) => void;
}) {
  const fator = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  const precos = [
    { nome: "Preço de venda", valor: c.venda, fator: config.fatorVenda },
    { nome: "Com desconto", valor: c.desconto, fator: config.fatorDesconto },
    { nome: "Com desconto sem nota", valor: c.semNota, fator: config.fatorSemNota },
  ];
  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3 text-sm md:grid-cols-2">
      <dl className="space-y-1">
        <Par rotulo="Materiais" valor={c.materiais} />
        <Par rotulo="Serviços" valor={c.servicos} />
        <Par rotulo="Mão de obra" valor={c.maoDeObra} />
        <Par rotulo="Deslocamento" valor={c.deslocamento} />
        <Par rotulo="Custo total" valor={c.custo} forte />
      </dl>
      <div className="space-y-1">
        {precos.map((p) => (
          <div key={p.nome} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">
              {p.nome} <span className="text-xs">(÷ {fator(p.fator)})</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{brl(p.valor)}</span>
              {podeAplicar && onAplicar && p.valor > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => onAplicar(p.valor)}
                >
                  Usar no item
                </Button>
              )}
            </span>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t pt-1">
          <span className="text-muted-foreground">Entrada ({fator(config.entradaPct)}%)</span>
          <span className="tabular-nums">{brl(c.entrada)}</span>
        </div>
      </div>
    </div>
  );
}

const Par = ({ rotulo, valor, forte }: { rotulo: string; valor: number; forte?: boolean }) => (
  <div className={cn("flex justify-between gap-2", forte && "border-t pt-1 font-semibold")}>
    <dt className={cn(!forte && "text-muted-foreground")}>{rotulo}</dt>
    <dd className="tabular-nums">{brl(valor)}</dd>
  </div>
);

// ---------- Editor ----------
type Linha =
  | {
      key: string;
      tipo: "material";
      secao: SecaoOrcamento;
      produtoId: string;
      quantidade: string;
      valor: string;
    }
  | {
      key: string;
      tipo: "servico";
      secao: SecaoOrcamento;
      custoId: string | null;
      descricao: string;
      unidade: string;
      quantidade: string;
      valor: string;
    };

let seq = 0;
const novaChave = () => `l${++seq}`;
const campo = (n: number | null) => (n === null ? "" : formatQtd(n));

export function EditorComposicao({
  vendaItemId,
  materiais,
  outros,
  produtos,
  catalogo,
  config,
  onClose,
}: {
  vendaItemId: string;
  materiais: MaterialItem[];
  outros: CustoItem[];
  produtos: ProdutoEstoque[];
  catalogo: CustoOrcamento[];
  config: OrcamentoConfig;
  onClose: () => void;
}) {
  const run = useDataAction();
  const [salvando, setSalvando] = useState(false);
  const fixos = useMemo(
    () => catalogo.filter((c) => c.grupo === "Mão de obra" || c.grupo === "Deslocamento"),
    [catalogo],
  );
  const servicosCatalogo = catalogo.filter((c) => c.grupo === "Serviço" && c.ativo);

  const [linhas, setLinhas] = useState<Linha[]>(() => [
    ...[...materiais]
      .sort((a, b) => a.ordem - b.ordem)
      .map((m): Linha => ({
        key: novaChave(),
        tipo: "material",
        secao: secaoDe(m.secao),
        produtoId: m.produtoId,
        quantidade: formatQtd(m.quantidade),
        valor: campo(m.valorUnitario),
      })),
    ...outros
      .filter((o) => !fixos.some((f) => f.id === o.custoId))
      .map((o): Linha => ({
        key: novaChave(),
        tipo: "servico",
        secao: secaoDe(o.secao),
        custoId: o.custoId,
        descricao: o.descricao,
        unidade: o.unidade,
        quantidade: formatQtd(o.quantidade),
        valor: campo(o.valorUnitario),
      })),
  ]);
  // Mão de obra and deslocamento: one row per catalog entry (like the spreadsheet).
  const [horas, setHoras] = useState<Record<string, { quantidade: string; valor: string }>>(() =>
    Object.fromEntries(
      fixos.map((f) => {
        const salvo = outros.find((o) => o.custoId === f.id);
        return [
          f.id,
          {
            quantidade: salvo ? formatQtd(salvo.quantidade) : "",
            valor: campo(salvo ? salvo.valorUnitario : f.valor),
          },
        ];
      }),
    ),
  );

  const setLinha = (key: string, p: Partial<Linha>) =>
    setLinhas((a) => a.map((l) => (l.key === key ? ({ ...l, ...p } as Linha) : l)));
  const custoDoProduto = (id: string) => produtos.find((p) => p.id === id)?.custo ?? null;

  const preenchidas = linhas.filter((l) =>
    l.tipo === "material"
      ? l.produtoId || l.quantidade.trim()
      : l.descricao.trim() || l.quantidade.trim(),
  );
  const fixosPreenchidos = fixos.filter((f) => (lerNumero(horas[f.id]?.quantidade) ?? 0) > 0);
  const invalida = preenchidas.find((l) =>
    l.tipo === "material"
      ? !l.produtoId || !((lerNumero(l.quantidade) ?? 0) > 0)
      : !l.descricao.trim() || !((lerNumero(l.quantidade) ?? 0) > 0),
  );

  const totais = calcularComposicao(
    preenchidas
      .filter((l) => l.tipo === "material")
      .map((l) => ({
        secao: l.secao,
        quantidade: lerNumero(l.quantidade) ?? 0,
        valorUnitario: lerNumero(l.valor),
      })),
    [
      ...preenchidas
        .filter((l) => l.tipo === "servico")
        .map((l) => ({
          secao: l.secao,
          grupo: "Serviço" as const,
          quantidade: lerNumero(l.quantidade) ?? 0,
          valorUnitario: lerNumero(l.valor),
        })),
      ...fixosPreenchidos.map((f) => ({
        secao: "",
        grupo: f.grupo,
        quantidade: lerNumero(horas[f.id]?.quantidade) ?? 0,
        valorUnitario: lerNumero(horas[f.id]?.valor),
      })),
    ],
    config,
  );

  async function salvar() {
    setSalvando(true);
    const ok = await run(async () => {
      await orcamentoRepository.salvarComposicao(
        vendaItemId,
        preenchidas.flatMap((l) =>
          l.tipo === "material"
            ? [
                {
                  produtoId: l.produtoId,
                  secao: l.secao,
                  quantidade: lerNumero(l.quantidade) ?? 0,
                  valorUnitario: lerNumero(l.valor),
                },
              ]
            : [],
        ),
        [
          ...preenchidas.flatMap((l) =>
            l.tipo === "servico"
              ? [
                  {
                    custoId: l.custoId,
                    secao: l.secao,
                    descricao: l.descricao.trim(),
                    unidade: l.unidade.trim() || "un",
                    quantidade: lerNumero(l.quantidade) ?? 0,
                    valorUnitario: lerNumero(l.valor) ?? 0,
                  },
                ]
              : [],
          ),
          ...fixosPreenchidos.map((f) => ({
            custoId: f.id,
            secao: "",
            descricao: f.nome,
            unidade: f.unidade,
            quantidade: lerNumero(horas[f.id]?.quantidade) ?? 0,
            valorUnitario: lerNumero(horas[f.id]?.valor) ?? 0,
          })),
        ],
      );
      return true;
    }, "Composição salva");
    setSalvando(false);
    if (ok) onClose();
  }

  const addMaterial = (secao: SecaoOrcamento) =>
    setLinhas((a) => [
      ...a,
      { key: novaChave(), tipo: "material", secao, produtoId: "", quantidade: "", valor: "" },
    ]);
  const addServico = (secao: SecaoOrcamento, c: CustoOrcamento | null) =>
    setLinhas((a) => [
      ...a,
      {
        key: novaChave(),
        tipo: "servico",
        secao,
        custoId: c?.id ?? null,
        descricao: c?.nome ?? "",
        unidade: c?.unidade ?? "un",
        quantidade: "",
        valor: c ? campo(c.valor) : "",
      },
    ]);

  return (
    <div className="space-y-3">
      {SECOES_ORCAMENTO.map((s) => {
        const daSecao = linhas.filter((l) => l.secao === s);
        return (
          <div key={s} className="space-y-2 rounded-lg border bg-background p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{s}</p>
              <span className="text-sm tabular-nums text-muted-foreground">
                {brl(totais.porSecao[s])}
              </span>
            </div>
            {daSecao.map((l) => (
              <div key={l.key} className="grid gap-2 md:grid-cols-12">
                <div className="md:col-span-6">
                  {l.tipo === "material" ? (
                    <ProdutoPicker
                      produtos={produtos}
                      value={l.produtoId}
                      onChange={(id) =>
                        setLinha(l.key, {
                          produtoId: id,
                          ...(id && !l.valor && { valor: campo(custoDoProduto(id)) }),
                        })
                      }
                    />
                  ) : (
                    <Input
                      aria-label="Descrição do serviço"
                      placeholder="Serviço ou custo"
                      value={l.descricao}
                      onChange={(e) => setLinha(l.key, { descricao: e.target.value })}
                    />
                  )}
                </div>
                <Input
                  aria-label="Quantidade"
                  placeholder={`Qtd.${unidadeDaLinha(l, produtos)}`}
                  inputMode="decimal"
                  className="md:col-span-2"
                  value={l.quantidade}
                  onChange={(e) => setLinha(l.key, { quantidade: e.target.value })}
                />
                <Input
                  aria-label="Valor unitário"
                  placeholder="Valor R$"
                  inputMode="decimal"
                  className="md:col-span-2"
                  value={l.valor}
                  onChange={(e) => setLinha(l.key, { valor: e.target.value })}
                />
                <div className="flex items-center justify-end gap-1 md:col-span-2">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {brl((lerNumero(l.quantidade) ?? 0) * (lerNumero(l.valor) ?? 0))}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover linha"
                    onClick={() => setLinhas((a) => a.filter((x) => x.key !== l.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => addMaterial(s)}>
                <Plus />
                Material
              </Button>
              <select
                aria-label={`Adicionar serviço em ${s}`}
                className={cn(selectClass, "h-8 w-auto text-sm")}
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  addServico(s, v === "livre" ? null : (catalogo.find((c) => c.id === v) ?? null));
                }}
              >
                <option value="">+ Serviço…</option>
                {servicosCatalogo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({brl(c.valor)}/{c.unidade})
                  </option>
                ))}
                <option value="livre">Outro (escrever)</option>
              </select>
            </div>
          </div>
        );
      })}

      {fixos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-background p-2">
          <p className="mb-2 text-sm font-semibold">Mão de obra e deslocamento</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-1 font-medium">Setor</th>
                <th className="w-28 p-1 font-medium">Quantidade</th>
                <th className="w-28 p-1 font-medium">Valor</th>
                <th className="p-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {fixos
                .filter((f) => f.ativo || (lerNumero(horas[f.id]?.quantidade) ?? 0) > 0)
                .map((f) => {
                  const h = horas[f.id] ?? { quantidade: "", valor: "" };
                  return (
                    <tr key={f.id} className="border-t">
                      <td className="p-1">
                        {f.nome}
                        {f.dica && (
                          <span className="block text-xs text-muted-foreground">{f.dica}</span>
                        )}
                      </td>
                      <td className="p-1">
                        <Input
                          aria-label={`Quantidade de ${f.nome}`}
                          placeholder={f.unidade}
                          inputMode="decimal"
                          className="h-8"
                          value={h.quantidade}
                          onChange={(e) =>
                            setHoras((a) => ({
                              ...a,
                              [f.id]: { ...h, quantidade: e.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="p-1">
                        <Input
                          aria-label={`Valor de ${f.nome}`}
                          inputMode="decimal"
                          className="h-8"
                          value={h.valor}
                          onChange={(e) =>
                            setHoras((a) => ({ ...a, [f.id]: { ...h, valor: e.target.value } }))
                          }
                        />
                      </td>
                      <td className="p-1 text-right tabular-nums">
                        {brl((lerNumero(h.quantidade) ?? 0) * (lerNumero(h.valor) ?? 0))}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      <Totais c={totais} config={config} podeAplicar={false} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {invalida && (
          <span className="text-xs text-destructive">
            Complete o material (ou a descrição) e a quantidade de cada linha.
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={onClose} disabled={salvando}>
          <X />
          Cancelar
        </Button>
        <Button size="sm" onClick={() => void salvar()} disabled={salvando || !!invalida}>
          <Save />
          Salvar composição
        </Button>
      </div>
    </div>
  );
}

function unidadeDaLinha(l: Linha, produtos: ProdutoEstoque[]) {
  const u = l.tipo === "material" ? produtos.find((p) => p.id === l.produtoId)?.unidade : l.unidade;
  return u ? ` (${u})` : "";
}
