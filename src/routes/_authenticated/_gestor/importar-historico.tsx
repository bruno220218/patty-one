import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/app/page-header";
import {
  brl,
  comercialRepository,
  dataBR,
  prepararHistoricoSige,
  type HistoricoSige,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/_gestor/importar-historico")({
  head: () => ({
    meta: [
      { title: "Importar histórico SIGE — Patty One" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImportarHistoricoPage,
});

const LOTE = 500;

/** Gestão: SIGE exports of propostas, contratos and reservas (CSV), several files at once. */
function ImportarHistoricoPage() {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [arquivos, setArquivos] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<HistoricoSige[]>([]);
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<{ inseridos: number; atualizados: number } | null>(
    null,
  );

  async function lerArquivos(files: File[]) {
    setErro("");
    setLinhas([]);
    setResultado(null);
    setProgresso(0);
    setArquivos(files.map((f) => f.name));
    try {
      const conteudos = await Promise.all(
        files.map(async (f) => ({ name: f.name, content: await f.text() })),
      );
      setLinhas(prepararHistoricoSige(conteudos));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler os arquivos.");
    }
  }

  async function importar() {
    setImportando(true);
    setErro("");
    const total = { inseridos: 0, atualizados: 0 };
    try {
      for (let inicio = 0; inicio < linhas.length; inicio += LOTE) {
        const r = await comercialRepository.importarHistorico(linhas.slice(inicio, inicio + LOTE));
        total.inseridos += r.inseridos;
        total.atualizados += r.atualizados;
        setProgresso(Math.round((Math.min(inicio + LOTE, linhas.length) / linhas.length) * 100));
      }
      setResultado(total);
    } catch (e) {
      setErro(
        `Importação interrompida: ${e instanceof Error ? e.message : "falha de conexão"}. ${total.inseridos + total.atualizados} registros já foram gravados; importar de novo não duplica.`,
      );
    } finally {
      setImportando(false);
      void queryClient.invalidateQueries({ queryKey: ["comercial", "historico"] });
    }
  }

  const contagem = (t: HistoricoSige["tipo"]) => linhas.filter((l) => l.tipo === t).length;

  return (
    <>
      <PageHeader
        title="Importar histórico comercial do SIGE"
        description="Exportações de propostas, contratos e reservas em CSV. Pode escolher vários arquivos juntos; contratos e reservas se juntam pela autorização e nada é duplicado."
        action={
          <Button asChild variant="outline">
            <Link to="/comercial/historico" search={{ busca: "", tipo: "", pagina: 1 }}>
              <ArrowLeft />
              Ver histórico
            </Link>
          </Button>
        }
      />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            multiple
            className="hidden"
            disabled={importando}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) void lerArquivos(files);
              e.target.value = "";
            }}
          />
          <Button variant="outline" disabled={importando} onClick={() => input.current?.click()}>
            <Upload />
            Selecionar CSVs
          </Button>
          <span className="min-w-0 text-sm break-all text-muted-foreground">
            {arquivos.join(", ")}
          </span>
        </div>

        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}

        {linhas.length > 0 && (
          <>
            <p className="text-sm">
              <strong>{linhas.length.toLocaleString("pt-BR")}</strong> documentos:{" "}
              {contagem("proposta")} propostas, {contagem("contrato")} contratos e{" "}
              {contagem("reserva")} reservas.
            </p>
            <div className="max-h-96 overflow-auto rounded-xl border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    {["Nº", "Tipo", "Cliente", "Data", "Situação", "Valor"].map((h) => (
                      <th key={h} className="p-3 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.slice(0, 20).map((l) => (
                    <tr key={l.chave_sige} className="border-t">
                      <td className="p-3">{l.numero_sige}</td>
                      <td className="p-3">{l.tipo}</td>
                      <td className="p-3">{l.cliente_nome}</td>
                      <td className="p-3 whitespace-nowrap">{dataBR(l.data_documento)}</td>
                      <td className="p-3">{l.status_sige}</td>
                      <td className="p-3 whitespace-nowrap">{brl(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4">
              <Button onClick={() => void importar()} disabled={importando}>
                {importando ? <Loader2 className="animate-spin" /> : <Upload />}
                {importando ? "Importando…" : "Importar histórico"}
              </Button>
              <span className="text-sm">{progresso}%</span>
            </div>
            <Progress value={progresso} aria-label="Progresso da importação" />
          </>
        )}

        {resultado && (
          <p className="text-sm" aria-live="polite">
            Importação concluída: <strong>{resultado.inseridos}</strong> novos e{" "}
            <strong>{resultado.atualizados}</strong> atualizados.
          </p>
        )}
      </div>
    </>
  );
}
