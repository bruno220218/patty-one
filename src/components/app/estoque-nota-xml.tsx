import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileCode2, Loader2 } from "lucide-react";
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
import { ClientePicker, TOM, selectClass } from "@/components/app/operacao-ui";
import { ProdutoPicker } from "@/components/app/estoque-produto-picker";
import { useDataAction } from "@/hooks/use-data";
import {
  estoqueRepository,
  formatarCnpj,
  formatCusto,
  formatQtd,
  lerNfe,
  lerNumero,
  SETORES_ESTOQUE,
  UNIDADES_ESTOQUE,
  type ItemImportacao,
  type NotaNfe,
  type OrigemItemNota,
  type ProdutoEstoque,
  type UnidadeEstoque,
} from "@/lib/data";
import { formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

const ORIGEM: Record<OrigemItemNota, string> = {
  codigo: "Reconhecido pelo código do fornecedor",
  similar: "Reconhecido pelo nome deste fornecedor",
  similar_geral: "Reconhecido por um nome similar",
  produto: "Mesmo nome do produto",
};

/** Supplier unit → stock unit guess (only to prefill the new product). */
function unidadeSugerida(uCom: string): UnidadeEstoque {
  const u = uCom.trim().toLowerCase();
  if (/^m2|^m²/.test(u)) return "m²";
  if (/^(m|mt|mts|metro)$/.test(u)) return "m";
  if (/^(rl|rolo)/.test(u)) return "rolo";
  if (/^(l|lt|litro)/.test(u)) return "litro";
  if (/^kg/.test(u)) return "kg";
  if (/^(cx|caixa)/.test(u)) return "caixa";
  if (/^(ch|chapa)/.test(u)) return "chapa";
  if (/^(par|pr)$/.test(u)) return "par";
  return "un";
}

const nomeBonito = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

type Linha = ItemImportacao & { origem: OrigemItemNota | null; fatorTexto: string };

/**
 * Importar XML da NF-e (0047): reads the file in the browser, asks the database which product
 * each item is (supplier code → supplier name → similar → product name), lets the person link
 * the rest to a product, create a new one or ignore it (frete, serviço), and imports: note +
 * similares + one Entrada per item (quantity × fator, price ÷ fator).
 */
export function NotaXmlDialog({
  produtos,
  verCusto,
  onClose,
}: {
  produtos: ProdutoEstoque[];
  verCusto: boolean;
  onClose: () => void;
}) {
  const run = useDataAction();
  const [nota, setNota] = useState<NotaNfe | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [fornecedor, setFornecedor] = useState<{ id: string; nome: string } | null>(null);
  const [jaImportada, setJaImportada] = useState(false);
  const [erro, setErro] = useState("");
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function ler(file: File) {
    setErro("");
    setNota(null);
    setLinhas([]);
    setFornecedor(null);
    setJaImportada(false);
    setLendo(true);
    try {
      const n = lerNfe(await file.text());
      const ident = await estoqueRepository.identificarNota(n);
      setNota(n);
      setJaImportada(ident.jaImportada);
      if (ident.fornecedorId) setFornecedor({ id: ident.fornecedorId, nome: n.fornecedorNome });
      setLinhas(
        n.itens.map((item, i) => {
          const s = ident.itens[i];
          const fator = s?.fator ?? 1;
          return {
            acao: s?.produtoId ? "produto" : "novo",
            produtoId: s?.produtoId ?? null,
            origem: s?.origem ?? null,
            novoSetor: "",
            novoNome: nomeBonito(item.nome),
            novaUnidade: unidadeSugerida(item.unidade),
            fator,
            fatorTexto: String(fator),
            lote: item.lote ?? "",
            lembrar: true,
          };
        }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    } finally {
      setLendo(false);
    }
  }

  const mudar = (i: number, p: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const pendente = (l: Linha) =>
    l.acao === "ignorar"
      ? false
      : !(l.fator > 0) ||
        (l.acao === "produto" ? !l.produtoId : !l.novoSetor || !l.novoNome.trim());
  const pendentes = linhas.filter(pendente).length;
  const importados = linhas.filter((l) => l.acao !== "ignorar").length;

  async function importar() {
    if (!nota) return;
    setEnviando(true);
    const ok = await run(
      () => estoqueRepository.importarNota(nota, fornecedor?.id ?? null, linhas),
      `Nota ${nota.numero} importada: ${importados} ${importados === 1 ? "entrada" : "entradas"}`,
    );
    setEnviando(false);
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar XML da nota</DialogTitle>
          <DialogDescription>
            Cada item da nota entra como Entrada no estoque. Item com nome diferente do nosso:
            escolha o produto uma vez e o nome fica ligado a ele (similar) — a próxima nota desse
            fornecedor já vem reconhecida.
          </DialogDescription>
        </DialogHeader>

        <Input
          type="file"
          accept=".xml,text/xml,application/xml"
          aria-label="Arquivo XML da NF-e"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void ler(file);
          }}
        />
        {lendo && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Lendo a nota…
          </p>
        )}
        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {nota && (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="font-medium">
                  NF-e {nota.numero}
                  {nota.serie && ` · série ${nota.serie}`}
                </p>
                <p className="text-muted-foreground">
                  {nota.emissao ? formatDateOnly(nota.emissao) : "sem data"} · {nota.itens.length}{" "}
                  itens
                  {verCusto && nota.valorTotal !== null && ` · ${formatCusto(nota.valorTotal)}`}
                </p>
              </div>
              <div className="space-y-1">
                <p>
                  {nota.fornecedorNome}{" "}
                  <span className="text-muted-foreground">{formatarCnpj(nota.cnpj)}</span>
                </p>
                <ClientePicker
                  placeholder="Fornecedor nos cadastros (opcional)…"
                  value={fornecedor}
                  onChange={setFornecedor}
                />
              </div>
            </div>

            {jaImportada && (
              <p
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                  TOM.perigo,
                )}
              >
                <AlertTriangle className="size-4 shrink-0" />
                Esta nota já foi importada. Para não somar de novo, ela não entra outra vez.
              </p>
            )}

            <ul className="space-y-3">
              {nota.itens.map((item, i) => {
                const l = linhas[i];
                if (!l) return null;
                const qtdEstoque = item.quantidade * (l.fator > 0 ? l.fator : 1);
                const produto = produtos.find((p) => p.id === l.produtoId);
                const unidadeEstoque =
                  l.acao === "produto" ? (produto?.unidade ?? "") : l.novaUnidade;
                return (
                  <li
                    key={item.numero}
                    className={cn(
                      "space-y-3 rounded-lg border p-3",
                      l.acao === "ignorar" && "opacity-60",
                      pendente(l) && "border-amber-400/60",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{item.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          cód. {item.codigo || "—"} · {formatQtd(item.quantidade)} {item.unidade}
                          {verCusto && ` × ${formatCusto(item.valorUnitario)}`}
                          {item.lote && ` · lote ${item.lote}`}
                        </p>
                      </div>
                      <select
                        aria-label={`O que fazer com ${item.nome}`}
                        className={cn(selectClass, "w-full sm:w-56")}
                        value={l.acao}
                        onChange={(e) => mudar(i, { acao: e.target.value as Linha["acao"] })}
                      >
                        <option value="produto">Produto do estoque</option>
                        <option value="novo">Criar produto novo</option>
                        <option value="ignorar">Ignorar (frete, serviço…)</option>
                      </select>
                    </div>

                    {l.acao === "produto" && (
                      <div className="space-y-1">
                        <ProdutoPicker
                          produtos={produtos}
                          value={l.produtoId ?? ""}
                          onChange={(id) =>
                            mudar(i, { produtoId: id || null, origem: id ? l.origem : null })
                          }
                          mostrarSaldo={false}
                        />
                        {l.origem && l.produtoId && (
                          <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="size-3.5" />
                            {ORIGEM[l.origem]}
                          </p>
                        )}
                      </div>
                    )}

                    {l.acao === "novo" && (
                      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_7rem]">
                        <select
                          aria-label="Setor do produto novo"
                          className={selectClass}
                          value={l.novoSetor}
                          onChange={(e) => mudar(i, { novoSetor: e.target.value })}
                        >
                          <option value="">Setor…</option>
                          {SETORES_ESTOQUE.map((s) => (
                            <option key={s.prefixo} value={s.prefixo}>
                              {s.prefixo} · {s.nome}
                            </option>
                          ))}
                        </select>
                        <Input
                          aria-label="Nome do produto novo"
                          value={l.novoNome}
                          onChange={(e) => mudar(i, { novoNome: e.target.value })}
                        />
                        <select
                          aria-label="Unidade do produto novo"
                          className={selectClass}
                          value={l.novaUnidade}
                          onChange={(e) =>
                            mudar(i, { novaUnidade: e.target.value as UnidadeEstoque })
                          }
                        >
                          {UNIDADES_ESTOQUE.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {l.acao !== "ignorar" && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        <label className="flex items-center gap-2">
                          1 {item.unidade || "un"} =
                          <Input
                            aria-label="Fator de conversão"
                            inputMode="decimal"
                            className="h-8 w-20"
                            value={l.fatorTexto}
                            onChange={(e) =>
                              mudar(i, {
                                fatorTexto: e.target.value,
                                fator: lerNumero(e.target.value) ?? 0,
                              })
                            }
                          />
                          {unidadeEstoque || "un"}
                        </label>
                        <label className="flex items-center gap-2">
                          Lote
                          <Input
                            aria-label="Lote"
                            className="h-8 w-32"
                            value={l.lote}
                            onChange={(e) => mudar(i, { lote: e.target.value })}
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={l.lembrar}
                            onChange={(e) => mudar(i, { lembrar: e.target.checked })}
                          />
                          Lembrar para este fornecedor
                        </label>
                        <span className="ml-auto text-muted-foreground">
                          Entra: {formatQtd(qtdEstoque)} {unidadeEstoque}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter className="items-center gap-2">
          {nota && pendentes > 0 && (
            <span className="mr-auto text-sm text-amber-700 dark:text-amber-400">
              {pendentes} {pendentes === 1 ? "item precisa" : "itens precisam"} de produto ou setor
            </span>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={importar}
            disabled={!nota || jaImportada || enviando || pendentes > 0 || importados === 0}
          >
            <FileCode2 />
            Importar nota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
