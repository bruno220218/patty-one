import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  FileDown,
  RotateCcw,
  SearchX,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DetailSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormField } from "@/components/app/form-field";
import { VisitaForm } from "@/components/app/visita-form";
import { VisitaStatusBadge } from "@/components/app/visita-status";
import { VistoriaForm } from "@/components/app/visita-vistoria-form";
import { AnexosPanel } from "@/components/app/anexos-panel";
import {
  useAnexos,
  useCurrentUser,
  useDataAction,
  usePessoasDaFuncao,
  useVisita,
} from "@/hooks/use-data";
import {
  canAgendarVisita,
  canRealizarVisita,
  canSolicitarVisita,
  visitaRepository,
  type Visita,
} from "@/lib/data";
import { formatDateOnly, formatDateTime } from "@/lib/format";
import { downloadVisitaPdf } from "@/lib/visita-pdf";

export const Route = createFileRoute("/_authenticated/visitas/$visitaId")({
  head: () => ({
    meta: [{ title: "Visita técnica — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: VisitaPage,
});

/** ISO -> value for <input type="datetime-local"> (local time). */
function paraInputLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function AgendarPanel({ visita }: { visita: Visita }) {
  const run = useDataAction();
  const { data: pessoas } = usePessoasDaFuncao(["montagem", "pcp"]);
  const [quando, setQuando] = useState(
    paraInputLocal(visita.agendadaPara) ||
      (visita.dataSugerida ? `${visita.dataSugerida}T09:00` : ""),
  );
  const [quem, setQuem] = useState(visita.responsavelId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQuando(
      paraInputLocal(visita.agendadaPara) ||
        (visita.dataSugerida ? `${visita.dataSugerida}T09:00` : ""),
    );
    setQuem(visita.responsavelId ?? "");
  }, [visita.agendadaPara, visita.responsavelId, visita.dataSugerida]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await run(
      () => visitaRepository.agendar(visita.id, quando, quem),
      visita.status === "agendada"
        ? "Visita reagendada."
        : "Visita agendada. A montagem foi avisada.",
    );
    setSaving(false);
  };

  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      noValidate
    >
      <FormField id="ag-quando" label="Data e hora">
        <Input
          id="ag-quando"
          type="datetime-local"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
        />
      </FormField>
      <FormField id="ag-quem" label="Quem vai">
        <Select value={quem} onValueChange={setQuem}>
          <SelectTrigger id="ag-quem" className="h-10">
            <SelectValue placeholder="Escolha da montagem" />
          </SelectTrigger>
          <SelectContent>
            {visita.responsavelId &&
              !(pessoas ?? []).some((p) => p.id === visita.responsavelId) && (
                <SelectItem value={visita.responsavelId}>{visita.responsavelNome}</SelectItem>
              )}
            {(pessoas ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <Button type="submit" disabled={saving || !quando || !quem} className="h-10">
        <CalendarClock />
        {visita.status === "agendada" ? "Reagendar" : "Agendar"}
      </Button>
    </form>
  );
}

function VisitaPage() {
  const { visitaId } = Route.useParams();
  const { data: v, isPending } = useVisita(visitaId);
  const { data: anexos } = useAnexos("visita", visitaId);
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const back = (
    <Button variant="outline" asChild className="mb-6">
      <Link to="/visitas">
        <ArrowLeft />
        Visitas técnicas
      </Link>
    </Button>
  );

  if (isPending) return <DetailSkeleton />;
  if (!v) {
    return (
      <>
        {back}
        <EmptyState
          icon={SearchX}
          title="Visita não encontrada"
          description="Ela pode ter sido excluída."
        />
      </>
    );
  }

  const isGestor = Boolean(me?.isGestor);
  const agenda = canAgendarVisita(me);
  const realiza = canRealizarVisita(me);
  const encerrada = v.status === "realizada" || v.status === "cancelada";
  const podeEditarSolicitacao = (canSolicitarVisita(me) || agenda) && (!encerrada || isGestor);
  const podeCancelar = !encerrada && (agenda || v.createdBy === me?.id);
  const podeApagar = isGestor || (v.createdBy === me?.id && v.status === "solicitada");
  const vistoriaEditavel =
    realiza && (v.status === "agendada" || (v.status === "realizada" && agenda));
  const temFoto = (anexos ?? []).some((a) => a.tipo === "foto");

  const pdf = async () => {
    try {
      await downloadVisitaPdf(v, "/patty-logo.png");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o PDF.");
    }
  };

  return (
    <>
      {back}
      <PageHeader
        title={`Visita técnica nº ${v.numero}`}
        description={`${v.cliente} · pedida por ${v.createdByNome || "alguém"} em ${formatDateTime(v.createdAt)}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={pdf} className="h-10">
              <FileDown />
              PDF
            </Button>
            {podeApagar && (
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                className="h-10 hover:bg-destructive/10 hover:text-destructive"
                aria-label="Excluir visita"
              >
                <Trash2 />
              </Button>
            )}
          </div>
        }
      />

      <section className="surface-card mb-6 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="min-w-0 flex-1 space-y-1">
            <VisitaStatusBadge status={v.status} />
            <p className="text-sm text-muted-foreground">
              {v.status === "solicitada"
                ? `Aguardando o PCP agendar${v.dataSugerida ? ` (sugestão: ${formatDateOnly(v.dataSugerida)})` : ""}.`
                : v.status === "agendada"
                  ? `${v.agendadaPara ? formatDateTime(v.agendadaPara) : ""} · ${v.responsavelNome || "sem responsável"}${v.agendadoPorNome ? ` · agendada por ${v.agendadoPorNome}` : ""}`
                  : v.status === "realizada"
                    ? `Feita por ${v.realizadaPorNome}${v.realizadaEm ? ` em ${formatDateTime(v.realizadaEm)}` : ""}.`
                    : `Cancelada. Motivo: ${v.motivoCancelamento}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {podeCancelar && (
              <Button variant="outline" className="h-10" onClick={() => setCancelOpen(true)}>
                <XCircle />
                Cancelar visita
              </Button>
            )}
            {v.status === "cancelada" && agenda && (
              <Button
                variant="outline"
                className="h-10"
                onClick={() => run(() => visitaRepository.reabrir(v.id), "Visita reaberta.")}
              >
                <RotateCcw />
                Reabrir
              </Button>
            )}
          </div>
        </div>
        {agenda && (v.status === "solicitada" || v.status === "agendada") && (
          <AgendarPanel visita={v} />
        )}
      </section>

      <VisitaForm
        key={`s-${v.updatedAt}`}
        initial={v}
        readOnly={!podeEditarSolicitacao}
        saving={saving}
        submitLabel="Salvar solicitação"
        onSubmit={async (s) => {
          setSaving(true);
          await run(() => visitaRepository.updateSolicitacao(v.id, s), "Solicitação salva.");
          setSaving(false);
        }}
      />

      {(v.status === "agendada" || v.status === "realizada") && (
        <div className="mt-6">
          <VistoriaForm
            key={`v-${v.updatedAt}`}
            initial={v.vistoria}
            readOnly={!vistoriaEditavel}
            podeConcluir={v.status === "agendada" && realiza}
            temFoto={temFoto}
            saving={saving}
            onSalvar={async (vist) => {
              setSaving(true);
              await run(() => visitaRepository.salvarVistoria(v.id, vist), "Visita salva.");
              setSaving(false);
            }}
            onConcluir={async (vist) => {
              setSaving(true);
              await run(
                () => visitaRepository.concluir(v.id, vist),
                "Visita concluída. O comercial e o PCP foram avisados.",
              );
              setSaving(false);
            }}
          />
        </div>
      )}

      <AnexosPanel
        entidade="visita"
        entidadeId={v.id}
        className="mt-6"
        titulo="Fotos e anexos"
        aviso="Fotografar os espaços é obrigatório para concluir a visita. Os arquivos vão para o Google Drive da empresa."
      />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar a visita nº {v.numero}?</DialogTitle>
            <DialogDescription>
              Quem pediu e quem iria fazer a visita serão avisados.
            </DialogDescription>
          </DialogHeader>
          <FormField id="cancel-motivo" label="Motivo *">
            <Textarea
              id="cancel-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
            />
          </FormField>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={!motivo.trim()}
              onClick={async () => {
                const ok = await run(
                  () => visitaRepository.cancelar(v.id, motivo).then(() => true),
                  "Visita cancelada.",
                );
                if (ok) {
                  setCancelOpen(false);
                  setMotivo("");
                }
              }}
            >
              Cancelar visita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Excluir a visita nº ${v.numero}?`}
        description="Ela vai para a Lixeira, onde fica 30 dias."
        onConfirm={async () => {
          setDeleteOpen(false);
          const ok = await run(
            () => visitaRepository.remove(v.id).then(() => true),
            "Visita excluída.",
          );
          if (ok) void navigate({ to: "/visitas" });
        }}
      />
    </>
  );
}
