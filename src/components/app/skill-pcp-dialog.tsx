import { useState } from "react";
import { Copy, Download, FileJson, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { hojeISO, operacaoRepository, proximoDiaUtil, type EntradaSkillPcp } from "@/lib/data";

/**
 * "Dados para a skill PCP": builds the day's JSON (open orders, today's time records, team)
 * to paste or attach in Claude with the PCP skill.
 */
export function SkillPcpButton() {
  const [aberto, setAberto] = useState(false);
  const [referencia, setReferencia] = useState(() => hojeISO());
  const [programacao, setProgramacao] = useState(() => proximoDiaUtil(hojeISO()));
  const [gerando, setGerando] = useState(false);
  const [entrada, setEntrada] = useState<EntradaSkillPcp | null>(null);
  const texto = entrada ? JSON.stringify(entrada, null, 2) : "";

  async function gerar() {
    setGerando(true);
    try {
      setEntrada(await operacaoRepository.entradaSkillPcp(referencia, programacao));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar os dados.");
    } finally {
      setGerando(false);
    }
  }

  function abrir() {
    setAberto(true);
    void gerar();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("JSON copiado. Cole no Claude junto com a skill PCP.");
    } catch {
      toast.error("O navegador não deixou copiar. Use Baixar.");
    }
  }

  function baixar() {
    const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pcp-${referencia}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button variant="outline" className="h-10" onClick={abrir}>
        <FileJson />
        Dados para a skill PCP
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dados para a skill PCP</DialogTitle>
            <DialogDescription>
              Ordens abertas com etapas, tempo gasto e estimativas aprendidas, apontamentos do dia e
              equipe. Copie e cole no Claude (ou anexe o arquivo) pedindo a programação.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="pcp-ref">Fechamento do dia</Label>
              <Input
                id="pcp-ref"
                type="date"
                value={referencia}
                onChange={(e) => {
                  setReferencia(e.target.value);
                  if (e.target.value) setProgramacao(proximoDiaUtil(e.target.value));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pcp-prog">Programar para</Label>
              <Input
                id="pcp-prog"
                type="date"
                value={programacao}
                onChange={(e) => setProgramacao(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              disabled={gerando || !referencia || !programacao}
              onClick={() => void gerar()}
            >
              {gerando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Gerar
            </Button>
          </div>
          {entrada && (
            <p className="text-sm text-muted-foreground">
              {entrada.carteira_ordens.length} OS na carteira · {entrada.apontamentos_hoje.length}{" "}
              apontamento(s) no dia · {entrada.equipe_disponivel.length} pessoa(s) na equipe
            </p>
          )}
          <Textarea
            readOnly
            aria-label="JSON para a skill PCP"
            className="h-72 font-mono text-xs"
            value={gerando && !entrada ? "Gerando…" : texto}
          />
          <DialogFooter>
            <Button variant="outline" disabled={!entrada} onClick={baixar}>
              <Download />
              Baixar .json
            </Button>
            <Button disabled={!entrada} onClick={() => void copiar()}>
              <Copy />
              Copiar JSON
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
