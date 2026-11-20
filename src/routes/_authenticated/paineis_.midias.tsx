import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Images, Pencil, SearchX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { useCurrentUser, useDataAction, usePaineis } from "@/hooks/use-data";
import { canEditarPaineis, paineisRepository, type Painel } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/paineis_/midias")({
  head: () => ({
    meta: [{ title: "Mídias dos painéis — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: MidiasPaineisPage,
});

/** PA01 runs on vnnox, a different media system from the Drive folders of the RGB panels. */
const sistemaDiferente = (link: string) => /vnnox\.com/i.test(link);

function LinhaPainel({ painel, podeEditar }: { painel: Painel; podeEditar: boolean }) {
  const run = useDataAction();
  const [editando, setEditando] = useState(false);
  const [link, setLink] = useState(painel.midiasLink);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    const ok = await run(async () => {
      await paineisRepository.salvarLinkMidias(painel.id, link);
      return true;
    }, "Link das mídias salvo.");
    setSalvando(false);
    if (ok) setEditando(false);
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 sm:w-56">
        <p className="font-semibold">{painel.codigo}</p>
        <p className="truncate text-xs text-muted-foreground">{painel.nome}</p>
      </div>

      {editando ? (
        <form
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
        >
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            aria-label={`Link das mídias do ${painel.codigo}`}
            className="h-9 min-w-[14rem] flex-1"
            autoFocus
          />
          <Button type="submit" className="h-9" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-9"
            onClick={() => {
              setLink(painel.midiasLink);
              setEditando(false);
            }}
            aria-label="Cancelar"
          >
            <X />
          </Button>
        </form>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {painel.midiasLink ? (
            <>
              <Button asChild variant="outline" className="h-9 max-w-full">
                <a href={painel.midiasLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  <span className="truncate">
                    {sistemaDiferente(painel.midiasLink)
                      ? "Abrir no vnnox"
                      : "Abrir pasta das mídias"}
                  </span>
                </a>
              </Button>
              {sistemaDiferente(painel.midiasLink) && (
                <span className="text-xs text-muted-foreground">
                  Sistema diferente de gestão de mídia
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Sem link ainda</span>
          )}
          {podeEditar && (
            <Button
              variant="ghost"
              className="h-9 sm:ml-auto"
              onClick={() => setEditando(true)}
              aria-label={`Alterar link das mídias do ${painel.codigo}`}
            >
              <Pencil />
              {painel.midiasLink ? "Alterar" : "Adicionar link"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function MidiasPaineisPage() {
  const { data, isPending, error } = usePaineis();
  const { data: me } = useCurrentUser();
  const podeEditar = canEditarPaineis(me);

  return (
    <>
      <PageHeader
        title="Mídias dos painéis"
        description={
          podeEditar
            ? "Onde ficam as mídias de cada painel: pasta do Drive nos RGB e o vnnox no PA01. Cole o link completo."
            : "Onde ficam as mídias de cada painel: pasta do Drive nos RGB e o vnnox no PA01."
        }
      />
      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState icon={SearchX} title="Não foi possível carregar" description={error.message} />
      ) : !data || data.paineis.length === 0 ? (
        <EmptyState
          icon={Images}
          title="Painéis ainda não ativados"
          description="Falta rodar a atualização do banco."
        />
      ) : (
        <ul className="surface-card divide-y divide-border overflow-hidden">
          {data.paineis.map((p) => (
            <LinhaPainel key={`${p.id}:${p.midiasLink}`} painel={p} podeEditar={podeEditar} />
          ))}
        </ul>
      )}
    </>
  );
}
