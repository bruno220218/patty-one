import { prepararUploadDrive } from "@/lib/data/drive.functions";
import { anexosRepository, tipoDoArquivo, type AnexoEntidade } from "@/lib/data/cloud-anexos";

function base64DoArquivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Sends a file from the browser straight to the company's Google Drive (Apps Script
 * web app). Returns the Drive file id and link.
 */
export async function enviarParaDrive(
  file: File,
  entidade: AnexoEntidade,
  entidadeId: string,
): Promise<{ id: string; url: string }> {
  const mime = file.type || "application/octet-stream";
  const ticket = await prepararUploadDrive({
    data: { entidade, entidadeId, nome: file.name, mime },
  });
  const base64 = await base64DoArquivo(file);

  let res: Response;
  try {
    // text/plain keeps it a "simple" request (Apps Script doesn't answer CORS preflights).
    res = await fetch(ticket.url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        acao: "upload",
        payload: ticket.payload,
        assinatura: ticket.assinatura,
        base64,
      }),
    });
  } catch {
    throw new Error("Não foi possível falar com o Google Drive. Verifique a internet.");
  }
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    id?: string;
    url?: string;
    error?: string;
  } | null;
  if (!res.ok || !body?.ok || !body.url || !body.id) {
    throw new Error(body?.error ? `Drive: ${body.error}` : "O Drive não aceitou o arquivo.");
  }
  return { id: body.id, url: body.url };
}

/** Sends the file to Drive and records the link as an attachment of the record. */
export async function anexarArquivo(
  file: File,
  entidade: AnexoEntidade,
  entidadeId: string,
): Promise<void> {
  const drive = await enviarParaDrive(file, entidade, entidadeId);
  await anexosRepository.add({
    entidade,
    entidadeId,
    url: drive.url,
    nome: file.name,
    tipo: tipoDoArquivo(file.name, file.type),
    driveId: drive.id,
    tamanho: file.size,
  });
}
