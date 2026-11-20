import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Save, Search, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { useDataAction } from "@/hooks/use-data";
import {
  CADASTRO_ABAS,
  CADASTRO_LABELS,
  CADASTRO_OPCOES,
  cadastroPayload,
  cadastroRepository,
  isBooleanField,
  isNumericField,
  maskField,
  type CadastroFicha,
  type CadastroValues,
} from "@/lib/data";
import { cn } from "@/lib/utils";

const NOVO: CadastroValues = {
  tipo_comissao: "Nenhuma",
  validado: "Não",
  is_cliente: false,
  is_fornecedor: false,
  is_prestador: false,
  reter_iss: false,
};

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

/**
 * Ficha do cadastro em abas. `ficha` null = novo cadastro. Who can't edit sees the same
 * fields read-only; the Bancário tab only shows for direção/financeiro.
 */
export function CadastroForm({
  ficha,
  podeEditar,
  podeBancario,
  podeExcluir,
}: {
  ficha: CadastroFicha | null;
  podeEditar: boolean;
  podeBancario: boolean;
  podeExcluir: boolean;
}) {
  const navigate = useNavigate();
  const run = useDataAction();
  const [values, setValues] = useState<CadastroValues>(() => ({
    ...NOVO,
    ...(ficha?.valores ?? {}),
    ...(podeBancario ? (ficha?.bancario ?? {}) : {}),
  }));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const somenteLeitura = !podeEditar;
  // Bank details can be edited by direção/financeiro even without editing the rest.
  const podeSalvar = podeEditar || (podeBancario && ficha !== null);

  const set = (key: string, value: string | boolean | null) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function salvar() {
    setErro("");
    if (!podeEditar && ficha) {
      setSalvando(true);
      await run(() => cadastroRepository.saveBancario(ficha.id, values), "Dados bancários salvos");
      setSalvando(false);
      return;
    }
    let payload: CadastroValues;
    try {
      payload = cadastroPayload(values, podeBancario);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Confira os campos numéricos.");
      return;
    }
    if (!payload["nome"]) {
      setErro("Nome obrigatório.");
      return;
    }
    setSalvando(true);
    const id = await run(() => cadastroRepository.save(payload, ficha?.id), "Cadastro salvo");
    setSalvando(false);
    if (id && !ficha) navigate({ to: "/cadastros/$cadastroId", params: { cadastroId: id } });
  }

  async function excluir() {
    if (!ficha) return;
    const ok = await run(
      () => cadastroRepository.remove(ficha.id).then(() => true),
      "Cadastro excluído",
    );
    if (ok)
      navigate({
        to: "/cadastros",
        search: { busca: "", vendedor: "", estado: "", tipo: "", semVendedor: false, pagina: 1 },
      });
  }

  async function buscarCep() {
    const cep = String(values["cep"] ?? "").replace(/\D/g, "");
    if (cep.length !== 8) {
      setErro("Informe um CEP com 8 dígitos.");
      return;
    }
    setBuscandoCep(true);
    setErro("");
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) throw new Error("Não foi possível consultar o CEP.");
      const end = (await resp.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
        ibge?: string;
      };
      if (end.erro) throw new Error("CEP não encontrado.");
      setValues((v) => ({
        ...v,
        endereco: end.logradouro ?? "",
        bairro: end.bairro ?? "",
        cidade: end.localidade ?? "",
        estado: end.uf ?? "",
        codigo_municipio: end.ibge ?? "",
      }));
      toast.success("Endereço encontrado");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na busca do CEP.");
    } finally {
      setBuscandoCep(false);
    }
  }

  function campo(key: string, bloqueado: boolean) {
    const label = CADASTRO_LABELS[key] ?? key;
    const value = values[key];
    const id = `cad-${key}`;
    if (isBooleanField(key)) {
      return (
        <label key={key} className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={bloqueado}
            onChange={(e) => set(key, e.target.checked)}
            className="size-4 accent-primary"
          />
          {label}
        </label>
      );
    }
    const opcoes = CADASTRO_OPCOES[key];
    return (
      <div
        key={key}
        className={cn("space-y-1.5", key === "observacao" && "sm:col-span-2 lg:col-span-3")}
      >
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
          {key === "nome" ? " *" : ""}
        </label>
        {opcoes ? (
          <select
            id={id}
            className={selectClass}
            disabled={bloqueado}
            value={String(value ?? "")}
            onChange={(e) => set(key, e.target.value)}
          >
            <option value="">—</option>
            {opcoes.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ) : key === "observacao" ? (
          <Textarea
            id={id}
            rows={4}
            disabled={bloqueado}
            value={String(value ?? "")}
            onChange={(e) => set(key, e.target.value)}
          />
        ) : (
          <div className="flex gap-2">
            <Input
              id={id}
              disabled={bloqueado}
              required={key === "nome"}
              value={String(value ?? "")}
              inputMode={isNumericField(key) ? "decimal" : undefined}
              maxLength={key === "estado" ? 2 : undefined}
              onChange={(e) => set(key, maskField(key, e.target.value))}
            />
            {key === "cep" && !bloqueado && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Buscar endereço pelo CEP"
                aria-label="Buscar endereço pelo CEP"
                disabled={buscandoCep}
                onClick={buscarCep}
              >
                {buscandoCep ? <Loader2 className="animate-spin" /> : <Search />}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  const abas = CADASTRO_ABAS.filter((a) => a.value !== "bancario" || podeBancario);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Voltar aos cadastros"
          onClick={() =>
            navigate({
              to: "/cadastros",
              search: {
                busca: "",
                vendedor: "",
                estado: "",
                tipo: "",
                semVendedor: false,
                pagina: 1,
              },
            })
          }
        >
          <ArrowLeft />
        </Button>
        <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight break-words sm:text-3xl">
          {ficha ? ficha.nome : "Novo cadastro"}
        </h1>
        {podeSalvar && (
          <Button type="submit" disabled={salvando}>
            {salvando ? <Loader2 className="animate-spin" /> : <Save />}
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        )}
      </div>

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {somenteLeitura && (
        <p className="text-sm text-muted-foreground">
          Só Comercial e Gestão alteram cadastros. Você pode consultar os dados.
        </p>
      )}
      {ficha?.restricaoSige && (
        <div
          role="status"
          className="flex gap-3 rounded-xl border border-amber-400/50 bg-amber-400/15 p-4 text-sm"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <strong>Restrição no SIGE</strong>
            {ficha.restricaoObservacao && <p className="mt-1">{ficha.restricaoObservacao}</p>}
          </div>
        </div>
      )}

      <Tabs defaultValue="gerais">
        <div className="overflow-x-auto">
          <TabsList className="h-auto w-max">
            {abas.map((a) => (
              <TabsTrigger key={a.value} value={a.value}>
                {a.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {abas.map((a) => (
          <TabsContent key={a.value} value={a.value}>
            <div className="grid grid-cols-1 gap-5 rounded-xl border bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
              {a.campos.map((key) =>
                campo(key, a.value === "bancario" ? !podeBancario : somenteLeitura),
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {ficha && podeExcluir && (
        <div className="border-t pt-6">
          <Button type="button" variant="destructive" onClick={() => setExcluindo(true)}>
            <Trash2 />
            Excluir cadastro
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={excluindo}
        onOpenChange={setExcluindo}
        title="Excluir cadastro?"
        description="O cadastro e os dados bancários dele serão excluídos de vez."
        onConfirm={() => void excluir()}
      />
    </form>
  );
}
