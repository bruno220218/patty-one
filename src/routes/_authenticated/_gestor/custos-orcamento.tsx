import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Calculator, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { selectClass } from "@/components/app/operacao-ui";
import { useCustosOrcamento, useDataAction, useOrcamentoConfig } from "@/hooks/use-data";
import {
  brl,
  formatQtd,
  GRUPOS_CUSTO,
  lerNumero,
  orcamentoRepository,
  type CustoOrcamento,
  type GrupoCusto,
  type OrcamentoConfig,
} from "@/lib/data";

/**
 * Custos do orçamento (migration 0050, Gestão): the factors that turn cost into price and the
 * catalog of mão de obra (R$/hora per setor), deslocamento (R$/km) and serviços used in the
 * composição de custo of each proposta item. Changing a value here doesn't change compositions
 * already saved (each line keeps the value it was made with).
 */
export const Route = createFileRoute("/_authenticated/_gestor/custos-orcamento")({
  head: () => ({
    meta: [{ title: "Custos do orçamento — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: CustosOrcamentoPage,
});

function CustosOrcamentoPage() {
  const config = useOrcamentoConfig();
  const custos = useCustosOrcamento();
  if (config.isPending || custos.isPending) return <CardGridSkeleton />;
  if (custos.data === null) {
    return (
      <EmptyState
        icon={Calculator}
        title="Ainda não está ligado"
        description="Rode a migration 0050 no Supabase para usar a composição de custo."
      />
    );
  }
  return (
    <>
      <PageHeader
        title="Custos do orçamento"
        description="Fatores do preço e valores de mão de obra, deslocamento e serviços usados na composição de custo dos itens da proposta. Mudar aqui não muda composições já salvas."
      />
      <div className="space-y-5">
        {config.data && <Fatores inicial={config.data} />}
        {GRUPOS_CUSTO.map((g) => (
          <Grupo key={g} grupo={g} custos={(custos.data ?? []).filter((c) => c.grupo === g)} />
        ))}
      </div>
    </>
  );
}

function Fatores({ inicial }: { inicial: OrcamentoConfig }) {
  const run = useDataAction();
  const txt = (n: number) => formatQtd(n);
  const [f, setF] = useState({
    fatorVenda: txt(inicial.fatorVenda),
    fatorDesconto: txt(inicial.fatorDesconto),
    fatorSemNota: txt(inicial.fatorSemNota),
    entradaPct: txt(inicial.entradaPct),
  });
  const valores = {
    fatorVenda: lerNumero(f.fatorVenda) ?? 0,
    fatorDesconto: lerNumero(f.fatorDesconto) ?? 0,
    fatorSemNota: lerNumero(f.fatorSemNota) ?? 0,
    entradaPct: lerNumero(f.entradaPct) ?? 0,
  };
  const valido =
    [valores.fatorVenda, valores.fatorDesconto, valores.fatorSemNota].every(
      (v) => v > 0 && v <= 1,
    ) &&
    valores.entradaPct >= 0 &&
    valores.entradaPct <= 100;
  const campos: { k: keyof typeof f; rotulo: string }[] = [
    { k: "fatorVenda", rotulo: "Preço de venda (custo ÷)" },
    { k: "fatorDesconto", rotulo: "Com desconto (custo ÷)" },
    { k: "fatorSemNota", rotulo: "Com desconto sem nota (custo ÷)" },
    { k: "entradaPct", rotulo: "Entrada (% do preço de venda)" },
  ];
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div>
        <h2 className="font-semibold">Fatores do preço</h2>
        <p className="text-sm text-muted-foreground">
          Exemplo com custo de R$ 100: venda {brl(div(100, valores.fatorVenda))}, com desconto{" "}
          {brl(div(100, valores.fatorDesconto))}, sem nota {brl(div(100, valores.fatorSemNota))}.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {campos.map((c) => (
          <div key={c.k} className="space-y-1.5">
            <Label htmlFor={`f-${c.k}`}>{c.rotulo}</Label>
            <Input
              id={`f-${c.k}`}
              inputMode="decimal"
              value={f[c.k]}
              onChange={(e) => setF((a) => ({ ...a, [c.k]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        {!valido && (
          <span className="text-xs text-destructive">
            Os fatores ficam entre 0 e 1 (ex.: 0,55) e a entrada entre 0 e 100.
          </span>
        )}
        <Button
          disabled={!valido}
          onClick={() =>
            void run(async () => {
              await orcamentoRepository.salvarConfig(valores);
              return true;
            }, "Fatores salvos")
          }
        >
          <Save />
          Salvar fatores
        </Button>
      </div>
    </section>
  );
}

const div = (a: number, b: number) => (b > 0 ? a / b : 0);

const DESCRICAO_GRUPO: Record<GrupoCusto, string> = {
  "Mão de obra": "Valor por hora de cada setor. Na composição, informe as horas do serviço.",
  Deslocamento: "Valor por km. Na composição, informe a distância.",
  Serviço: "Serviços que entram nas seções do item (corte, gravação, frete…), por unidade.",
};

function Grupo({ grupo, custos }: { grupo: GrupoCusto; custos: CustoOrcamento[] }) {
  const [novo, setNovo] = useState(false);
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{grupo}</h2>
          <p className="text-sm text-muted-foreground">{DESCRICAO_GRUPO[grupo]}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setNovo(true)} disabled={novo}>
          <Plus />
          Adicionar
        </Button>
      </div>
      <div className="space-y-2">
        {custos.map((c) => (
          <LinhaCusto key={`${c.id}-${c.valor}-${c.nome}`} grupo={grupo} custo={c} />
        ))}
        {novo && <LinhaCusto grupo={grupo} custo={null} onClose={() => setNovo(false)} />}
        {custos.length === 0 && !novo && (
          <p className="text-sm text-muted-foreground">Nada cadastrado.</p>
        )}
      </div>
    </section>
  );
}

function LinhaCusto({
  grupo,
  custo,
  onClose,
}: {
  grupo: GrupoCusto;
  custo: CustoOrcamento | null;
  onClose?: () => void;
}) {
  const run = useDataAction();
  const [excluir, setExcluir] = useState(false);
  const [f, setF] = useState({
    nome: custo?.nome ?? "",
    unidade:
      custo?.unidade ?? (grupo === "Mão de obra" ? "h" : grupo === "Deslocamento" ? "km" : "un"),
    valor: custo ? formatQtd(custo.valor) : "",
    dica: custo?.dica ?? "",
    ativo: custo?.ativo ?? true,
  });
  const mudou =
    !custo ||
    f.nome !== custo.nome ||
    f.unidade !== custo.unidade ||
    (lerNumero(f.valor) ?? 0) !== custo.valor ||
    f.dica !== (custo.dica ?? "") ||
    f.ativo !== custo.ativo;
  const valido = f.nome.trim() !== "" && (lerNumero(f.valor) ?? -1) >= 0;

  async function salvar() {
    const ok = await run(
      async () => {
        await orcamentoRepository.salvarCusto(custo?.id ?? null, {
          grupo,
          nome: f.nome,
          unidade: f.unidade,
          valor: lerNumero(f.valor) ?? 0,
          dica: f.dica,
          ordem: custo?.ordem ?? 99,
          ativo: f.ativo,
        });
        return true;
      },
      custo ? "Custo salvo" : "Custo adicionado",
    );
    if (ok && !custo) onClose?.();
  }

  return (
    <div className="grid items-center gap-2 rounded-lg border bg-muted/20 p-2 md:grid-cols-12">
      <Input
        aria-label="Nome"
        placeholder="Nome"
        className="md:col-span-4"
        value={f.nome}
        onChange={(e) => setF((a) => ({ ...a, nome: e.target.value }))}
      />
      <Input
        aria-label="Valor"
        placeholder="Valor R$"
        inputMode="decimal"
        className="md:col-span-2"
        value={f.valor}
        onChange={(e) => setF((a) => ({ ...a, valor: e.target.value }))}
      />
      <select
        aria-label="Unidade"
        className={`${selectClass} md:col-span-1`}
        value={f.unidade}
        onChange={(e) => setF((a) => ({ ...a, unidade: e.target.value }))}
      >
        {["h", "km", "m", "m²", "un"].map((u) => (
          <option key={u}>{u}</option>
        ))}
      </select>
      <Input
        aria-label="Dica"
        placeholder="Dica (ex.: tempo de impressão)"
        className="md:col-span-3"
        value={f.dica}
        onChange={(e) => setF((a) => ({ ...a, dica: e.target.value }))}
      />
      <div className="flex items-center justify-end gap-1 md:col-span-2">
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={f.ativo}
            onChange={(e) => setF((a) => ({ ...a, ativo: e.target.checked }))}
          />
          Ativo
        </label>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Salvar"
          disabled={!mudou || !valido}
          onClick={() => void salvar()}
        >
          <Save />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Excluir"
          onClick={() => (custo ? setExcluir(true) : onClose?.())}
        >
          <Trash2 />
        </Button>
      </div>
      {custo && (
        <ConfirmDialog
          open={excluir}
          onOpenChange={setExcluir}
          title={`Excluir “${custo.nome}”?`}
          description="As composições já salvas continuam com a linha e o valor. Para só tirar da lista, desmarque Ativo."
          confirmLabel="Excluir"
          onConfirm={async () => {
            await run(async () => {
              await orcamentoRepository.excluirCusto(custo.id);
              return true;
            }, "Custo excluído");
            setExcluir(false);
          }}
        />
      )}
    </div>
  );
}
