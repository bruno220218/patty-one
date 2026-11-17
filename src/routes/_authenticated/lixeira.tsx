import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser, useDataAction, useLixeira } from "@/hooks/use-data";
import { lixeiraRepository, type LixeiraItem } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/lixeira")({
  head: () => ({
    meta: [
      { title: "Lixeira — Patty One" },
      {
        name: "description",
        content: "Itens apagados nos últimos 30 dias. Restaure quando precisar.",
      },
    ],
  }),
  component: LixeiraPage,
});

const DIAS = 30;

function diasRestantes(apagadoEm: string): number {
  const fim = new Date(apagadoEm).getTime() + DIAS * 86_400_000;
  return Math.max(0, Math.ceil((fim - Date.now()) / 86_400_000));
}

function LixeiraPage() {
  const { data: itens, isPending } = useLixeira();
  const { data: me } = useCurrentUser();
  const run = useDataAction();
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<string>("todos");
  const [apagando, setApagando] = useState<LixeiraItem | null>(null);
  const [restaurando, setRestaurando] = useState<number | null>(null);

  const tipos = useMemo(() => [...new Set((itens ?? []).map((i) => i.tipo))].sort(), [itens]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (itens ?? []).filter(
      (i) =>
        (tipo === "todos" || i.tipo === tipo) &&
        (!q || `${i.rotulo} ${i.detalhe} ${i.apagadoPorNome}`.toLowerCase().includes(q)),
    );
  }, [itens, busca, tipo]);

  const restaurar = async (item: LixeiraItem) => {
    setRestaurando(item.lote);
    await run(() => lixeiraRepository.restaurar(item.lote), `${item.tipo} restaurado(a).`);
    setRestaurando(null);
  };

  return (
    <>
      <PageHeader
        title="Lixeira"
        description={
          me?.isGestor
            ? `Tudo o que foi apagado nos últimos ${DIAS} dias. Depois disso, some de vez.`
            : `O que você apagou nos últimos ${DIAS} dias. Depois disso, some de vez.`
        }
      />

      {isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : !itens || itens.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="Lixeira vazia"
          description="Projetos, tarefas, liberações e checklists apagados aparecem aqui por 30 dias."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar pelo nome, projeto ou quem apagou"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["todos", ...tipos].map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={tipo === t ? "default" : "outline"}
                  onClick={() => setTipo(t)}
                >
                  {t === "todos" ? "Todos" : t}
                </Button>
              ))}
            </div>
          </div>

          {filtrados.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nada encontrado com esse filtro.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtrados.map((item) => {
                const dias = diasRestantes(item.apagadoEm);
                return (
                  <li
                    key={item.lote}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{item.tipo}</Badge>
                        <span className="break-words font-medium">
                          {item.rotulo || "(sem nome)"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.detalhe && <>{item.detalhe} · </>}
                        {item.junto && <>junto: {item.junto} · </>}
                        apagado por {item.apagadoPorNome || "alguém"}{" "}
                        <span title={format(new Date(item.apagadoEm), "dd/MM/yyyy HH:mm")}>
                          há {formatDistanceToNowStrict(new Date(item.apagadoEm), { locale: ptBR })}
                        </span>{" "}
                        · {dias === 0 ? "some hoje" : `some em ${dias} dia${dias === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        onClick={() => restaurar(item)}
                        disabled={restaurando !== null}
                      >
                        <RotateCcw className="mr-1.5 h-4 w-4" />
                        {restaurando === item.lote ? "Restaurando…" : "Restaurar"}
                      </Button>
                      {me?.isGestor && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setApagando(item)}
                          aria-label="Apagar de vez"
                          title="Apagar de vez"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        open={apagando !== null}
        onOpenChange={(open) => !open && setApagando(null)}
        title="Apagar de vez?"
        description={`"${apagando?.rotulo ?? ""}" sai da lixeira e não poderá mais ser restaurado(a).`}
        onConfirm={() => {
          if (apagando) run(() => lixeiraRepository.apagarDeVez(apagando.lote), "Apagado de vez.");
          setApagando(null);
        }}
      />
    </>
  );
}
