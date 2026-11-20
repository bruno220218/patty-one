import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PASTA_RAIZ = "Patty One";
const PASTAS = {
  liberacao: { tabela: "liberacoes", pasta: "Liberações" },
  briefing: { tabela: "briefings", pasta: "Briefings" },
  // Criação delivery: same briefing folder, in a subfolder.
  briefing_entrega: { tabela: "briefings", pasta: "Briefings" },
  visita: { tabela: "visitas", pasta: "Visitas técnicas" },
  ci: { tabela: "cis", pasta: "CIs de vinheta" },
  // Checking photos go in the CI's own folder, in a subfolder.
  ci_foto: { tabela: "cis", pasta: "CIs de vinheta" },
} as const;

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const limpa = (s: string) =>
  s
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

async function assinar(segredo: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Authorizes one upload straight from the browser to the company's Google Drive
 * (through the Apps Script web app). Returns a short-lived signed ticket; the file
 * itself never passes through this server.
 */
export const prepararUploadDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entidade: z.enum(["liberacao", "briefing", "briefing_entrega", "visita", "ci", "ci_foto"]),
        entidadeId: z.string().uuid(),
        nome: z.string().trim().min(1).max(200),
        mime: z.string().max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const url = process.env["APPS_SCRIPT_URL"];
    const segredo = process.env["APPS_SCRIPT_SECRET"];
    if (!url || !segredo) {
      throw new Error("O envio para o Drive ainda não foi configurado. Use 'Colar link'.");
    }
    const db = context.supabase as unknown as SupabaseClient;

    const { data: membro } = await db.rpc("is_team_member", { _user_id: context.userId });
    if (!membro) throw new Error("Você ainda não foi aprovado na equipe.");

    const cfg = PASTAS[data.entidade];
    const { data: row, error } = await db
      .from(cfg.tabela)
      .select(cfg.tabela === "cis" ? "numero, cliente, data" : "numero, cliente")
      .eq("id", data.entidadeId)
      .maybeSingle<{ numero: number; cliente: string; data?: string }>();
    if (error || !row) throw new Error("Registro não encontrado.");

    const { data: perfil } = await db
      .from("profiles")
      .select("display_name")
      .eq("id", context.userId)
      .maybeSingle();

    // CI numbers restart every month, so their folder carries the month: "2026-11 CI 10-Nov - CSFX".
    const numero =
      cfg.tabela === "cis" && row.data
        ? `${row.data.slice(0, 7)} CI ${String(row.numero).padStart(2, "0")}-${MESES[Number(row.data.slice(5, 7)) - 1] ?? ""}`
        : `Nº ${row.numero}`;
    const subpasta = limpa(`${numero}${row.cliente ? ` - ${row.cliente}` : ""}`);
    const payload = JSON.stringify({
      exp: Date.now() + 15 * 60_000,
      pasta:
        data.entidade === "ci_foto"
          ? [PASTA_RAIZ, cfg.pasta, subpasta, "Fotos do checking"]
          : data.entidade === "briefing_entrega"
            ? [PASTA_RAIZ, cfg.pasta, subpasta, "Entrega da criação"]
            : [PASTA_RAIZ, cfg.pasta, subpasta],
      nome: limpa(data.nome) || "arquivo",
      mime: data.mime,
      autor: perfil?.display_name ?? "",
    });
    return { url, payload, assinatura: await assinar(segredo, payload) };
  });
