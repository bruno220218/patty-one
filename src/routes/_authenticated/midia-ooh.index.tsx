import { lazy, Suspense, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarRange, MapPin, Plus, RotateCcw, SearchX, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { selectClass } from "@/components/app/operacao-ui";
import { useCurrentUser, useDataAction, usePontosMidia, useTiposMidia } from "@/hooks/use-data";
import { canEditarMidia, midiaRepository, STATUS_PONTO, type StatusPonto } from "@/lib/data";

// The map script only loads in the browser, on demand.
const MapaPontos = lazy(() => import("@/components/app/mapa-pontos"));

type Busca = { busca: string; tipo: string; status: "" | StatusPonto };

export const Route = createFileRoute("/_authenticated/midia-ooh/")({
  validateSearch: (s: Record<string, unknown>): Busca => ({
    busca: typeof s["busca"] === "string" ? s["busca"] : "",
    tipo: typeof s["tipo"] === "string" ? s["tipo"] : "",
    status: STATUS_PONTO.includes(s["status"] as StatusPonto) ? (s["status"] as StatusPonto) : "",
  }),
  head: () => ({
    meta: [{ title: "Mapeamento das áreas — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: MidiaPage,
});

function MidiaPage() {
  const filtros = Route.useSearch();
  const navigate = useNavigate();
  const routeNavigate = Route.useNavigate();
  const { data: me } = useCurrentUser();
  const podeEditar = canEditarMidia(me);
  const pontos = usePontosMidia();
  const tipos = useTiposMidia();
  const [tiposAberto, setTiposAberto] = useState(false);

  const mudar = (patch: Partial<Busca>) =>
    void routeNavigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const lista = useMemo(() => {
    const q = filtros.busca.trim().toLowerCase();
    return (pontos.data ?? []).filter(
      (p) =>
        (!filtros.tipo || p.tipoId === filtros.tipo) &&
        (!filtros.status || p.status === filtros.status) &&
        (!q ||
          [p.nome, p.codigo, p.endereco, p.bairro, p.cidade].some((v) =>
            v.toLowerCase().includes(q),
          )),
    );
  }, [pontos.data, filtros]);
  const pins = useMemo(
    () =>
      lista
        .filter((p) => p.latitude !== null && p.longitude !== null)
        .map((p) => ({
          id: p.id,
          lat: p.latitude as number,
          lng: p.longitude as number,
          title: p.nome,
        })),
    [lista],
  );

  return (
    <>
      <PageHeader
        title="Mapeamento das áreas"
        description="Pontos de mídia OOH: tipos, localização no mapa, medidas e fotos."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-10">
              <Link to="/midia-ooh/bissemanas">
                <CalendarRange />
                Datas de colagens
              </Link>
            </Button>
            {me?.isGestor && (
              <Button variant="outline" className="h-10" onClick={() => setTiposAberto(true)}>
                <Tags />
                Tipos de mídia
              </Button>
            )}
            {podeEditar && (
              <Button asChild className="h-10">
                <Link to="/midia-ooh/$pontoId" params={{ pontoId: "novo" }}>
                  <Plus />
                  Novo ponto
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <Suspense fallback={<div className="h-80 rounded-2xl border bg-muted/40" />}>
        <MapaPontos
          pins={pins}
          onSelect={(id) => void navigate({ to: "/midia-ooh/$pontoId", params: { pontoId: id } })}
        />
      </Suspense>

      <div className="mt-4 mb-3 grid gap-3 sm:grid-cols-4">
        <Input
          aria-label="Buscar pontos"
          placeholder="Buscar por nome, código, endereço ou cidade…"
          value={filtros.busca}
          onChange={(e) => mudar({ busca: e.target.value })}
          className="h-10 sm:col-span-2"
        />
        <select
          aria-label="Filtrar tipo de mídia"
          className={selectClass}
          value={filtros.tipo}
          onChange={(e) => mudar({ tipo: e.target.value })}
        >
          <option value="">Todos os tipos</option>
          {(tipos.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar situação"
          className={selectClass}
          value={filtros.status}
          onChange={(e) => mudar({ status: e.target.value as Busca["status"] })}
        >
          <option value="">Todas as situações</option>
          {STATUS_PONTO.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        {lista.length} pontos · {pins.length} no mapa
      </p>

      {pontos.isPending ? (
        <CardGridSkeleton />
      ) : pontos.error ? (
        <EmptyState
          icon={SearchX}
          title="Não foi possível abrir os pontos"
          description={pontos.error.message}
        />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={pontos.data.length ? "Nenhum ponto com esse filtro" : "Nenhum ponto cadastrado"}
          description={
            pontos.data.length
              ? "Mude a busca ou os filtros."
              : "Cadastre o primeiro ponto de mídia."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                {[
                  "Código",
                  "Nome",
                  "Tipo",
                  "Cidade/UF",
                  "Faces",
                  "Medidas",
                  "Situação",
                  "Mapa",
                ].map((h) => (
                  <th key={h} className="p-3 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 whitespace-nowrap">{p.codigo || "—"}</td>
                  <td className="min-w-48 p-3">
                    <Link
                      className="font-medium text-primary hover:underline"
                      to="/midia-ooh/$pontoId"
                      params={{ pontoId: p.id }}
                    >
                      {p.nome}
                    </Link>
                    {p.iluminado && (
                      <span className="ml-2 text-xs text-muted-foreground">iluminado</span>
                    )}
                  </td>
                  <td className="p-3">{p.tipoNome}</td>
                  <td className="p-3">{[p.cidade, p.estado].filter(Boolean).join("/") || "—"}</td>
                  <td className="p-3">{p.faces}</td>
                  <td className="p-3 whitespace-nowrap">
                    {p.largura && p.altura
                      ? `${p.largura.toLocaleString("pt-BR")} × ${p.altura.toLocaleString("pt-BR")} m`
                      : "—"}
                  </td>
                  <td className="p-3">
                    <Badge variant={p.status === "Ativo" ? "secondary" : "outline"}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="p-3">{p.latitude !== null ? "Sim" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {me?.isGestor && <TiposDialog open={tiposAberto} onOpenChange={setTiposAberto} />}
    </>
  );
}

/** Gestão: types offered when registering a point. A type in use is deactivated, not deleted. */
function TiposDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: tipos = [] } = useTiposMidia();
  const run = useDataAction();
  const [nome, setNome] = useState("");

  async function adicionar() {
    const ok = await run(() => midiaRepository.criarTipo(nome).then(() => true), "Tipo adicionado");
    if (ok) setNome("");
  }
  async function remover(id: string) {
    const r = await run(() => midiaRepository.removerTipo(id));
    if (r === "desativado")
      toast.info(
        "Há pontos com esse tipo: ele foi desativado e não aparece mais para novos pontos.",
      );
    if (r === "excluido") toast.success("Tipo excluído");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tipos de mídia</DialogTitle>
          <DialogDescription>Tipos disponíveis ao cadastrar um ponto.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 divide-y overflow-auto rounded-md border">
          {tipos.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className={t.ativo ? "" : "text-muted-foreground line-through"}>{t.nome}</span>
              {t.ativo ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Excluir ${t.nome}`}
                  onClick={() => void remover(t.id)}
                >
                  <Trash2 />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Reativar ${t.nome}`}
                  onClick={() =>
                    void run(() => midiaRepository.reativarTipo(t.id), "Tipo reativado")
                  }
                >
                  <RotateCcw />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nome.trim()) void adicionar();
          }}
        >
          <Input
            aria-label="Novo tipo"
            placeholder="Novo tipo…"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <Button type="submit" disabled={!nome.trim()}>
            Adicionar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
