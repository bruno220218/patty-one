import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Link2, Loader2, MapPin, Plus, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/app/operacao-ui";
import { useCurrentUser, useDataAction } from "@/hooks/use-data";
import {
  canAgendarVisita,
  canCriarBriefing,
  canGerirOperacao,
  canSolicitarVisita,
  dataBR,
} from "@/lib/data";
import {
  STATUS_VINCULADO_LABEL,
  vinculosRepository,
  type TipoVinculado,
  type Vinculado,
} from "@/lib/data/cloud-vinculos";

/**
 * Briefings and visitas técnicas of a pedido or a production order (0041). On a pedido it also
 * shows what was linked to the proposta it came from and to its orders; on an order, what was
 * linked to its pedido — so work done before the pedido shows up on the order too.
 */
export function VinculosBriefingVisita({
  vendaId,
  ordemId,
  className,
}: {
  /** Pedido page (or proposta). */
  vendaId?: string;
  /** Order page. */
  ordemId?: string;
  className?: string;
}) {
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const alvo = { vendaId: vendaId ?? null, ordemId: ordemId ?? null };
  const lista = useQuery({
    queryKey: ["vinculos-briefing-visita", alvo.vendaId, alvo.ordemId],
    queryFn: () => vinculosRepository.listar(alvo),
  });
  const podeBriefing = canCriarBriefing(me) || canGerirOperacao(me);
  const podeVisita = canSolicitarVisita(me) || canAgendarVisita(me);
  const [tipo, setTipo] = useState<TipoVinculado>(podeBriefing ? "briefing" : "visita");
  const [numero, setNumero] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const pode = (t: TipoVinculado) => (t === "briefing" ? podeBriefing : podeVisita);

  async function ligar() {
    const n = Number(numero);
    if (!Number.isInteger(n) || n <= 0) return;
    setOcupado(true);
    // On an order the pedido comes along with it (the database fills it in).
    const ok = await run(
      () => vinculosRepository.vincular(tipo, n, alvo).then(() => true),
      `${tipo === "briefing" ? "Briefing" : "Visita"} nº ${n} ligado.`,
    );
    setOcupado(false);
    if (ok) setNumero("");
  }

  /** Directly linked here (not only through the proposta or another order). */
  const direto = (v: Vinculado) =>
    ordemId ? v.ordemId === ordemId : v.vendaId === vendaId && !v.ordemId;

  function desligar(v: Vinculado) {
    // On an order only the order link goes; the pedido stays.
    void run(
      () =>
        vinculosRepository.vincular(
          v.tipo,
          v.numero,
          ordemId ? { vendaId: v.vendaId, ordemId: null } : { vendaId: null, ordemId: null },
        ),
      "Vínculo removido.",
    );
  }

  return (
    <section className={`space-y-3 rounded-2xl border bg-card p-5 shadow-sm ${className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Link2 className="size-4" />
            Briefings e visitas técnicas
          </h2>
          <p className="text-sm text-muted-foreground">
            {ordemId
              ? "Os ligados a esta ordem e ao pedido dela (inclusive os feitos na proposta)."
              : "Os ligados a este pedido, à proposta de onde veio e às ordens dele."}
          </p>
        </div>
        {vendaId && (
          <div className="flex flex-wrap gap-2">
            {canCriarBriefing(me) && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/briefings/novo" search={{ destino: "criacao", venda: vendaId }}>
                  <Plus />
                  Novo briefing
                </Link>
              </Button>
            )}
            {canSolicitarVisita(me) && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/visitas/nova" search={{ venda: vendaId }}>
                  <Plus />
                  Solicitar visita
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      {lista.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : lista.error ? (
        <p className="text-sm text-destructive">{lista.error.message}</p>
      ) : !lista.data?.length ? (
        <p className="text-sm text-muted-foreground">Nenhum briefing ou visita ligado ainda.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {lista.data.map((v) => (
            <li key={`${v.tipo}-${v.id}`} className="flex items-center gap-3 p-3 text-sm">
              {v.tipo === "briefing" ? (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <Link
                  to={v.tipo === "briefing" ? "/briefings/$briefingId" : "/visitas/$visitaId"}
                  params={v.tipo === "briefing" ? { briefingId: v.id } : { visitaId: v.id }}
                  className="block truncate font-medium text-primary hover:underline"
                >
                  {v.tipo === "briefing" ? "Briefing" : "Visita"} nº {v.numero} · {v.titulo}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {STATUS_VINCULADO_LABEL[v.status] ?? v.status} · {dataBR(v.createdAt)}
                  {!direto(v) &&
                    (ordemId
                      ? " · pelo pedido"
                      : v.ordemId
                        ? " · por uma ordem do pedido"
                        : " · da proposta")}
                </span>
              </div>
              {direto(v) && pode(v.tipo) && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Desligar"
                  title="Desligar"
                  onClick={() => desligar(v)}
                >
                  <Unlink />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {(podeBriefing || podeVisita) && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Tipo"
            className={`${selectClass} w-auto`}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoVinculado)}
          >
            {podeBriefing && <option value="briefing">Briefing nº</option>}
            {podeVisita && <option value="visita">Visita nº</option>}
          </select>
          <Input
            aria-label="Número"
            inputMode="numeric"
            className="w-24"
            placeholder="123"
            value={numero}
            onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && void ligar()}
          />
          <Button variant="outline" disabled={!numero || ocupado} onClick={() => void ligar()}>
            {ocupado ? <Loader2 className="animate-spin" /> : <Link2 />}
            Ligar existente
          </Button>
        </div>
      )}
    </section>
  );
}
