import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, SearchX, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { CardGridSkeleton } from "@/components/app/card-grid-skeleton";
import { useCadastros, useCurrentUser, useDataAction } from "@/hooks/use-data";
import {
  CADASTROS_POR_PAGINA,
  cadastroRepository,
  canEditarCadastros,
  type CadastroFiltros,
  type CadastroTipo,
} from "@/lib/data";

type Busca = CadastroFiltros & { pagina: number };

const TIPOS: CadastroTipo[] = ["", "cliente", "fornecedor", "prestador"];
const texto = (v: unknown) => (typeof v === "string" ? v : "");

export const Route = createFileRoute("/_authenticated/cadastros/")({
  // Filters live in the address, so a filtered list can be shared or reopened.
  validateSearch: (s: Record<string, unknown>): Busca => ({
    busca: texto(s["busca"]),
    vendedor: texto(s["vendedor"]),
    estado: texto(s["estado"]),
    tipo: TIPOS.includes(s["tipo"] as CadastroTipo) ? (s["tipo"] as CadastroTipo) : "",
    semVendedor: s["semVendedor"] === true || s["semVendedor"] === "true",
    pagina: Math.max(1, Math.floor(Number(s["pagina"]) || 1)),
  }),
  head: () => ({
    meta: [{ title: "Cadastros — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: CadastrosPage,
});

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

function CadastrosPage() {
  const { pagina, ...filtros } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: me } = useCurrentUser();
  const podeEditar = canEditarCadastros(me);
  const { data, isPending, error } = useCadastros(filtros, pagina);
  const run = useDataAction();

  // Typing waits a moment before searching, so the database isn't asked on every key.
  const [busca, setBusca] = useState(filtros.busca);
  useEffect(() => setBusca(filtros.busca), [filtros.busca]);
  useEffect(() => {
    if (busca === filtros.busca) return;
    const t = setTimeout(() => mudar({ busca }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [todosDoFiltro, setTodosDoFiltro] = useState(false);
  const [atribuindo, setAtribuindo] = useState(false);
  const [vendedor, setVendedor] = useState("");
  const chaveFiltro = JSON.stringify(filtros);
  useEffect(() => {
    setSelecionados(new Set());
    setTodosDoFiltro(false);
  }, [chaveFiltro]);

  function mudar(patch: Partial<CadastroFiltros>) {
    void navigate({ search: (prev) => ({ ...prev, ...patch, pagina: 1 }) });
  }
  const irPara = (p: number) => void navigate({ search: (prev) => ({ ...prev, pagina: p }) });

  const total = data?.total ?? 0;
  const linhas = data?.linhas ?? [];
  const paginas = Math.max(1, Math.ceil(total / CADASTROS_POR_PAGINA));
  const quantidade = todosDoFiltro ? total : selecionados.size;
  const paginaToda =
    linhas.length > 0 && (todosDoFiltro || linhas.every((r) => selecionados.has(r.id)));

  async function confirmarAtribuicao() {
    const n = await run(() =>
      cadastroRepository.atribuirVendedor(
        vendedor.trim(),
        todosDoFiltro ? { filtros } : { ids: Array.from(selecionados) },
      ),
    );
    if (n !== undefined) {
      setAtribuindo(false);
      setVendedor("");
      setSelecionados(new Set());
      setTodosDoFiltro(false);
      toast.success(`${n} cadastro${n === 1 ? "" : "s"} alterado${n === 1 ? "" : "s"}`);
    }
  }

  return (
    <>
      <PageHeader
        title="Cadastros"
        description="Clientes, fornecedores e prestadores do grupo."
        action={
          <div className="flex flex-wrap gap-2">
            {me?.isGestor && (
              <Button asChild variant="outline" className="h-10">
                <Link to="/importar">
                  <Upload />
                  Importar
                </Link>
              </Button>
            )}
            {podeEditar && (
              <Button asChild className="h-10">
                <Link to="/cadastros/novo">
                  <Plus />
                  Novo cadastro
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          aria-label="Buscar cadastros"
          placeholder="Buscar por nome, razão social, CPF/CNPJ, cidade ou e-mail…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-10 sm:col-span-2 lg:col-span-4"
        />
        <select
          aria-label="Filtrar vendedor"
          className={selectClass}
          value={filtros.vendedor}
          disabled={filtros.semVendedor}
          onChange={(e) => mudar({ vendedor: e.target.value })}
        >
          <option value="">Todos os vendedores</option>
          {(data?.vendedores ?? []).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar estado"
          className={selectClass}
          value={filtros.estado}
          onChange={(e) => mudar({ estado: e.target.value })}
        >
          <option value="">Todos os estados</option>
          {(data?.estados ?? []).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar tipo"
          className={selectClass}
          value={filtros.tipo}
          onChange={(e) => mudar({ tipo: e.target.value as CadastroTipo })}
        >
          <option value="">Todos os tipos</option>
          <option value="cliente">Cliente</option>
          <option value="fornecedor">Fornecedor</option>
          <option value="prestador">Prestador</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filtros.semVendedor}
            onChange={(e) => mudar({ semVendedor: e.target.checked, vendedor: "" })}
            className="size-4 accent-primary"
          />
          Sem vendedor
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">{total.toLocaleString("pt-BR")} resultados</span>
        {podeEditar && quantidade > 0 && (
          <>
            <span>{quantidade.toLocaleString("pt-BR")} selecionados</span>
            <Button variant="outline" size="sm" onClick={() => setAtribuindo(true)}>
              <UserRound />
              Atribuir vendedor
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTodosDoFiltro(false);
                setSelecionados(new Set());
              }}
            >
              Limpar seleção
            </Button>
          </>
        )}
        {podeEditar && total > 0 && !todosDoFiltro && (
          <Button variant="link" size="sm" onClick={() => setTodosDoFiltro(true)}>
            Selecionar todos os resultados do filtro
          </Button>
        )}
      </div>

      {isPending ? (
        <CardGridSkeleton />
      ) : error ? (
        <EmptyState
          icon={SearchX}
          title="Não foi possível abrir os cadastros"
          description={error.message}
        />
      ) : linhas.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nenhum cadastro encontrado"
          description="Mude a busca ou os filtros."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                {podeEditar && (
                  <th className="w-10 p-3">
                    <input
                      aria-label="Selecionar a página"
                      type="checkbox"
                      checked={paginaToda}
                      onChange={(e) => {
                        const marcar = e.target.checked;
                        setTodosDoFiltro(false);
                        setSelecionados((atual) => {
                          const prox = new Set(atual);
                          for (const r of linhas) {
                            if (marcar) prox.add(r.id);
                            else prox.delete(r.id);
                          }
                          return prox;
                        });
                      }}
                      className="size-4 accent-primary"
                    />
                  </th>
                )}
                {["Nome", "CPF/CNPJ", "Cidade/UF", "Vendedor", "Tipo", "Telefone"].map((h) => (
                  <th key={h} className="p-3 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  {podeEditar && (
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${r.nome}`}
                        checked={todosDoFiltro || selecionados.has(r.id)}
                        onChange={(e) => {
                          const marcar = e.target.checked;
                          setSelecionados((atual) => {
                            const prox = todosDoFiltro
                              ? new Set(linhas.map((l) => l.id))
                              : new Set(atual);
                            if (marcar) prox.add(r.id);
                            else prox.delete(r.id);
                            return prox;
                          });
                          setTodosDoFiltro(false);
                        }}
                        className="size-4 accent-primary"
                      />
                    </td>
                  )}
                  <td className="min-w-48 p-3">
                    <Link
                      className="font-medium text-primary hover:underline"
                      to="/cadastros/$cadastroId"
                      params={{ cadastroId: r.id }}
                    >
                      {r.nome}
                    </Link>
                    {r.restricaoSige && (
                      <Badge
                        variant="outline"
                        className="ml-2 border-amber-400/60 text-amber-700 dark:text-amber-400"
                        title={r.restricaoObservacao || undefined}
                      >
                        Restrição SIGE
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">{r.cpfCnpj || "—"}</td>
                  <td className="min-w-32 p-3">
                    {[r.cidade, r.estado].filter(Boolean).join("/") || "—"}
                  </td>
                  <td className="p-3">{r.vendedor || "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {r.isCliente && <Badge variant="secondary">Cliente</Badge>}
                      {r.isFornecedor && <Badge variant="outline">Fornecedor</Badge>}
                      {r.isPrestador && <Badge variant="outline">Prestador</Badge>}
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap">{r.telefone || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-3">
        <Button
          size="icon"
          variant="outline"
          aria-label="Página anterior"
          disabled={pagina <= 1}
          onClick={() => irPara(pagina - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-sm">
          Página {pagina} de {paginas}
        </span>
        <Button
          size="icon"
          variant="outline"
          aria-label="Próxima página"
          disabled={pagina >= paginas}
          onClick={() => irPara(pagina + 1)}
        >
          <ChevronRight />
        </Button>
      </div>

      <Dialog open={atribuindo} onOpenChange={setAtribuindo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir vendedor</DialogTitle>
            <DialogDescription>
              {quantidade.toLocaleString("pt-BR")} cadastro{quantidade === 1 ? "" : "s"} vão receber
              este vendedor.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Vendedor"
            list="cadastros-vendedores"
            placeholder="Nome do vendedor"
            value={vendedor}
            onChange={(e) => setVendedor(e.target.value)}
          />
          <datalist id="cadastros-vendedores">
            {(data?.vendedores ?? []).map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAtribuindo(false)}>
              Cancelar
            </Button>
            <Button disabled={!vendedor.trim()} onClick={() => void confirmarAtribuicao()}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
