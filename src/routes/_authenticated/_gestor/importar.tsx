import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/app/page-header";
import {
  cadastroRepository,
  IMPORT_FIELDS,
  normalizeHeader,
  normalizeRow,
  parseCsv,
  toCsv,
  type CadastroValues,
  type ImportacaoResultado,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/_gestor/importar")({
  head: () => ({
    meta: [{ title: "Importar cadastros — Patty One" }, { name: "robots", content: "noindex" }],
  }),
  component: ImportarPage,
});

const LOTE = 500;

type Linha = { linha: number; raw: Record<string, string>; dados?: CadastroValues; erro?: string };

/** Gestão: planilha de cadastros do SIGE (CSV separado por vírgula). */
function ImportarPage() {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultados, setResultados] = useState<ImportacaoResultado[]>([]);
  const [concluido, setConcluido] = useState(false);

  async function lerArquivo(file: File) {
    setErro("");
    setLinhas([]);
    setResultados([]);
    setConcluido(false);
    setProgresso(0);
    setArquivo(file.name);
    try {
      const { headers: cols, rows } = parseCsv(await file.text());
      if (!cols.map(normalizeHeader).includes("nome"))
        throw new Error("O CSV precisa da coluna nome.");
      setHeaders(cols);
      setLinhas(
        rows.map((raw, i) => {
          try {
            return { raw, dados: normalizeRow(raw), linha: i + 2 };
          } catch (e) {
            return { raw, linha: i + 2, erro: e instanceof Error ? e.message : "Linha inválida" };
          }
        }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o CSV.");
    }
  }

  const coluna = (raw: Record<string, string>, campo: string) =>
    raw[headers.find((h) => normalizeHeader(h) === campo) ?? campo] ?? null;

  async function importar() {
    setImportando(true);
    setConcluido(false);
    setResultados([]);
    setProgresso(0);
    setErro("");
    const saida: ImportacaoResultado[] = [];
    try {
      for (let inicio = 0; inicio < linhas.length; inicio += LOTE) {
        const lote = linhas.slice(inicio, inicio + LOTE);
        for (const l of lote.filter((x) => x.erro)) {
          saida.push({
            linha: l.linha,
            nome: coluna(l.raw, "nome"),
            cpf_cnpj: coluna(l.raw, "cpf_cnpj"),
            resultado: "erro",
            motivo: l.erro ?? "Linha inválida",
          });
        }
        const validas = lote.filter((x) => x.dados && !x.erro);
        if (validas.length) {
          saida.push(
            ...(await cadastroRepository.importar(
              validas.map((l) => ({ ...l.dados, linha: l.linha })),
            )),
          );
        }
        setResultados([...saida].sort((a, b) => a.linha - b.linha));
        setProgresso(Math.round((Math.min(inicio + LOTE, linhas.length) / linhas.length) * 100));
      }
      setConcluido(true);
    } catch (e) {
      setErro(
        `Importação interrompida: ${e instanceof Error ? e.message : "falha de conexão"}. Os resultados abaixo são das linhas já processadas.`,
      );
    } finally {
      setImportando(false);
      void queryClient.invalidateQueries({ queryKey: ["cadastros"] });
    }
  }

  function baixarErros() {
    const csv = toCsv(
      resultados.filter((r) => r.resultado === "erro"),
      ["linha", "nome", "cpf_cnpj", "motivo"],
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "erros-importacao.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const desconhecidas = headers.filter((h) => !IMPORT_FIELDS.includes(normalizeHeader(h)));
  const faltando = IMPORT_FIELDS.filter((f) => !headers.map(normalizeHeader).includes(f));
  const erros = resultados.filter((r) => r.resultado === "erro");

  return (
    <>
      <PageHeader
        title="Importar cadastros"
        description="Planilha do SIGE em CSV. Atualiza pelo CPF/CNPJ ou pelo ID SIGE, sem duplicar. Colunas bancárias só entram se você também for Direção ou Financeiro."
      />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={importando}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void lerArquivo(file);
              e.target.value = "";
            }}
          />
          <Button variant="outline" disabled={importando} onClick={() => input.current?.click()}>
            <Upload />
            Selecionar CSV
          </Button>
          <span className="min-w-0 text-sm break-all text-muted-foreground">{arquivo}</span>
          {linhas.length > 0 && (
            <span className="font-medium">{linhas.length.toLocaleString("pt-BR")} linhas</span>
          )}
        </div>

        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}

        {linhas.length > 0 && (
          <>
            <div className="space-y-1 text-sm break-words">
              <p>
                <strong>Colunas não reconhecidas:</strong> {desconhecidas.join(", ") || "nenhuma"}
              </p>
              <p className="text-muted-foreground">
                <strong>Campos sem coluna:</strong> {faltando.join(", ") || "nenhum"}
              </p>
            </div>
            <h2 className="font-semibold">
              Prévia — primeiras {Math.min(20, linhas.length)} linhas
            </h2>
            <div className="max-h-96 overflow-auto rounded-xl border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">Linha</th>
                    {headers.map((h) => (
                      <th className="p-3 whitespace-nowrap" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(0, 20).map((l) => (
                    <tr key={l.linha} className="border-t">
                      <td className="p-3">{l.linha}</td>
                      {headers.map((h) => (
                        <td
                          className="max-w-64 min-w-32 p-3 break-words whitespace-pre-wrap"
                          key={h}
                        >
                          {l.raw[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4">
              <Button onClick={() => void importar()} disabled={importando}>
                {importando ? <Loader2 className="animate-spin" /> : <Upload />}
                {importando ? "Importando…" : "Importar cadastros"}
              </Button>
              <span className="text-sm">{progresso}%</span>
            </div>
            <Progress value={progresso} aria-label="Progresso da importação" />
          </>
        )}

        {(concluido || resultados.length > 0) && (
          <section className="space-y-4 border-t pt-6">
            <h2 className="font-semibold">
              {concluido ? "Importação concluída" : "Resultados parciais"}
            </h2>
            <div className="flex flex-wrap gap-6" aria-live="polite">
              <p>
                Inseridos:{" "}
                <strong>{resultados.filter((r) => r.resultado === "inserido").length}</strong>
              </p>
              <p>
                Atualizados:{" "}
                <strong>{resultados.filter((r) => r.resultado === "atualizado").length}</strong>
              </p>
              <p>
                Erros: <strong>{erros.length}</strong>
              </p>
            </div>
            {erros.length > 0 && (
              <>
                <Button variant="outline" onClick={baixarErros}>
                  <Download />
                  Baixar erros em CSV
                </Button>
                <div className="overflow-auto rounded-xl border bg-card">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted text-xs text-muted-foreground">
                      <tr>
                        {["Linha", "Nome", "CPF/CNPJ", "Motivo"].map((h) => (
                          <th className="p-3" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {erros.map((r) => (
                        <tr key={r.linha} className="border-t">
                          <td className="p-3">{r.linha}</td>
                          <td className="p-3">{r.nome || "—"}</td>
                          <td className="p-3">{r.cpf_cnpj || "—"}</td>
                          <td className="p-3 text-destructive">{r.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </>
  );
}
