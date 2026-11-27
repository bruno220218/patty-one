import { supabase } from "@/integrations/supabase/client";
import {
  canGerirOperacao,
  canVender,
  hojeISO,
  operacaoRepository,
  proximoDiaUtil,
  type CurrentUser,
} from "@/lib/data";
import { skillComercialRepository } from "@/lib/data/cloud-skill-comercial";
import type { FonteDados, OrquestradorRequest, OrquestradorResposta } from "./orquestrador-schema";

export class OrquestradorError extends Error {}

export type DadosSetores = Partial<Record<FonteDados, Record<string, unknown> | null>>;

/**
 * The sectors' data, loaded as the signed-in person (RLS applies): the same JSON as the
 * "Dados para a skill" buttons. A sector the person can't use, or that fails, goes as null.
 */
export async function carregarDadosSetores(me: CurrentUser): Promise<DadosSetores> {
  const hoje = hojeISO();
  const tentar = async (f: () => Promise<unknown>) => {
    try {
      return (await f()) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const [pcp, comercial] = await Promise.all([
    canGerirOperacao(me)
      ? tentar(() => operacaoRepository.entradaSkillPcp(hoje, proximoDiaUtil(hoje)))
      : Promise.resolve(null),
    canVender(me)
      ? // Gestão sees everyone's portfolio; a seller, their own.
        tentar(() => skillComercialRepository.entrada(hoje, me.isGestor ? "" : me.name))
      : Promise.resolve(null),
  ]);
  return { pcp, comercial };
}

export async function perguntarOrquestrador(
  pedido: OrquestradorRequest,
  signal?: AbortSignal,
): Promise<OrquestradorResposta> {
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) throw new OrquestradorError("Sua sessão expirou. Entre novamente.");
  const r = await fetch("/api/orquestrador", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(pedido),
    signal: signal ?? null,
  });
  const corpo = (await r.json().catch(() => null)) as
    (OrquestradorResposta & { error?: undefined }) | { error: string } | null;
  if (!r.ok || !corpo || "error" in corpo) {
    throw new OrquestradorError(
      (corpo && "error" in corpo && corpo.error) || "O orquestrador não respondeu agora.",
    );
  }
  return corpo;
}
