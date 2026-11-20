import { lazy, Suspense, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Loader2, LocateFixed, MapPin, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { AnexosPanel } from "@/components/app/anexos-panel";
import { OcupacaoGrid } from "@/components/app/ocupacao-grid";
import { selectClass } from "@/components/app/operacao-ui";
import {
  useCalendarioBissemanas,
  useCurrentUser,
  useDataAction,
  usePontoMidia,
  useTiposMidia,
} from "@/hooks/use-data";
import {
  bissemanaAtual,
  canEditarMidia,
  hojeISO,
  IMAGEM_ACCEPT,
  imagemPermitida,
  linkMapa,
  midiaRepository,
  parseCoord,
  STATUS_PONTO,
  validarPonto,
  type PontoForm,
  type PontoMidia,
  type StatusPonto,
  type TipoMidia,
} from "@/lib/data";

const MapaPontos = lazy(() => import("@/components/app/mapa-pontos"));

/** "/midia-ooh/novo" opens an empty point. */
export const Route = createFileRoute("/_authenticated/midia-ooh/$pontoId")({
  head: () => ({
    meta: [{ title: "Ponto de mídia — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: PontoPage,
});

function PontoPage() {
  const { pontoId } = Route.useParams();
  const novo = pontoId === "novo";
  const tipos = useTiposMidia();
  const ponto = usePontoMidia(novo ? "" : pontoId);
  if (tipos.isPending || (!novo && ponto.isPending)) return <CardGridSkeleton />;
  if (tipos.error || (!novo && (ponto.error || !ponto.data))) {
    return (
      <EmptyState
        icon={MapPin}
        title="Ponto não encontrado"
        description={(tipos.error ?? ponto.error)?.message ?? "Ele pode ter sido excluído."}
      />
    );
  }
  const doc = novo ? undefined : ponto.data;
  return <Editor key={doc ? `${doc.id}-${doc.updatedAt}` : "novo"} tipos={tipos.data} doc={doc} />;
}

const dec = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

function formDoPonto(p: PontoMidia | undefined): PontoForm {
  return {
    codigo: p?.codigo ?? "",
    nome: p?.nome ?? "",
    tipoId: p?.tipoId ?? "",
    endereco: p?.endereco ?? "",
    bairro: p?.bairro ?? "",
    cidade: p?.cidade ?? "",
    estado: p?.estado ?? "",
    referencia: p?.referencia ?? "",
    latitude: dec(p?.latitude ?? null),
    longitude: dec(p?.longitude ?? null),
    faces: String(p?.faces ?? 1),
    largura: dec(p?.largura ?? null),
    altura: dec(p?.altura ?? null),
    iluminado: p?.iluminado ?? false,
    status: p?.status ?? "Ativo",
    observacao: p?.observacao ?? "",
  };
}

function Editor({ tipos, doc }: { tipos: TipoMidia[]; doc: PontoMidia | undefined }) {
  const navigate = useNavigate();
  const run = useDataAction();
  const { data: me } = useCurrentUser();
  const { data: calendario = [] } = useCalendarioBissemanas();
  const podeEditar = canEditarMidia(me);
  const bloqueado = !podeEditar;
  const [f, setF] = useState<PontoForm>(() => formDoPonto(doc));
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const set = (p: Partial<PontoForm>) => setF((a) => ({ ...a, ...p }));

  const lat = parseCoord(f.latitude, "lat");
  const lng = parseCoord(f.longitude, "lng");
  const temPosicao = typeof lat === "number" && typeof lng === "number";
  const pins = useMemo(
    () =>
      temPosicao
        ? [{ id: "p", lat: lat as number, lng: lng as number, title: f.nome || "Ponto" }]
        : [],
    [temPosicao, lat, lng, f.nome],
  );
  const escolher = (a: number, b: number) =>
    set({ latitude: a.toFixed(6).replace(".", ","), longitude: b.toFixed(6).replace(".", ",") });
  const ano = bissemanaAtual(hojeISO(), calendario).ano;

  async function salvar() {
    const erro = validarPonto(f);
    if (erro) {
      toast.error(erro);
      return;
    }
    setSalvando(true);
    const id = await run(
      () => midiaRepository.salvarPonto(f, doc?.id),
      doc ? "Ponto atualizado" : "Ponto cadastrado",
    );
    setSalvando(false);
    if (id && !doc) navigate({ to: "/midia-ooh/$pontoId", params: { pontoId: id }, replace: true });
  }

  async function excluir() {
    if (!doc) return;
    const ok = await run(
      () => midiaRepository.excluirPonto(doc.id).then(() => true),
      "Ponto excluído",
    );
    if (ok) navigate({ to: "/midia-ooh", search: { busca: "", tipo: "", status: "" } });
  }

  function minhaLocalizacao() {
    if (!navigator.geolocation) {
      toast.error("Este aparelho não informa a localização.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => escolher(p.coords.latitude, p.coords.longitude),
      () => toast.error("Não foi possível obter sua localização."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const campo = (
    id: keyof PontoForm,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`p-${id}`}>{label}</Label>
      <Input
        id={`p-${id}`}
        value={f[id] as string}
        disabled={bloqueado}
        onChange={(e) => set({ [id]: e.target.value } as Partial<PontoForm>)}
        {...props}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Voltar aos pontos">
            <Link to="/midia-ooh" search={{ busca: "", tipo: "", status: "" }}>
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {doc ? doc.nome : "Novo ponto de mídia"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {doc ? [doc.codigo, doc.tipoNome].filter(Boolean).join(" · ") : "Mídia OOH"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {doc && temPosicao && (
            <Button asChild variant="outline">
              <a href={linkMapa(lat as number, lng as number)} target="_blank" rel="noreferrer">
                <ExternalLink />
                Abrir no Google Maps
              </a>
            </Button>
          )}
          {doc && me?.isGestor && (
            <Button variant="outline" onClick={() => setExcluindo(true)}>
              <Trash2 />
              Excluir
            </Button>
          )}
          {podeEditar && (
            <Button onClick={() => void salvar()} disabled={salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          )}
        </div>
      </div>

      {!podeEditar && (
        <p className="text-sm text-muted-foreground">
          Só Gestão, Comercial e PCP editam pontos de mídia.
        </p>
      )}

      <section className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        {campo("codigo", "Código")}
        {campo("nome", "Nome *")}
        <div className="space-y-1.5">
          <Label htmlFor="p-tipo">Tipo de mídia *</Label>
          <select
            id="p-tipo"
            className={selectClass}
            value={f.tipoId}
            disabled={bloqueado}
            onChange={(e) => set({ tipoId: e.target.value })}
          >
            <option value="">Selecione…</option>
            {tipos
              .filter((t) => t.ativo || t.id === f.tipoId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-status">Situação</Label>
          <select
            id="p-status"
            className={selectClass}
            value={f.status}
            disabled={bloqueado}
            onChange={(e) => set({ status: e.target.value as StatusPonto })}
          >
            {STATUS_PONTO.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {campo("faces", "Faces", { inputMode: "numeric" })}
        {campo("largura", "Largura (m)", { inputMode: "decimal" })}
        {campo("altura", "Altura (m)", { inputMode: "decimal" })}
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={f.iluminado}
            disabled={bloqueado}
            onChange={(e) => set({ iluminado: e.target.checked })}
          />
          Iluminado
        </label>
      </section>

      <section className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <h2 className="font-semibold sm:col-span-2 lg:col-span-4">Localização</h2>
        <div className="sm:col-span-2">{campo("endereco", "Endereço")}</div>
        {campo("bairro", "Bairro")}
        {campo("referencia", "Referência")}
        {campo("cidade", "Cidade")}
        {campo("estado", "UF", { maxLength: 2 })}
        {campo("latitude", "Latitude", { inputMode: "decimal", placeholder: "-19,912998" })}
        {campo("longitude", "Longitude", { inputMode: "decimal", placeholder: "-43,940933" })}
        <div className="space-y-2 sm:col-span-2 lg:col-span-4">
          {!bloqueado && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Clique no mapa ou arraste o marcador para definir a posição.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={minhaLocalizacao}>
                <LocateFixed />
                Usar minha localização
              </Button>
            </div>
          )}
          <Suspense fallback={<div className="h-96 rounded-2xl border bg-muted/40" />}>
            <MapaPontos pins={pins} onPick={bloqueado ? undefined : escolher} className="h-96" />
          </Suspense>
        </div>
      </section>

      {doc ? (
        <AnexosPanel
          entidade="ponto_midia"
          entidadeId={doc.id}
          canAdd={podeEditar}
          titulo="Fotos"
          aviso="As fotos vão para o Google Drive da empresa, na pasta Mídia OOH › deste ponto."
          accept={IMAGEM_ACCEPT}
          permitido={imagemPermitida}
          formatos="imagens (JPG, PNG, WEBP ou JPEG XL)"
          rotuloBotao="Adicionar fotos"
        />
      ) : (
        <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          Salve o ponto para adicionar fotos.
        </p>
      )}

      {doc && (
        <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Bi-semanas {ano}</h2>
          <OcupacaoGrid
            pontos={[{ id: doc.id, nome: doc.nome, codigo: doc.codigo }]}
            ano={ano}
            calendario={calendario}
          />
        </section>
      )}

      <section className="space-y-1.5 rounded-2xl border bg-card p-5 shadow-sm">
        <Label htmlFor="p-obs">Observação</Label>
        <Textarea
          id="p-obs"
          rows={3}
          value={f.observacao}
          disabled={bloqueado}
          onChange={(e) => set({ observacao: e.target.value })}
        />
      </section>

      <ConfirmDialog
        open={excluindo}
        onOpenChange={setExcluindo}
        title="Excluir este ponto?"
        description="A ocupação das bi-semanas e os registros das fotos vão junto (os arquivos continuam no Drive)."
        onConfirm={() => void excluir()}
      />
    </div>
  );
}
