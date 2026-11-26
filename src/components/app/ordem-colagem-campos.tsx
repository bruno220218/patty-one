import { Label } from "@/components/ui/label";
import { selectClass } from "@/components/app/operacao-ui";
import { useCalendarioBissemanas, usePontosMidia } from "@/hooks/use-data";
import { bissemanasParaOrdem, dataBR, hojeISO, type PontoMidia } from "@/lib/data";

/** Address of a media point, for the order's "local". */
export function enderecoDoPonto(p: PontoMidia): string {
  return [p.endereco, p.bairro, p.cidade]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Colagem order (0042): the media point and the bi-semana. Choosing a point fills the local
 * when it is still empty (done by the caller through `onPonto`).
 */
export function ColagemCampos({
  pontoId,
  bissemana,
  disabled,
  onPonto,
  onBissemana,
}: {
  pontoId: string;
  bissemana: { ano: number; numero: number } | null;
  disabled: boolean;
  onPonto: (ponto: PontoMidia | null) => void;
  onBissemana: (b: { ano: number; numero: number } | null) => void;
}) {
  const pontos = usePontosMidia();
  const calendario = useCalendarioBissemanas();
  const lista = (pontos.data ?? []).filter((p) => p.status === "Ativo" || p.id === pontoId);
  const opcoes = bissemanasParaOrdem(calendario.data ?? [], hojeISO(), bissemana);
  const valorBs = bissemana ? `${bissemana.ano}-${bissemana.numero}` : "";
  return (
    <>
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="ponto">Ponto de mídia</Label>
        <select
          id="ponto"
          className={selectClass}
          value={pontoId}
          disabled={disabled || pontos.isPending}
          onChange={(e) => onPonto(lista.find((p) => p.id === e.target.value) ?? null)}
        >
          <option value="">Escolha o ponto</option>
          {lista.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo ? `${p.codigo} — ` : ""}
              {p.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="bissemana">Bi-semana</Label>
        <select
          id="bissemana"
          className={selectClass}
          value={valorBs}
          disabled={disabled || calendario.isPending}
          onChange={(e) => {
            const p = opcoes.find((x) => `${x.ano}-${x.numero}` === e.target.value);
            onBissemana(p ? { ano: p.ano, numero: p.numero } : null);
          }}
        >
          <option value="">Sem bi-semana</option>
          {opcoes.map((p) => (
            <option key={`${p.ano}-${p.numero}`} value={`${p.ano}-${p.numero}`}>
              BS {String(p.numero).padStart(2, "0")}/{p.ano} · {dataBR(p.inicio)} a {dataBR(p.fim)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
