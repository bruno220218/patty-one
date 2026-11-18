import { useRef, useState, type FormEvent } from "react";
import {
  ExternalLink,
  FileAudio,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useAnexos, useCurrentUser, useDataAction } from "@/hooks/use-data";
import {
  ANEXO_ACCEPT,
  ANEXO_MAX_BYTES,
  ANEXO_TIPOS,
  anexosRepository,
  arquivoPermitido,
  formatBytes,
  linkValido,
  type Anexo,
  type AnexoEntidade,
  type AnexoTipo,
} from "@/lib/data";
import { anexarArquivo } from "@/lib/drive-upload";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const ICONE: Record<AnexoTipo, typeof FileText> = {
  pdf: FileText,
  foto: ImageIcon,
  video: FileVideo,
  audio: FileAudio,
  outro: Paperclip,
};

/**
 * Attachments of a liberação, briefing or visita. Files go straight to the company's
 * Google Drive (or a Drive link is pasted); the app keeps only the link.
 */
export function AnexosPanel({
  entidade,
  entidadeId,
  canAdd = true,
  titulo = "Anexos",
  aviso,
  className,
  accept = ANEXO_ACCEPT,
  permitido = arquivoPermitido,
  formatos = "PDF, PNG, JPG, MP4 ou MP3",
  rotuloBotao = "Anexar arquivo",
}: {
  entidade: AnexoEntidade;
  entidadeId: string;
  canAdd?: boolean;
  titulo?: string;
  /** Extra hint under the title (e.g. "fotos obrigatórias"). */
  aviso?: string;
  className?: string;
  /** File picker filter (defaults to PDF, images, MP4 and MP3). */
  accept?: string;
  permitido?: (nome: string, mime: string) => boolean;
  /** Shown when a file isn't accepted: "envie {formatos}". */
  formatos?: string;
  rotuloBotao?: string;
}) {
  const { data: anexos, isPending } = useAnexos(entidade, entidadeId);
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<string[]>([]);
  const [modoLink, setModoLink] = useState(false);
  const [link, setLink] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<AnexoTipo>("foto");
  const [removendo, setRemovendo] = useState<Anexo | null>(null);

  const atualizar = () =>
    queryClient.invalidateQueries({ queryKey: ["anexos", entidade, entidadeId] });

  const enviarArquivos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (!permitido(file.name, file.type)) {
        toast.error(`"${file.name}": envie ${formatos}.`);
        continue;
      }
      if (file.size > ANEXO_MAX_BYTES) {
        toast.error(
          `"${file.name}" tem ${formatBytes(file.size)}. Pelo app vão até ${formatBytes(ANEXO_MAX_BYTES)}: suba no Drive e use "Colar link".`,
        );
        continue;
      }
      setEnviando((e) => [...e, file.name]);
      try {
        await anexarArquivo(file, entidade, entidadeId);
        toast.success(`"${file.name}" enviado para o Drive.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Não foi possível enviar "${file.name}".`);
      } finally {
        setEnviando((e) => e.filter((n) => n !== file.name));
        await atualizar();
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const salvarLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!linkValido(link)) {
      toast.error("Cole um link válido (começando com https://).");
      return;
    }
    const ok = await run(
      () =>
        anexosRepository
          .add({ entidade, entidadeId, url: link, nome: nome || "Link do Drive", tipo })
          .then(() => true),
      "Link adicionado.",
    );
    if (ok) {
      setLink("");
      setNome("");
      setModoLink(false);
    }
  };

  if (anexos === null) {
    return (
      <section className={cn("surface-card p-5", className)}>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          {titulo}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Os anexos ainda não foram ativados no banco.
        </p>
      </section>
    );
  }

  return (
    <section className={cn("surface-card p-5", className)} aria-label={titulo}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            {titulo}
            {anexos && anexos.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                {anexos.length}
              </span>
            )}
          </h2>
          {aviso && <p className="mt-1 text-xs text-muted-foreground">{aviso}</p>}
        </div>
        {canAdd && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={accept}
              className="hidden"
              onChange={(e) => void enviarArquivos(e.target.files)}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <Upload />
              {rotuloBotao}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModoLink((v) => !v)}>
              <Link2 />
              Colar link
            </Button>
          </div>
        )}
      </div>

      {modoLink && canAdd && (
        <form
          onSubmit={salvarLink}
          className="mt-4 space-y-2 rounded-lg border border-border p-3"
          noValidate
        >
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://drive.google.com/…"
            aria-label="Link"
            autoFocus
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome (ex.: Fotos da fachada)"
              aria-label="Nome do anexo"
              className="sm:flex-1"
            />
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Tipo">
              {ANEXO_TIPOS.map((t) => (
                <Button
                  key={t.value}
                  type="button"
                  size="sm"
                  variant={tipo === t.value ? "default" : "outline"}
                  onClick={() => setTipo(t.value)}
                  role="radio"
                  aria-checked={tipo === t.value}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            No Drive, compartilhe como "Qualquer pessoa da pattynet com o link" para a equipe
            conseguir abrir.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setModoLink(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!link.trim()}>
              <Plus />
              Adicionar link
            </Button>
          </div>
        </form>
      )}

      <ul className="mt-4 divide-y divide-border">
        {enviando.map((n) => (
          <li
            key={`up-${n}`}
            className="flex items-center gap-3 py-2 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            <span className="truncate">Enviando {n} para o Drive…</span>
          </li>
        ))}
        {!isPending && (anexos ?? []).length === 0 && enviando.length === 0 && (
          <li className="py-2 text-sm text-muted-foreground">Nenhum anexo.</li>
        )}
        {(anexos ?? []).map((a) => {
          const Icon = ICONE[a.tipo];
          const podeRemover = Boolean(me && (me.isGestor || a.createdBy === me.id));
          return (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 hover:underline"
              >
                <span className="flex items-center gap-1 truncate text-sm font-medium">
                  <span className="truncate">{a.nome}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[a.createdByNome, formatDateTime(a.createdAt), formatBytes(a.tamanho)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </a>
              {podeRemover && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ${a.nome}`}
                  onClick={() => setRemovendo(a)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={removendo !== null}
        onOpenChange={(open) => !open && setRemovendo(null)}
        title="Remover anexo?"
        description={`"${removendo?.nome ?? ""}" sai daqui. ${removendo?.driveId ? "O arquivo continua guardado no Google Drive." : ""}`}
        confirmLabel="Remover"
        onConfirm={async () => {
          const alvo = removendo;
          setRemovendo(null);
          if (alvo) await run(() => anexosRepository.remove(alvo.id), "Anexo removido.");
        }}
      />
    </section>
  );
}
