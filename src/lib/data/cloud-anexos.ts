import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";

// The table is newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

export type AnexoEntidade =
  | "liberacao"
  | "briefing"
  | "briefing_entrega"
  | "visita"
  | "ci"
  | "ci_foto"
  | "programacao"
  | "agendamento"
  | "ponto_midia";
export type AnexoTipo = "pdf" | "foto" | "video" | "audio" | "outro";

export interface Anexo {
  id: string;
  entidade: AnexoEntidade;
  entidadeId: string;
  url: string;
  nome: string;
  tipo: AnexoTipo;
  /** Set when the file was sent from the app straight to Drive. */
  driveId: string;
  tamanho: number | null;
  createdByNome: string;
  createdAt: string;
  createdBy: string | null;
}

export const ANEXO_TIPOS: { value: AnexoTipo; label: string }[] = [
  { value: "foto", label: "Fotos" },
  { value: "pdf", label: "PDF" },
  { value: "video", label: "Vídeo" },
  { value: "audio", label: "Áudio" },
  { value: "outro", label: "Outro" },
];

/** Accepted in the "Anexar arquivo" picker. */
export const ANEXO_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.jxl,.mp4,.mp3,application/pdf,image/png,image/jpeg,image/jxl,video/mp4,audio/mpeg";

/** Briefing files (comercial and the Criação delivery): JPEG, PNG, PDF and JPEG XL. */
export const BRIEFING_ACCEPT =
  ".jpg,.jpeg,.png,.pdf,.jxl,image/jpeg,image/png,image/jxl,application/pdf";
export const BRIEFING_FORMATOS = "JPEG, PNG, PDF ou JPEG XL";
export function briefingArquivoPermitido(nome: string, mime: string): boolean {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  return (
    ["jpg", "jpeg", "png", "pdf", "jxl"].includes(ext) ||
    ["image/jpeg", "image/png", "image/jxl", "application/pdf"].includes(mime)
  );
}

/** Images of a programmed service or a schedule entry (operação). */
export const IMAGEM_ACCEPT = "image/*,.png,.jpg,.jpeg,.gif,.webp,.jxl";
export function imagemPermitida(nome: string, mime: string): boolean {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  return mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "jxl"].includes(ext);
}

/** Accepted for the vinheta file of a CI: video, image, or the PDF of the art. */
export const VINHETA_ACCEPT =
  "video/*,image/*,.mp4,.mov,.avi,.wmv,.mkv,.png,.jpg,.jpeg,.gif,.pdf,application/pdf";

/** Apps Script web apps take ~50 MB per request; base64 adds a third. */
export const ANEXO_MAX_BYTES = 35 * 1024 * 1024;

const EXT_VIDEO = ["mp4", "mov", "avi", "wmv", "mkv", "m4v", "webm"];

export function tipoDoArquivo(nome: string, mime: string): AnexoTipo {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  if (EXT_VIDEO.includes(ext)) return "video";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "jxl"].includes(ext)) return "foto";
  if (mime.startsWith("video/") || ext === "mp4") return "video";
  if (mime.startsWith("audio/") || ext === "mp3") return "audio";
  return "outro";
}

export function arquivoPermitido(nome: string, mime: string): boolean {
  return tipoDoArquivo(nome, mime) !== "outro";
}

/** Vinheta file of a CI: any video, an image (GIF/PNG/JPG) or the PDF of the art. */
export function vinhetaPermitida(nome: string, mime: string): boolean {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  return (
    mime.startsWith("video/") ||
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    [...EXT_VIDEO, "png", "jpg", "jpeg", "gif", "pdf"].includes(ext)
  );
}

/** Accepts only http(s) links; returns the cleaned URL or null. */
export function linkValido(raw: string): string | null {
  const url = raw.trim();
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) return null;
  return url;
}

export function formatBytes(n: number | null): string {
  if (n === null) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

interface Row {
  id: string;
  entidade: AnexoEntidade;
  entidade_id: string;
  url: string;
  nome: string;
  tipo: AnexoTipo;
  drive_id: string;
  tamanho: number | null;
  created_by: string | null;
  created_by_nome: string;
  created_at: string;
}

const toAnexo = (r: Row): Anexo => ({
  id: r.id,
  entidade: r.entidade,
  entidadeId: r.entidade_id,
  url: r.url,
  nome: r.nome,
  tipo: r.tipo,
  driveId: r.drive_id,
  tamanho: r.tamanho === null ? null : Number(r.tamanho),
  createdBy: r.created_by,
  createdByNome: r.created_by_nome,
  createdAt: r.created_at,
});

export const anexosRepository = {
  /** Null when the table doesn't exist yet. */
  async list(entidade: AnexoEntidade, entidadeId: string): Promise<Anexo[] | null> {
    const { data, error } = await db
      .from("anexos")
      .select("*")
      .eq("entidade", entidade)
      .eq("entidade_id", entidadeId)
      .order("created_at", { ascending: true });
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return null;
      throw dbError(error);
    }
    return ((data ?? []) as Row[]).map(toAnexo);
  },

  async add(input: {
    entidade: AnexoEntidade;
    entidadeId: string;
    url: string;
    nome: string;
    tipo: AnexoTipo;
    driveId?: string;
    tamanho?: number | null;
  }): Promise<void> {
    const url = linkValido(input.url);
    if (!url) throw new Error("Cole um link válido (começando com https://).");
    const nome = input.nome.trim();
    if (!nome) throw new Error("Dê um nome para o anexo.");
    const { error } = await db.from("anexos").insert({
      entidade: input.entidade,
      entidade_id: input.entidadeId,
      url,
      nome: nome.slice(0, 200),
      tipo: input.tipo,
      drive_id: input.driveId ?? "",
      tamanho: input.tamanho ?? null,
    });
    if (error) throw dbError(error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await db.from("anexos").delete().eq("id", id);
    if (error) throw dbError(error);
  },
};
