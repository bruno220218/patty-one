import { History } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { usePainelHistorico } from "@/hooks/use-data";
import {
  VINHETA_TIPO_LABEL,
  type Painel,
  type PainelHistoricoItem,
  type VinhetaTipo,
} from "@/lib/data";
import { formatDateOnly, formatDateTime } from "@/lib/format";

const CAMPO_LABEL: Record<string, string> = {
  posicao: "espaço",
  cliente: "cliente",
  ci: "CI",
  tipo: "tipo",
  inicio: "início",
  fim: "fim",
  representante_nome: "representante",
  duracao_seg: "duração",
  loop: "loop",
  insercoes_dia: "inserções/dia",
  observacao: "observação",
};

function valor(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if ((campo === "inicio" || campo === "fim") && typeof v === "string") return formatDateOnly(v);
  if (campo === "tipo") return VINHETA_TIPO_LABEL[v as VinhetaTipo] ?? String(v);
  if (campo === "duracao_seg") return `${v}s`;
  if (campo === "posicao") return `${v}º`;
  return String(v);
}

function Linha({ item }: { item: PainelHistoricoItem }) {
  const onde = item.posicao ? ` (espaço ${item.posicao})` : "";
  const quem = <span className="font-semibold">{item.feitoPorNome}</span>;
  const cliente = <span className="font-medium">{item.cliente}</span>;
  return (
    <li className="space-y-1 px-1 py-3">
      <p className="text-sm">
        {item.acao === "criada" && (
          <>
            {quem} colocou {cliente}
            {onde}
          </>
        )}
        {item.acao === "importada" && (
          <>
            {cliente}
            {onde} veio da planilha
          </>
        )}
        {item.acao === "retirada" && (
          <>
            {quem} retirou {cliente}
            {onde}
          </>
        )}
        {item.acao === "alterada" && (
          <>
            {quem} alterou {cliente}
            {onde}
          </>
        )}
      </p>
      {item.acao === "alterada" && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {Object.entries(item.mudancas).map(([campo, m]) => (
            <li key={campo}>
              {CAMPO_LABEL[campo] ?? campo}: {valor(campo, m.de)} → {valor(campo, m.para)}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
    </li>
  );
}

/** Every change made to a panel's vinhetas, newest first, with who did it. */
export function PainelHistoricoSheet({
  painel,
  open,
  onOpenChange,
}: {
  painel: Painel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isPending, error } = usePainelHistorico(open ? painel.id : null);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico · {painel.codigo}
          </SheetTitle>
          <SheetDescription>Quem colocou, alterou ou retirou cada vinheta.</SheetDescription>
        </SheetHeader>
        {isPending ? (
          <p className="mt-6 text-sm text-muted-foreground">Carregando…</p>
        ) : error ? (
          <p className="mt-6 text-sm text-destructive">{error.message}</p>
        ) : !data || data.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Nenhuma mudança registrada.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {data.map((item) => (
              <Linha key={item.id} item={item} />
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
