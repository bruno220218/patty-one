import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { montarEmailLiberacao, type EmailLiberacaoDados } from "@/lib/liberacao-email";

const MAX_PDF_BASE64 = 8 * 1024 * 1024; // ~6 MB de PDF

/**
 * Sends an approved liberação (PDF attached) to the e-mail list kept by gestão.
 * Only PCP, direção or gestão. Sending goes through a Google Apps Script web app that
 * runs on the company's Google account (APPS_SCRIPT_URL + APPS_SCRIPT_SECRET).
 */
export const enviarLiberacaoPorEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        liberacaoId: z.string().uuid(),
        pdfBase64: z.string().min(1).max(MAX_PDF_BASE64),
        filename: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;

    const { data: podeAprovar, error: roleError } = await db.rpc("can_aprovar_liberacoes", {
      _user_id: context.userId,
    });
    if (roleError) throw new Error("Não foi possível confirmar sua permissão. Tente novamente.");
    if (!podeAprovar) {
      throw new Error("Somente PCP, direção ou gestão enviam liberações por e-mail.");
    }

    const { data: lib, error: libError } = await db
      .from("liberacoes")
      .select("*, liberacao_itens(*)")
      .eq("id", data.liberacaoId)
      .maybeSingle();
    if (libError) throw new Error("Não foi possível ler a liberação.");
    if (!lib) throw new Error("Liberação não encontrada.");
    if (lib.status !== "aprovada") throw new Error("Só liberações aprovadas são enviadas.");

    const { data: destinos, error: destError } = await db
      .from("email_destinatarios")
      .select("email");
    if (destError) throw new Error("Não foi possível ler a lista de e-mails.");
    const to = [...new Set((destinos ?? []).map((d: { email: string }) => d.email))];
    if (to.length === 0) {
      return { enviados: 0 };
    }

    const url = process.env["APPS_SCRIPT_URL"];
    const secret = process.env["APPS_SCRIPT_SECRET"];
    if (!url || !secret) {
      throw new Error("O envio de e-mail ainda não foi configurado (APPS_SCRIPT_URL).");
    }

    type ItemRow = {
      position: number;
      servico: string;
      insumos: string;
      acabamento: string;
      instalacao: string;
      detalhes: string;
      largura_cm: number | string | null;
      altura_cm: number | string | null;
      quantidade: number | string | null;
    };
    const n = (v: number | string | null) => (v === null || v === "" ? null : Number(v));
    const dados: EmailLiberacaoDados = {
      numero: lib.numero,
      modelo: lib.modelo,
      cliente: lib.cliente ?? "",
      responsavel: lib.responsavel ?? "",
      contato: lib.contato ?? "",
      endereco: lib.endereco ?? "",
      vendedor: lib.vendedor ?? "",
      dataEntrega: lib.data_entrega,
      decididoPorNome: lib.decidido_por_nome ?? "",
      observacoes: lib.observacoes ?? "",
      itens: ((lib.liberacao_itens ?? []) as ItemRow[])
        .sort((a, b) => a.position - b.position)
        .map((i) => ({
          servico: i.servico,
          insumos: i.insumos,
          acabamento: i.acabamento,
          instalacao: i.instalacao,
          detalhes: i.detalhes,
          largura: n(i.largura_cm),
          altura: n(i.altura_cm),
          quantidade: n(i.quantidade),
        })),
    };

    const origin = new URL(getRequest().url).origin;
    const { subject, html } = montarEmailLiberacao(dados, `${origin}/liberacoes/${lib.id}`);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          secret,
          to,
          subject,
          html,
          attachment: { name: data.filename, base64: data.pdfBase64 },
        }),
      });
    } catch (e) {
      console.error("enviarLiberacaoPorEmail fetch failed", e);
      throw new Error("Não foi possível falar com o serviço de e-mail.");
    }
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      console.error("enviarLiberacaoPorEmail failed", res.status, body);
      throw new Error(body?.error ? `E-mail não enviado: ${body.error}` : "E-mail não enviado.");
    }

    const detalhe = `Para: ${to.join(", ")}`;
    const { error: logError } = await db.rpc("registrar_email_liberacao", {
      _liberacao_id: lib.id,
      _detalhe: detalhe,
    });
    if (logError) console.error("registrar_email_liberacao failed", logError);

    return { enviados: to.length };
  });
