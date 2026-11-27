import { useState } from "react";
import { Check, CornerUpLeft, Send, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useCurrentUser,
  useCustosDaVenda,
  useDataAction,
  useMateriaisDaVenda,
  useRevisoesOrcamento,
} from "@/hooks/use-data";
import {
  brl,
  canDecidirOrcamento,
  canEnviarOrcamento,
  canVender,
  canVerCustoEstoque,
  etapaDoOrcamento,
  fluxoOrcamentoRepository,
  margemPct,
  NOME_SITUACAO_ORCAMENTO,
  type Venda,
} from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Fluxo do orçamento (migration 0051), the flowchart "do orçamento à produção": Projetos monta e
 * precifica → Gestão fecha (preço e margem) ou devolve → Comercial envia ao cliente → cliente
 * aprova (Gerar pedido → Liberar para produção), pede ajuste (volta para Projetos, nova revisão)
 * ou recusa (Recusada = perdido). Shown at the top of a proposta.
 */
export function FluxoOrcamento({ venda, alterado }: { venda: Venda; alterado: boolean }) {
  const me = useCurrentUser().data;
  const run = useDataAction();
  const verCusto = canVerCustoEstoque(me);
  const sit = venda.orcamentoSituacao;
  const revisoes = useRevisoesOrcamento(venda.id, verCusto && sit !== null);
  const materiais = useMateriaisDaVenda(sit ? venda.id : "");
  const custos = useCustosDaVenda(venda.id, verCusto && sit !== null);
  const [motivo, setMotivo] = useState("");
  const [pedindo, setPedindo] = useState<"devolver" | "ajuste" | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (venda.tipo !== "proposta") return null;

  if (!sit) {
    if (!canVender(me) || venda.status !== "Rascunho") return null;
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed bg-card p-4 text-sm">
        <span className="text-muted-foreground">
          Precisa de orçamento de Projetos (materiais, mão de obra e preço aprovado pela Gestão)?
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={alterado}
          title={alterado ? "Salve antes" : undefined}
          onClick={() =>
            void run(async () => {
              await fluxoOrcamentoRepository.iniciar(venda.id);
              return true;
            }, "Proposta enviada para Projetos orçar")
          }
        >
          <Workflow />
          Mandar para Projetos orçar
        </Button>
      </section>
    );
  }

  const etapa = etapaDoOrcamento(sit);
  const valor = Math.max(
    venda.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario - i.desconto, 0) -
      venda.desconto,
    0,
  );
  const custo =
    (materiais.data ?? []).reduce((s, m) => s + m.quantidade * (m.valorUnitario ?? 0), 0) +
    (custos.data ?? []).reduce((s, c) => s + c.quantidade * c.valorUnitario, 0);
  const margem = margemPct(custo, valor);
  const ultima = revisoes.data?.[0] ?? null;

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

  const passos = [
    "Projetos monta e precifica",
    "Gestão fecha o orçamento",
    "Comercial envia ao cliente",
  ];

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Workflow className="size-5 text-primary" />
            Orçamento · {NOME_SITUACAO_ORCAMENTO[sit]}
            {venda.orcamentoRevisao > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                (revisão {venda.orcamentoRevisao})
              </span>
            )}
          </h2>
          {verCusto && (
            <p className="text-sm text-muted-foreground">
              Custo {brl(custo)} · valor da proposta {brl(valor)}
              {margem !== null && (
                <>
                  {" "}
                  · margem <span className="font-medium text-foreground">{margem}%</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        {passos.map((p, i) => (
          <li
            key={p}
            className={cn(
              "rounded-lg border px-3 py-2",
              i < etapa && "border-primary/40 text-muted-foreground",
              i === etapa && "border-primary bg-primary/10 font-medium",
              i > etapa && "text-muted-foreground",
            )}
          >
            {i < etapa && <Check className="mr-1 inline size-4 text-primary" />}
            {p}
          </li>
        ))}
      </ol>

      {sit === "devolvido" && ultima?.motivo && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm">
          A Gestão devolveu: <span className="font-medium">{ultima.motivo}</span>
        </p>
      )}
      {sit === "em_orcamento" && ultima?.ajusteMotivo && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
          O cliente pediu ajuste: <span className="font-medium">{ultima.ajusteMotivo}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(sit === "em_orcamento" || sit === "devolvido") && canEnviarOrcamento(me) && (
          <>
            <Button
              disabled={ocupado || alterado}
              title={alterado ? "Salve antes" : undefined}
              onClick={() =>
                void acao(
                  () => fluxoOrcamentoRepository.enviarParaAprovacao(venda.id),
                  "Orçamento enviado para a Gestão",
                )
              }
            >
              <Send />
              Enviar para a Gestão
            </Button>
            <span className="text-xs text-muted-foreground">
              Antes: monte a composição de cada item e use “Usar no item” para pôr o preço.
            </span>
          </>
        )}
        {(sit === "em_orcamento" || sit === "devolvido") && !canEnviarOrcamento(me) && (
          <span className="text-sm text-muted-foreground">
            Com a equipe de Projetos: materiais, mão de obra e preço.
          </span>
        )}
        {sit === "aguardando_aprovacao" && canDecidirOrcamento(me) && pedindo === null && (
          <>
            <Button
              disabled={ocupado}
              onClick={() =>
                void acao(
                  () => fluxoOrcamentoRepository.decidir(venda.id, true),
                  "Orçamento fechado: o Comercial foi avisado",
                )
              }
            >
              <Check />
              Fechar orçamento
            </Button>
            <Button variant="outline" disabled={ocupado} onClick={() => setPedindo("devolver")}>
              <CornerUpLeft />
              Devolver para Projetos
            </Button>
          </>
        )}
        {sit === "aguardando_aprovacao" && !canDecidirOrcamento(me) && (
          <span className="text-sm text-muted-foreground">
            Aguardando a Gestão aprovar preço e margem. Itens e composição ficam travados.
          </span>
        )}
        {sit === "aprovado" && (
          <span className="text-sm text-muted-foreground">
            {venda.status === "Aprovada"
              ? "O cliente aprovou: gere o pedido e depois libere para a produção."
              : venda.status === "Recusada"
                ? "O cliente recusou (orçamento perdido)."
                : "Fechado pela Gestão: o Comercial envia ao cliente (situação Enviada). Cliente aprovou → Gerar pedido → Liberar para produção."}
          </span>
        )}
        {sit === "aprovado" &&
          canVender(me) &&
          (venda.status === "Rascunho" || venda.status === "Enviada") &&
          pedindo === null && (
            <Button variant="outline" size="sm" onClick={() => setPedindo("ajuste")}>
              <CornerUpLeft />
              Cliente pediu ajuste
            </Button>
          )}
      </div>

      {pedindo && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <Textarea
            rows={2}
            aria-label="Motivo"
            placeholder={
              pedindo === "devolver"
                ? "O que Projetos precisa revisar (ex.: margem baixa, faltou instalação)…"
                : "O que o cliente quer ajustar…"
            }
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
                      () => fluxoOrcamentoRepository.decidir(venda.id, false, motivo.trim()),
                      "Devolvido para Projetos",
                    )
                  : acao(
                      () => fluxoOrcamentoRepository.pedirAjuste(venda.id, motivo.trim()),
                      "Ajuste enviado para Projetos",
                    ))
              }
            >
              {pedindo === "devolver" ? "Devolver" : "Mandar para Projetos"}
            </Button>
          </div>
        </div>
      )}

      {verCusto && (revisoes.data?.length ?? 0) > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Revisões ({revisoes.data?.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {revisoes.data?.map((r) => (
              <li key={r.id} className="rounded-lg border px-3 py-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    R{r.numero} · enviada por {r.enviadaPorNome || "—"} em{" "}
                    {formatDateTime(r.enviadaEm)}
                  </span>
                  <span className="tabular-nums">
                    custo {brl(r.custo)} · valor {brl(r.valor)}
                    {margemPct(r.custo, r.valor) !== null &&
                      ` · margem ${margemPct(r.custo, r.valor)}%`}
                  </span>
                </div>
                {r.decisao && (
                  <p className="text-muted-foreground">
                    {r.decisao === "aprovado" ? "Fechada" : "Devolvida"} por{" "}
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
    </section>
  );
}
