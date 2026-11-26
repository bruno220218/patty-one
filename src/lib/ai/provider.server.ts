import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// IA opcional: qualquer provedor compatível com a API da OpenAI. Este é o único lugar que sabe
// qual provedor está em uso (trocar de provedor = mudar aqui e os segredos na Cloudflare).
// AI_API_KEY (obrigatória para ligar), AI_BASE_URL (padrão: OpenAI) e AI_MODEL.
// Ex. grátis: Google Gemini -> AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
//   AI_MODEL=gemini-2.5-flash
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

/** The configured model, or null when AI_API_KEY is not set. */
export function modeloIA(): LanguageModel | null {
  const apiKey = process.env["AI_API_KEY"];
  if (!apiKey) return null;
  const provider = createOpenAI({
    baseURL: process.env["AI_BASE_URL"] || DEFAULT_BASE_URL,
    apiKey,
  });
  return provider.chat(process.env["AI_MODEL"] || DEFAULT_MODEL);
}

/** Bearer token of the signed-in caller (Supabase session), or null. */
export function tokenDaRequisicao(request: Request): string | null {
  return (
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() || null
  );
}

/** Calls a database function as the caller (RLS and the function's own checks apply). */
export async function rpcComoUsuario(
  token: string,
  funcao: string,
  args: Record<string, unknown>,
): Promise<Response> {
  const url = process.env["SUPABASE_URL"]?.replace(/\/+$/, "");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
  return fetch(`${url}/rest/v1/rpc/${funcao}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
}

export type Acesso = "ok" | "sem_login" | "nao_membro" | "limite";

/**
 * Before spending AI credits: the caller must be an approved team member (sign-up is open,
 * so an account alone isn't enough) and within the daily limit. The database counts each
 * request (registrar_uso_ia); without that migration it falls back to the membership check.
 */
export async function checarAcesso(request: Request): Promise<Acesso> {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  const url = process.env["SUPABASE_URL"]?.replace(/\/+$/, "");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !key) return "sem_login";
  const headers = {
    apikey: key,
    Authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };

  const user = await fetch(`${url}/auth/v1/user`, { headers });
  if (!user.ok) return "sem_login";
  const { id } = (await user.json()) as { id?: string };
  if (!id) return "sem_login";

  const uso = await fetch(`${url}/rest/v1/rpc/registrar_uso_ia`, {
    method: "POST",
    headers,
    body: "{}",
  });
  if (uso.ok) {
    const r = (await uso.json()) as string;
    return r === "ok" || r === "limite" || r === "nao_membro" ? r : "nao_membro";
  }
  // Migration 0015 not run yet: at least require team membership.
  const membro = await fetch(`${url}/rest/v1/rpc/is_team_member`, {
    method: "POST",
    headers,
    body: JSON.stringify({ _user_id: id }),
  });
  return membro.ok && (await membro.json()) === true ? "ok" : "nao_membro";
}
