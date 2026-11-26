import { useEffect, useState } from "react";
import { AlertTriangle, Image as ImageIcon, Loader2, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnexosPanel } from "@/components/app/anexos-panel";
import {
  cadastroRepository,
  CADASTRO_FILTROS_VAZIOS,
  IMAGEM_ACCEPT,
  imagemPermitida,
  type ImagemResumo,
  type StatusProgramacao,
} from "@/lib/data";
import { cn } from "@/lib/utils";

/** Shared look of the operação screens (setor Produção). */
export const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

export const TOM = {
  primario: "border-primary/30 bg-primary/10 text-primary",
  aviso: "border-amber-400/50 bg-amber-400/15 text-amber-700 dark:text-amber-400",
  perigo: "border-destructive/40 bg-destructive/10 text-destructive",
  sucesso: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  neutro: "border-border bg-muted text-muted-foreground",
} as const;

const TOM_ORDEM: Record<string, string> = {
  "Aguardando liberação": TOM.primario,
  Aguardando: TOM.neutro,
  "Em andamento": TOM.aviso,
  Concluída: TOM.sucesso,
  Cancelada: TOM.perigo,
};

export function OrdemStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TOM_ORDEM[status] ?? TOM.neutro,
      )}
    >
      {status}
    </span>
  );
}

export const TOM_STATUS_PROGRAMACAO: Record<StatusProgramacao, string> = {
  Programado: TOM.primario,
  "Em andamento": TOM.aviso,
  Concluído: TOM.sucesso,
  "Não realizado": TOM.perigo,
  "Aguardando equipe": TOM.aviso,
};

export function Kpi({
  icon: Icon,
  label,
  value,
  tom = "primario",
}: {
  icon: typeof Search;
  label: string;
  value: number | string;
  tom?: keyof typeof TOM;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-card p-4 shadow-sm">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </div>
      <div className={cn("flex size-10 items-center justify-center rounded-full border", TOM[tom])}>
        <Icon className="size-5" />
      </div>
    </div>
  );
}

/** Picks a cadastro (client) by name; the search runs in the database. */
export function ClientePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: { id: string; nome: string } | null;
  onChange: (c: { id: string; nome: string } | null) => void;
  disabled?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);
  const r = useQuery({
    queryKey: ["cadastros", "picker", termo],
    enabled: termo.length >= 2 && !value,
    queryFn: async () =>
      (await cadastroRepository.list({ ...CADASTRO_FILTROS_VAZIOS, busca: termo }, 1)).linhas.slice(
        0,
        8,
      ),
  });
  if (value) {
    return (
      <div className="flex h-10 items-center justify-between rounded-md border bg-background px-3 text-sm">
        <span className="truncate">{value.nome}</span>
        {!disabled && (
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => onChange(null)}
          >
            Trocar
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
      <Input
        aria-label="Buscar cliente"
        className="pl-9"
        placeholder="Buscar cliente nos cadastros (opcional)…"
        value={busca}
        disabled={disabled}
        onChange={(e) => setBusca(e.target.value)}
      />
      {termo.length >= 2 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          {r.data?.map((c) => (
            <button
              type="button"
              key={c.id}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onChange({ id: c.id, nome: c.nome });
                setBusca("");
              }}
            >
              {c.nome}
            </button>
          ))}
          {r.data?.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum cadastro encontrado.</p>
          )}
          {r.isFetching && (
            <p className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Buscando…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Links to the images (Drive files) of a service or appointment. */
export function ImagensLinks({ imagens }: { imagens: ImagemResumo[] }) {
  if (!imagens.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={`${imagens.length} imagem(ns) anexada(s)`}>
      {imagens.map((imagem) => (
        <a
          key={imagem.id}
          href={imagem.url}
          target="_blank"
          rel="noreferrer"
          title={imagem.nome}
          className="inline-flex max-w-40 items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[11px] hover:border-primary"
        >
          <ImageIcon className="size-3 shrink-0" />
          <span className="truncate">{imagem.nome}</span>
        </a>
      ))}
    </div>
  );
}

/** Button that opens the Drive images panel of a saved service or appointment. */
export function ImagensButton({
  entidade,
  entidadeId,
  quantidade = 0,
  disabled = false,
}: {
  entidade: "programacao" | "agendamento";
  entidadeId: string;
  quantidade?: number;
  disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const queryClient = useQueryClient();
  const fechar = (v: boolean) => {
    setAberto(v);
    // Counters and WhatsApp links on the operação screens pick up the new images.
    if (!v) void queryClient.invalidateQueries({ queryKey: ["operacao"] });
  };
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative size-8"
        aria-label="Imagens do serviço"
        title={disabled ? "Salve antes de adicionar imagens" : "Ver ou adicionar imagens"}
        disabled={disabled}
        onClick={() => setAberto(true)}
      >
        <ImageIcon />
        {quantidade > 0 && (
          <span className="absolute -top-0.5 -right-0.5 rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
            {quantidade}
          </span>
        )}
      </Button>
      {aberto && (
        <Dialog open onOpenChange={fechar}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Imagens</DialogTitle>
              <DialogDescription>
                As imagens vão para o Google Drive da empresa; os links entram no texto do WhatsApp.
              </DialogDescription>
            </DialogHeader>
            <AnexosPanel
              entidade={entidade}
              entidadeId={entidadeId}
              titulo="Imagens"
              accept={IMAGEM_ACCEPT}
              permitido={imagemPermitida}
              formatos="imagens (JPG, PNG, WEBP ou GIF)"
              rotuloBotao="Adicionar imagens"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** "Recurso compartilhado": only a warning; confirming saves anyway. */
export function ConfirmacaoConflitos({
  mensagens,
  salvando,
  onConfirmar,
  onCancelar,
}: {
  mensagens: string[];
  salvando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <AlertDialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) onCancelar();
      }}
    >
      <AlertDialogContent className="rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-600" />
            Confirmar recursos compartilhados
          </AlertDialogTitle>
          <AlertDialogDescription>
            Isso é apenas um aviso e não impede o salvamento.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className={cn("max-h-72 space-y-2 overflow-y-auto rounded-xl border p-3", TOM.aviso)}>
          {mensagens.map((m, i) => (
            <p key={`${i}-${m}`} className="text-sm text-foreground">
              {m}
            </p>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={salvando} onClick={onCancelar}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={salvando}
            onClick={(e) => {
              e.preventDefault();
              onConfirmar();
            }}
          >
            {salvando && <Loader2 className="animate-spin" />}
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
