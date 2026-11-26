import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ClipboardCheck, Lock, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { LiberacaoEditor } from "@/components/app/liberacao-editor";
import { useCurrentUser, useDataAction, useListasLiberacao, useVenda } from "@/hooks/use-data";
import {
  canEditLiberacoes,
  emptyLiberacaoItem,
  LIBERACAO_MODELO_LABEL,
  liberacaoRepository,
  localToday,
  modeloDoPedido,
  type LiberacaoInput,
  type LiberacaoModelo,
  type Venda,
} from "@/lib/data";

/**
 * "?modelo=projeto|midia" opens an empty liberação; "?pedido=<id>" (button "Liberar para
 * produção" on the pedido) opens it linked to that pedido, filled with its client and items.
 */
export const Route = createFileRoute("/_authenticated/liberacoes/nova")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { modelo?: LiberacaoModelo; pedido?: string } => ({
    ...(search["modelo"] === "midia" || search["modelo"] === "projeto"
      ? { modelo: search["modelo"] }
      : {}),
    ...(typeof search["pedido"] === "string" && search["pedido"]
      ? { pedido: search["pedido"] }
      : {}),
  }),
  head: () => ({
    meta: [{ title: "Nova liberação — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: NovaLiberacaoPage,
});

/** Header and items taken from the pedido; the comercial completes the rest. */
function doPedido(base: LiberacaoInput, venda: Venda): LiberacaoInput {
  const c = venda.cliente;
  return {
    ...base,
    vendaId: venda.id,
    motivoSemPedido: "",
    cliente: c?.nome ?? "",
    responsavel: c?.contato ?? "",
    contato: c?.telefone ?? "",
    endereco: c?.endereco ?? "",
    vendedor: venda.vendedor,
    observacoes: venda.observacao,
    itens: venda.itens.map((i) => ({
      ...emptyLiberacaoItem(),
      referencia: i.ponto ?? "",
      servico: i.descricao,
      quantidade: i.quantidade,
    })),
  };
}

function NovaLiberacaoPage() {
  const { modelo: modeloEscolhido, pedido: pedidoId } = Route.useSearch();
  const { data: me, isPending } = useCurrentUser();
  const run = useDataAction();
  const { listas } = useListasLiberacao();
  const navigate = useNavigate();
  const venda = useVenda(pedidoId ?? "");
  const [numero, setNumero] = useState<number | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    liberacaoRepository
      .nextNumero()
      .then((n) => alive && setNumero(n))
      .catch(() => alive && setNumero(null));
    return () => {
      alive = false;
    };
  }, []);

  const back = (
    <Button variant="outline" asChild className="mb-6">
      {pedidoId ? (
        <Link to="/comercial/$vendaId" params={{ vendaId: pedidoId }}>
          <ArrowLeft />
          Pedido
        </Link>
      ) : (
        <Link to="/liberacoes">
          <ArrowLeft />
          Liberações
        </Link>
      )}
    </Button>
  );

  if (isPending || numero === undefined || (pedidoId && venda.isPending)) return <DetailSkeleton />;
  if (!canEditLiberacoes(me)) {
    return (
      <>
        {back}
        <EmptyState
          icon={Lock}
          title="Sem permissão"
          description="Somente comercial e gestão criam liberações."
        />
      </>
    );
  }

  const pedido = pedidoId ? venda.data : undefined;
  if (pedidoId && (!pedido || pedido.tipo !== "pedido")) {
    return (
      <>
        {back}
        <EmptyState
          icon={SearchX}
          title="Pedido não encontrado"
          description="Abra a liberação a partir de um pedido de venda."
        />
      </>
    );
  }
  if (pedido?.liberacao) {
    return (
      <>
        {back}
        <EmptyState
          icon={ClipboardCheck}
          title={`O pedido nº ${pedido.numero} já tem liberação`}
          description="Cada pedido tem uma liberação só, que aprova todas as ordens dele."
          action={
            <Button asChild>
              <Link to="/liberacoes/$liberacaoId" params={{ liberacaoId: pedido.liberacao.id }}>
                Abrir a liberação nº {pedido.liberacao.numero}
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  const modelo: LiberacaoModelo =
    modeloEscolhido ?? (pedido ? modeloDoPedido(pedido.itens.map((i) => i.categoria)) : "projeto");
  const vazia: LiberacaoInput = {
    modelo,
    vendaId: null,
    motivoSemPedido: "",
    numero,
    cliente: "",
    responsavel: "",
    contato: "",
    endereco: "",
    projetista: "",
    vendedor: "",
    classificacaoVenda: "",
    dataLiberacao: localToday(),
    dataEntrega: null,
    bissemana: "",
    pontoEnergia: "",
    horarioInstalacao: "",
    observacoes: "",
    itens: [],
  };
  const initial = pedido ? doPedido(vazia, pedido) : vazia;

  return (
    <>
      {back}
      <PageHeader
        title={
          pedido
            ? `Liberar pedido nº ${pedido.numero} · ${LIBERACAO_MODELO_LABEL[modelo]}`
            : `Nova liberação · ${LIBERACAO_MODELO_LABEL[modelo]}`
        }
        description={
          pedido
            ? "Os dados do cliente e os itens vieram do pedido. Complete o que falta e salve: ela entra no fim da fila do PCP."
            : "Preencha como na planilha. Sem pedido, informe o motivo. Ao salvar, ela entra no fim da fila do PCP para aprovação."
        }
      />
      {pedido && (
        <p className="mb-4 text-sm text-muted-foreground">
          Modelo:{" "}
          {(["projeto", "midia"] as const).map((m, i) => (
            <span key={m}>
              {i > 0 && " · "}
              {m === modelo ? (
                <strong className="text-foreground">{LIBERACAO_MODELO_LABEL[m]}</strong>
              ) : (
                <Link
                  to="/liberacoes/nova"
                  search={{ pedido: pedido.id, modelo: m }}
                  className="text-primary hover:underline"
                >
                  {LIBERACAO_MODELO_LABEL[m]}
                </Link>
              )}
            </span>
          ))}
        </p>
      )}
      <LiberacaoEditor
        listas={listas}
        key={`${modelo}-${pedido?.id ?? ""}`}
        initial={initial}
        pedidoNumero={pedido?.numero ?? null}
        motivoObrigatorio
        readOnly={false}
        saving={saving}
        onSubmit={async (input) => {
          setSaving(true);
          const created = await run(
            () => liberacaoRepository.create(input),
            "Liberação criada e enviada para a fila do PCP.",
          );
          setSaving(false);
          if (created) {
            navigate({ to: "/liberacoes/$liberacaoId", params: { liberacaoId: created.id } });
          }
        }}
      />
    </>
  );
}
