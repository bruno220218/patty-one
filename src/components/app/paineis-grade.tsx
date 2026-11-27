import { useState } from "react";
import { Pencil, Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VINHETA_TIPO_LABEL, type Painel, type Vinheta, type VinhetaSituacao } from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VinhetaSituacaoPill } from "./vinheta-situacao";
import { SITUACAO_FUNDO, TIPO_PONTO, TIPO_TEXTO } from "./vinheta-cores";

const periodo = (v: Vinheta) =>
  v.inicio || v.fim
    ? `${v.inicio ? formatDateOnly(v.inicio) : "…"} a ${v.fim ? formatDateOnly(v.fim) : "sem fim"}`
    : "—";

function Detalhe({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

function Celula({
  v,
  s,
  painel,
  podeEditar,
  onEditar,
  onRetirar,
}: {
  v: Vinheta;
  s: VinhetaSituacao;
  painel: Painel;
  podeEditar: boolean;
  onEditar: (v: Vinheta) => void;
  onRetirar: (v: Vinheta) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "block w-full truncate rounded px-1.5 py-1 text-left text-xs font-medium transition-colors hover:ring-1 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            TIPO_TEXTO[v.tipo],
            SITUACAO_FUNDO[s.tipo],
          )}
          title={`${v.cliente} · ${periodo(v)}`}
        >
          {v.cliente}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3 p-4" align="start">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">
            {painel.codigo} · espaço {v.posicao}
          </p>
          <p className="break-words font-semibold leading-tight">{v.cliente}</p>
          <VinhetaSituacaoPill situacao={s} />
        </div>
        <div className="space-y-1">
          <Detalhe label="Tipo" value={VINHETA_TIPO_LABEL[v.tipo]} />
          <Detalhe label="CI" value={v.ci} />
          <Detalhe label="Período" value={periodo(v)} />
          <Detalhe label="Representante" value={v.representanteNome} />
          {v.tipo !== "indisponivel" && (
            <Detalhe
              label="Exibição"
              value={`${v.duracaoSeg}s · ${v.loop} · ${v.insercoesDia}/dia`}
            />
          )}
          {v.observacao && <Detalhe label="Obs." value={v.observacao} />}
        </div>
        <p className="text-xs text-muted-foreground">
          Última alteração: {v.updatedByNome || "—"}
        </p>
        {podeEditar && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1"
              onClick={() => {
                setOpen(false);
                onEditar(v);
              }}
            >
              <Pencil />
              Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1"
              onClick={() => {
                setOpen(false);
                onRetirar(v);
              }}
            >
              <Undo2 />
              Retirar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** All panels side by side, slot by slot, like the spreadsheet. */
export function PaineisGrade({
  paineis,
  vinhetas,
  situacoes,
  pendentes,
  podeEditar,
  onEditar,
  onRetirar,
  onOcupar,
  onAbrirPainel,
}: {
  paineis: Painel[];
  vinhetas: Vinheta[];
  situacoes: Map<string, VinhetaSituacao>;
  /** Vinhetas waiting to enter, per panel id. */
  pendentes: Map<string, number>;
  podeEditar: boolean;
  onEditar: (v: Vinheta) => void;
  onRetirar: (v: Vinheta) => void;
  onOcupar: (painel: Painel, posicao: number) => void;
  onAbrirPainel: (id: string) => void;
}) {
  const max = Math.max(0, ...paineis.map((p) => p.espacos));
  const porEspaco = new Map(vinhetas.map((v) => [`${v.painelId}:${v.posicao}`, v] as const));
  const ocupados = new Map<string, number>();
  for (const v of vinhetas) ocupados.set(v.painelId, (ocupados.get(v.painelId) ?? 0) + 1);

  return (
    <>
      <div className="surface-card overflow-x-auto">
        <table className="w-full min-w-[56rem] table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-9" />
            {paineis.map((p) => (
              <col key={p.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-10 bg-card px-1 py-2 text-xs font-medium text-muted-foreground">
                Nº
              </th>
              {paineis.map((p) => {
                const vagos = p.espacos - (ocupados.get(p.id) ?? 0);
                const pend = pendentes.get(p.id) ?? 0;
                return (
                  <th key={p.id} className="border-l px-1.5 py-2 text-left align-top font-normal">
                    <button
                      type="button"
                      onClick={() => onAbrirPainel(p.id)}
                      className="block w-full text-left hover:underline"
                    >
                      <span className="block text-xs font-semibold">{p.codigo}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.nome.replace(/^Painel\s+/i, "")}
                      </span>
                    </button>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <span
                        className={cn(
                          "rounded px-1 text-2xs font-semibold tabular-nums",
                          vagos === 0
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {vagos === 0 ? "cheio" : `${vagos} vaga${vagos === 1 ? "" : "s"}`}
                      </span>
                      {pend > 0 && (
                        <span className="rounded bg-status-progress px-1 text-2xs font-semibold text-status-progress-foreground">
                          +{pend} p/ entrar
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: max }, (_, i) => i + 1).map((pos) => (
              <tr key={pos} className="border-b last:border-0">
                <td className="sticky left-0 z-10 bg-card px-1 py-0.5 text-center text-xs tabular-nums text-muted-foreground">
                  {pos}
                </td>
                {paineis.map((p) => {
                  if (pos > p.espacos) {
                    return <td key={p.id} className="border-l bg-muted/40" aria-hidden />;
                  }
                  const v = porEspaco.get(`${p.id}:${pos}`);
                  return (
                    <td key={p.id} className="border-l px-0.5 py-0.5">
                      {v ? (
                        <Celula
                          v={v}
                          s={situacoes.get(v.id) ?? { tipo: "no_ar" }}
                          painel={p}
                          podeEditar={podeEditar}
                          onEditar={onEditar}
                          onRetirar={onRetirar}
                        />
                      ) : podeEditar ? (
                        <button
                          type="button"
                          onClick={() => onOcupar(p, pos)}
                          className="group flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                          aria-label={`Ocupar ${p.codigo} espaço ${pos}`}
                        >
                          <Plus className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                          vago
                        </button>
                      ) : (
                        <span className="block px-1.5 py-1 text-xs text-muted-foreground/70">
                          vago
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {(["venda", "permuta", "camp_patty", "doacao", "reserva", "evento"] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", TIPO_PONTO[t])} />
            {VINHETA_TIPO_LABEL[t]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-5 rounded-sm", SITUACAO_FUNDO.vencendo)} />
          Vence em até 7 dias
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-5 rounded-sm", SITUACAO_FUNDO.vencida)} />
          Vencida
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-5 rounded-sm", SITUACAO_FUNDO.agendada)} />
          Ainda vai entrar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-5 rounded-sm", SITUACAO_FUNDO.indisponivel)} />
          Indisponível
        </span>
      </div>
    </>
  );
}
