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
import { useCurrentUser } from "@/hooks/use-data";
import { hojeISO } from "@/lib/data";
import { skillComercialRepository } from "@/lib/data/cloud-skill-comercial";
import type { EntradaSkillComercial } from "@/lib/data/skill-comercial";

/**
 * "Dados para a skill Comercial": the seller's day as JSON (renewals, proposals waiting, pedidos
 * to release, visits and after-sales) to paste or attach in Claude with the Comercial skill.
 */
export function SkillComercialButton() {
  const { data: me } = useCurrentUser();
  const [aberto, setAberto] = useState(false);
  const [vendedor, setVendedor] = useState("");
  const [gerando, setGerando] = useState(false);
  const [entrada, setEntrada] = useState<EntradaSkillComercial | null>(null);
  const texto = entrada ? JSON.stringify(entrada, null, 2) : "";

  async function gerar(nome: string) {
    setGerando(true);
    try {
      setEntrada(await skillComercialRepository.entrada(hojeISO(), nome));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar os dados.");
    } finally {
      setGerando(false);
    }
  }

  function abrir() {
    // Gestão sees everyone's portfolio by default; a seller starts with their own.
    const nome = me?.isGestor ? "" : (me?.name ?? "");
    setVendedor(nome);
    setAberto(true);
    void gerar(nome);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("JSON copiado. Cole no Claude junto com a skill Comercial.");
    } catch {
      toast.error("O navegador não deixou copiar. Use Baixar.");
    }
  }

  function baixar() {
    const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `comercial-${hojeISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button variant="outline" className="h-10" onClick={abrir}>
        <FileJson />
        Dados para a skill Comercial
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dados para a skill Comercial</DialogTitle>
            <DialogDescription>
              Renovações de painéis e outdoors, propostas esperando o cliente, pedidos para liberar
              (com os requisitos), visitas e pós-venda. Copie e cole no Claude pedindo o painel do
              dia.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="skill-vendedor">Vendedor (vazio = todos)</Label>
              <Input
                id="skill-vendedor"
                value={vendedor}
                placeholder="Todos"
                onChange={(e) => setVendedor(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void gerar(vendedor)}
              />
            </div>
            <Button variant="outline" disabled={gerando} onClick={() => void gerar(vendedor)}>
              {gerando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Gerar
            </Button>
          </div>
          {entrada && (
            <p className="text-sm text-muted-foreground">
              {entrada.cis_paineis_outdoor.length} renovação(ões) ·{" "}
              {entrada.orcamentos_abertos.length} proposta(s) esperando ·{" "}
              {entrada.servicos_para_liberar.length} pedido(s) para liberar ·{" "}
              {entrada.visitas_e_pos_venda.length} visita(s)/pós-venda
            </p>
          )}
          <Textarea
            readOnly
            aria-label="JSON para a skill Comercial"
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
