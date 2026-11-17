import { toast } from "sonner";
import { liberacaoRepository } from "@/lib/data";
import { enviarLiberacaoPorEmail } from "@/lib/data/liberacao-email.functions";
import { liberacaoPdfBase64 } from "@/lib/liberacao-pdf";

/**
 * Generates the PDF of an approved liberação and sends it to the e-mail list.
 * Reports the result as toasts; never throws (an e-mail failure must not undo the approval).
 */
export async function enviarEmailDaLiberacao(
  liberacaoId: string,
  opts: { silenciosoSemLista?: boolean } = {},
): Promise<boolean> {
  const id = toast.loading("Enviando a liberação por e-mail…");
  try {
    const lib = await liberacaoRepository.get(liberacaoId);
    if (!lib) throw new Error("Liberação não encontrada.");
    const { base64, filename } = await liberacaoPdfBase64(lib, "/patty-logo.png");
    const { enviados } = await enviarLiberacaoPorEmail({
      data: { liberacaoId, pdfBase64: base64, filename },
    });
    if (enviados === 0) {
      if (opts.silenciosoSemLista) toast.dismiss(id);
      else
        toast.info("Nenhum e-mail cadastrado. A gestão cadastra em Liberações → Editar listas.", {
          id,
        });
      return false;
    }
    toast.success(
      `Liberação enviada por e-mail para ${enviados} pessoa${enviados === 1 ? "" : "s"}.`,
      {
        id,
      },
    );
    return true;
  } catch (e) {
    console.error(e);
    toast.error(e instanceof Error ? e.message : "Não foi possível enviar o e-mail.", { id });
    return false;
  }
}
