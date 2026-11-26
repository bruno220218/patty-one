import { supabase } from "@/integrations/supabase/client";
import type { AssistenteResposta, MomentoAssistente } from "./assistente-pcp-schema";

const CHAVE_LIGADO = "pattyone:assistente-pcp";
const PREFIXO_CACHE = "pattyone:assistente-pcp:";

/** Whether the assistant opens by itself (each person turns it off on their own browser). */
export function assistenteLigado(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CHAVE_LIGADO) !== "off";
}

export function definirAssistenteLigado(ligado: boolean): void {
  if (ligado) window.localStorage.removeItem(CHAVE_LIGADO);
  else window.localStorage.setItem(CHAVE_LIGADO, "off");
}

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Same record and same version on the same day = no new AI call (saves the daily quota).
 * `versao` changes when the record changes (e.g. the liberação's updatedAt).
 */
function chaveCache(momento: MomentoAssistente, id: string, versao: string): string {
  return `${PREFIXO_CACHE}${momento}:${id}:${versao}:${hoje()}`;
}

function limparCacheAntigo(): void {
  const dia = hoje();
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const k = window.localStorage.key(i);
    if (k?.startsWith(PREFIXO_CACHE) && !k.endsWith(`:${dia}`)) window.localStorage.removeItem(k);
  }
}

export class AssistenteError extends Error {}

export async function pedirAssistente(
  momento: MomentoAssistente,
  id: string,
  versao: string,
  { signal, novo = false }: { signal?: AbortSignal; novo?: boolean } = {},
): Promise<AssistenteResposta> {
  const chave = chaveCache(momento, id, versao);
  if (!novo) {
    const guardado = window.localStorage.getItem(chave);
    if (guardado) {
      try {
        return JSON.parse(guardado) as AssistenteResposta;
      } catch {
        window.localStorage.removeItem(chave);
      }
    }
  }
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) throw new AssistenteError("Sua sessão expirou. Entre novamente.");
  const r = await fetch("/api/assistente-pcp", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ momento, id }),
    signal: signal ?? null,
  });
  const corpo = (await r.json().catch(() => null)) as
    (AssistenteResposta & { error?: undefined }) | { error: string } | null;
  if (!r.ok || !corpo || "error" in corpo) {
    throw new AssistenteError(
      (corpo && "error" in corpo && corpo.error) || "O assistente não respondeu agora.",
    );
  }
  // Only a real suggestion is kept; a fallback (no AI) is asked again next time.
  if (corpo.sugestao) {
    limparCacheAntigo();
    window.localStorage.setItem(chave, JSON.stringify(corpo));
  }
  return corpo;
}
