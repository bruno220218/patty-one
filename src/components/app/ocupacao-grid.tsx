import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useCurrentUser, useOcupacao } from "@/hooks/use-data";
import {
  bissemanaAtual,
  bissemanasDoAno,
  canMarcarOcupacao,
  chaveOcupacao,
  criarMapaOcupacao,
  diaMes,
  hojeISO,
  midiaRepository,
  PROXIMO_STATUS,
  statusDoPonto,
  type PeriodoOficial,
  type StatusOcupacao,
} from "@/lib/data";
import { cn } from "@/lib/utils";

const COR: Record<StatusOcupacao, string> = {
  Livre: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400",
  Reservado: "bg-amber-400/20 text-amber-700 hover:bg-amber-400/30 dark:text-amber-400",
  Ocupado: "bg-destructive/10 text-destructive hover:bg-destructive/20",
};

export const COR_STATUS_OCUPACAO = COR;

type Linha = { id: string; nome: string; codigo?: string };

/**
 * Point × bi-week grid. Comercial/Gestão click a cell to cycle
 * Livre → Reservado → Ocupado → Livre; everyone else only looks.
 */
export function OcupacaoGrid({
  pontos,
  ano,
  calendario,
  destacarBissemana,
  onSelecionarBissemana,
}: {
  pontos: Linha[];
  ano: number;
  calendario: PeriodoOficial[];
  /** Column highlighted (the bi-week being filtered). */
  destacarBissemana?: number;
  /** When given, the header becomes a button that picks the bi-week. */
  onSelecionarBissemana?: (numero: number) => void;
}) {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const pode = canMarcarOcupacao(me);
  const [cliente, setCliente] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);
  const unico = pontos.length === 1 ? pontos[0]?.id : undefined;
  const { data = [] } = useOcupacao(ano, unico);
  const mapa = useMemo(() => criarMapaOcupacao(data), [data]);
  const bis = bissemanasDoAno(ano, calendario);
  const atual = bissemanaAtual(hojeISO(), calendario);
  const ths = useRef<Record<number, HTMLTableCellElement | null>>({});

  // The filtered column scrolls into view; otherwise the chosen bi-week can be off screen.
  useEffect(() => {
    if (destacarBissemana != null)
      ths.current[destacarBissemana]?.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
  }, [destacarBissemana, ano]);

  async function alternar(pontoId: string, numero: number) {
    const k = chaveOcupacao(pontoId, numero);
    const prox = PROXIMO_STATUS[statusDoPonto(mapa, pontoId, numero)];
    setSalvando(k);
    try {
      await midiaRepository.marcarOcupacao(pontoId, ano, numero, prox, cliente);
      await queryClient.invalidateQueries({ queryKey: ["midia", "ocupacao", ano] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível marcar.");
    } finally {
      setSalvando(null);
    }
  }

  if (!bis.length) {
    return (
      <p className="text-sm text-muted-foreground">
        O calendário oficial não tem bi-semanas de {ano}.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {(["Livre", "Reservado", "Ocupado"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded", COR[s])} />
            {s}
          </span>
        ))}
        {pode && (
          <Input
            aria-label="Cliente para marcação"
            placeholder="Cliente (opcional) ao reservar/ocupar"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            className="ml-auto h-9 max-w-xs"
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {pode
          ? "Clique numa bi-semana para alternar: Livre → Reservado → Ocupado → Livre."
          : "Só Comercial e Gestão reservam ou ocupam bi-semanas."}
      </p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="text-xs">
          <thead className="bg-muted/60">
            <tr>
              <th className="sticky left-0 z-10 min-w-44 bg-muted p-2 text-left">Ponto</th>
              {bis.map((b) => {
                const destacada = destacarBissemana === b.numero;
                const hoje = atual.ano === ano && atual.numero === b.numero;
                const conteudo = (
                  <>
                    B{b.codigoSige}
                    <div className="font-normal text-muted-foreground">
                      {diaMes(b.inicio)}–{diaMes(b.fim)}
                    </div>
                  </>
                );
                return (
                  <th
                    key={b.numero}
                    ref={(el) => {
                      ths.current[b.numero] = el;
                    }}
                    className={cn(
                      "min-w-16 p-1.5 text-center font-medium whitespace-nowrap",
                      destacada ? "bg-primary/10 text-primary" : hoje && "text-primary",
                    )}
                  >
                    {onSelecionarBissemana ? (
                      <button
                        type="button"
                        aria-pressed={destacada}
                        title={`Filtrar pela bi-semana ${b.codigoSige}`}
                        onClick={() => onSelecionarBissemana(b.numero)}
                        className="w-full rounded px-1 py-0.5 hover:bg-muted"
                      >
                        {conteudo}
                      </button>
                    ) : (
                      conteudo
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="sticky left-0 z-10 bg-card p-2 font-medium">
                  {p.codigo ? `${p.codigo} · ` : ""}
                  {p.nome}
                </td>
                {bis.map((b) => {
                  const o = mapa.get(chaveOcupacao(p.id, b.numero));
                  const s = statusDoPonto(mapa, p.id, b.numero);
                  const destacada = destacarBissemana === b.numero;
                  const titulo = `B${b.codigoSige} · ${s}${o?.cliente ? ` · ${o.cliente}` : ""}`;
                  return (
                    <td key={b.numero} className={cn("p-0.5", destacada && "bg-primary/5")}>
                      <button
                        type="button"
                        disabled={!pode || salvando === chaveOcupacao(p.id, b.numero)}
                        onClick={() => void alternar(p.id, b.numero)}
                        title={titulo}
                        aria-label={`${p.nome}, bi-semana ${b.codigoSige}: ${s}`}
                        className={cn(
                          "block h-9 w-16 truncate rounded px-1 text-2xs font-medium disabled:cursor-default",
                          COR[s],
                          destacada && "ring-1 ring-primary/40",
                          salvando === chaveOcupacao(p.id, b.numero) && "opacity-50",
                        )}
                      >
                        {s === "Livre" ? "" : o?.cliente || s}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {!pontos.length && (
              <tr>
                <td colSpan={bis.length + 1} className="p-8 text-center text-muted-foreground">
                  Nenhum ponto com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
