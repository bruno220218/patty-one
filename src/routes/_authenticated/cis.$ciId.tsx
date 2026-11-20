import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCheck, Pencil, SearchX, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CiForm } from "@/components/app/ci-form";
import { CiPainelPill, CiSituacaoPill, EntradaAcoes } from "@/components/app/ci-entrada";
import { useNomesCi } from "@/components/app/ci-nomes";
import { AnexosPanel } from "@/components/app/anexos-panel";
import { CiFotoChecking } from "@/components/app/ci-foto-checking";
import { useCi, useCurrentUser, useDataAction, usePaineis } from "@/hooks/use-data";
import {
  canEditarPaineis,
  ciEditavel,
  ciRepository,
  VINHETA_ACCEPT,
  VINHETA_TIPO_LABEL,
  vinhetaPermitida,
  type Ci,
  type CiInput,
} from "@/lib/data";
import { formatDateOnly, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cis/$ciId")({
  head: () => ({
    meta: [{ title: "CI — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: CiPage,
});

const MODALIDADE: Record<string, string> = {
  convencional: "Convencional",
  exclusivo: "Exclusivo",
  evento: "Evento",
};

function Campo({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="break-words text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

const toInput = (ci: Ci): CiInput => ({
  data: ci.data,
  representanteNome: ci.representanteNome,
  cliente: ci.cliente,
  titulo: ci.titulo,
  tipo: ci.tipo,
  inicio: ci.inicio,
  fim: ci.fim,
  recebimento: ci.recebimento,
  responsavelInsercaoNome: ci.responsavelInsercaoNome,
  observacao: ci.observacao,
  movel: ci.movel,
  painelIds: ci.paineis.map((p) => p.painelId),
});

function CiPage() {
  const { ciId } = Route.useParams();
  const { data: ci, isPending } = useCi(ciId);
  const { data: snap } = usePaineis();
  const { data: me } = useCurrentUser();
  const nomes = useNomesCi();
  const run = useDataAction();
  const navigate = useNavigate();
  const [editando, setEditando] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [todos, setTodos] = useState(false);

  const back = (
    <Button variant="outline" asChild className="mb-6">
      <Link to="/cis">
        <ArrowLeft />
        CIs
      </Link>
    </Button>
  );

  if (isPending) return <DetailSkeleton />;
  if (!ci) {
    return (
      <>
        {back}
        <EmptyState
          icon={SearchX}
          title="CI não encontrada"
          description="Ela pode ter sido excluída."
        />
      </>
    );
  }

  const paineis = snap?.paineis ?? [];
  const daEntrada = canEditarPaineis(me);
  const dono = Boolean(me && (me.id === ci.createdBy || me.isGestor));
  const editavel = ciEditavel(ci) && dono;
  const pendentes = ci.paineis.filter((p) => p.status === "pendente");
  const temMovel = Object.values(ci.movel).some(Boolean);

  if (editando) {
    return (
      <div className="max-w-4xl">
        {back}
        <h1 className="mb-6 text-2xl font-bold tracking-tight">Editar CI {ci.rotulo}</h1>
        <CiForm
          initial={toInput(ci)}
          paineis={paineis}
          representantes={nomes.representantes}
          responsaveis={nomes.responsaveis}
          submitLabel="Salvar"
          onCancel={() => setEditando(false)}
          onSubmit={async (input) => {
            const ok = await run(() => ciRepository.salvar(ci.id, input), "CI salva.");
            if (ok) setEditando(false);
          }}
        />
      </div>
    );
  }

  const darEntradaEmTodos = async () => {
    setTodos(true);
    const entrou: string[] = [];
    for (const cp of pendentes) {
      const codigo = paineis.find((p) => p.id === cp.painelId)?.codigo ?? "painel";
      const pos = await run(() => ciRepository.aprovar(cp.id));
      if (pos === undefined) break;
      entrou.push(`${codigo} (${pos})`);
    }
    setTodos(false);
    if (entrou.length) toast.success(`Entrou em ${entrou.join(", ")}.`);
  };

  return (
    <div className="max-w-4xl">
      {back}

      <article className="surface-card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Comunicação interna de vinheta
            </p>
            <h1 className="text-xl font-bold tracking-tight">
              Nº {ci.rotulo} · {ci.cliente}
            </h1>
          </div>
          <CiSituacaoPill ci={ci} />
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-4">
          <Campo label="Representante" value={ci.representanteNome} />
          <Campo label="Data" value={formatDateOnly(ci.data)} />
          <Campo label="Cliente" value={ci.cliente} />
          <Campo label="Título" value={ci.titulo} />
          <Campo
            label="Período"
            value={
              ci.inicio || ci.fim
                ? `${ci.inicio ? formatDateOnly(ci.inicio) : "…"} a ${ci.fim ? formatDateOnly(ci.fim) : "sem fim"}`
                : ""
            }
          />
          <Campo label="Tipo" value={VINHETA_TIPO_LABEL[ci.tipo]} />
          <Campo label="Resp. pela inserção" value={ci.responsavelInsercaoNome} />
          <Campo label="Resp. pela CI" value={ci.createdByNome} />
          <Campo label="Recebimento do cliente" value={ci.recebimento} />
          {ci.observacao && (
            <Campo label="Observação" value={ci.observacao} className="col-span-2 sm:col-span-3" />
          )}
        </dl>

        <section className="border-t px-5 py-4" aria-labelledby="ci-paineis">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="ci-paineis" className="text-sm font-semibold">
              Painel RGB
            </h2>
            {daEntrada && pendentes.length > 1 && (
              <Button size="sm" disabled={todos} onClick={darEntradaEmTodos}>
                <CheckCheck />
                Dar entrada em todos ({pendentes.length})
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border rounded-lg border">
            {paineis.map((p) => {
              const cp = ci.paineis.find((x) => x.painelId === p.id);
              return (
                <li
                  key={p.id}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2",
                    !cp && "text-muted-foreground",
                  )}
                >
                  <span className="w-14 shrink-0 text-sm font-semibold">{p.codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.nome.replace(/^Painel\s+/i, "")}
                  </span>
                  {cp ? (
                    <>
                      <CiPainelPill cp={cp} />
                      {cp.status === "pendente" && daEntrada && (
                        <EntradaAcoes cp={cp} painelCodigo={p.codigo} />
                      )}
                      {cp.status !== "pendente" && (
                        <span className="w-full text-xs text-muted-foreground sm:w-auto">
                          {cp.decididoPorNome || "Alguém"}
                          {cp.decididoEm ? ` · ${formatDateTime(cp.decididoEm)}` : ""}
                          {cp.status === "recusada" && cp.motivo ? ` · ${cp.motivo}` : ""}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs">não marcado</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {temMovel && (
          <section className="border-t px-5 py-4" aria-labelledby="ci-movel">
            <h2 id="ci-movel" className="mb-3 text-sm font-semibold">
              Painel RGB · Patty Móvel
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Campo label="Modalidade" value={MODALIDADE[ci.movel.modalidade] ?? ""} />
              <Campo label="Responsável" value={ci.movel.responsavel} />
              <Campo label="Endereço" value={ci.movel.endereco} className="col-span-2" />
              <Campo label="Som / microfone" value={ci.movel.somMicrofone} />
              <Campo label="Palco / escada" value={ci.movel.palcoEscada} />
              <Campo label="Suporte das caixas" value={ci.movel.suporteCaixas} />
              <Campo label="Cabo de energia" value={ci.movel.caboEnergia} />
            </dl>
          </section>
        )}
      </article>

      <AnexosPanel
        entidade="ci"
        entidadeId={ci.id}
        titulo="Arquivo da vinheta"
        aviso="Fica no Google Drive da empresa, na pasta desta CI. Clique para abrir ou baixar."
        accept={VINHETA_ACCEPT}
        permitido={vinhetaPermitida}
        formatos="o vídeo da vinheta (MP4, MOV…), uma imagem ou PDF"
        rotuloBotao="Enviar vinheta"
        className="mt-4"
      />

      <CiFotoChecking ci={ci} etapa="checking" />
      <CiFotoChecking ci={ci} etapa="checkout" />

      <p className="mt-3 text-xs text-muted-foreground">
        Criada por {ci.createdByNome || "alguém"} em {formatDateTime(ci.createdAt)}.
        {!ciEditavel(ci) && " Depois da primeira entrada, a CI não pode mais ser alterada."}
      </p>

      {editavel && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditando(true)}>
            <Pencil />
            Editar
          </Button>
          <Button variant="destructive" onClick={() => setExcluir(true)}>
            <Trash2 />
            Excluir
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={excluir}
        onOpenChange={setExcluir}
        title={`Excluir a CI ${ci.rotulo}?`}
        description="Ela sai da fila de entrada de todos os painéis marcados."
        onConfirm={async () => {
          setExcluir(false);
          const ok = await run(() => ciRepository.excluir(ci.id).then(() => true), "CI excluída.");
          if (ok) await navigate({ to: "/cis" });
        }}
      />
    </div>
  );
}
