import { useRef, useState, type DragEvent } from "react";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ANEXO_MAX_BYTES, formatBytes } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Picks files before the record exists (new briefing, new CI). The page uploads them to
 * Drive right after saving, when the record's folder can be named.
 */
export function ArquivosPicker({
  id,
  titulo,
  descricao,
  accept,
  permitido,
  formatos,
  arquivos,
  onChange,
}: {
  id: string;
  titulo: string;
  descricao: string;
  accept: string;
  permitido: (nome: string, mime: string) => boolean;
  formatos: string;
  arquivos: File[];
  onChange: (arquivos: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  const escolher = (lista: FileList | null) => {
    if (!lista) return;
    const novos: File[] = [];
    for (const f of Array.from(lista)) {
      if (!permitido(f.name, f.type)) toast.error(`"${f.name}": envie ${formatos}.`);
      else if (f.size > ANEXO_MAX_BYTES)
        toast.error(
          `"${f.name}" tem ${formatBytes(f.size)}. Pelo app vão até ${formatBytes(ANEXO_MAX_BYTES)}.`,
        );
      else if (!arquivos.some((a) => a.name === f.name && a.size === f.size)) novos.push(f);
    }
    onChange([...arquivos, ...novos]);
    if (ref.current) ref.current.value = "";
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    escolher(e.dataTransfer.files);
  };

  return (
    <section className="surface-card p-5" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="text-sm font-semibold">
        {titulo}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
      <input
        ref={ref}
        id={id}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => escolher(e.target.files)}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
        className={cn(
          "mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-4 transition-colors",
          arrastando ? "border-primary bg-accent" : "border-border",
        )}
      >
        <Button type="button" size="sm" onClick={() => ref.current?.click()}>
          <Upload />
          Escolher arquivo
        </Button>
        <span className="text-xs text-muted-foreground">
          ou arraste aqui · {formatos} · até {formatBytes(ANEXO_MAX_BYTES)}
        </span>
      </div>
      {arquivos.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-lg border">
          {arquivos.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatBytes(f.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Tirar ${f.name}`}
                onClick={() => onChange(arquivos.filter((x) => x !== f))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
