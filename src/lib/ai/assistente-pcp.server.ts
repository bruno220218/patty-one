import { generateText } from "ai";
import {
  assistenteRequestSchema,
  lerSugestaoLiberacao,
  lerSugestaoPrazo,
  type AssistenteResposta,
  type CargaProducao,
} from "./assistente-pcp-schema";
import { checarAcesso, modeloIA, rpcComoUsuario, tokenDaRequisicao } from "./provider.server";

// Assistente do PCP: the AI only suggests; the PCP always decides and nothing is written.
const BASE = `Você é o assistente do PCP (planejamento e controle da produção) da Patty One, empresa de comunicação visual: fachadas, ACM, placas, impressão, lonas, instalação e colagem de mídia OOH (outdoor).
Você recebe um resumo em JSON tirado do sistema. Use só esses dados; não invente números, clientes ou datas. Quem decide é sempre o PCP: escreva como sugestão, em português do Brasil, frases curtas e diretas.
Responda somente com um objeto JSON válido, sem markdown e sem texto fora do JSON.`;

const PROMPT_PRAZO = `${BASE}
Tarefa: sugerir o prazo de entrega de um pedido. Pese a carga das próximas semanas ("carga.semanas": ordens previstas, etapas abertas e serviços na Programação por setor), as ordens atrasadas, a capacidade das equipes e quantos dias as ordens costumam levar por tipo ("dias_ate_concluir_por_tipo"; poucas ordens = pouca confiança). Considere a data desejada pelo cliente, se houver. Evite um prazo impossível de cumprir e também um prazo longo sem necessidade. Datas em dias úteis.
Formato:
{"data_sugerida": "AAAA-MM-DD", "resumo": "uma frase com a recomendação", "motivos": ["até 4 motivos curtos, citando os números"], "alertas": ["riscos, se houver; senão lista vazia"]}`;

const PROMPT_LIBERACAO = `${BASE}
Tarefa: revisar uma liberação antes de o PCP aprovar. Diga o que falta (campos em "preenchidos" com false que importam para este serviço, itens sem medidas ou sem local), se a data de entrega cabe na carga ("cabe", "apertado", "nao_cabe" ou "sem_prazo") e, para cada ordem, qual checklist da lista "checklists_disponiveis" combina melhor (use o nome exato; se nenhum combinar, não sugira).
Formato:
{"resumo": "uma frase", "faltando": ["o que falta"], "prazo": {"avaliacao": "cabe|apertado|nao_cabe|sem_prazo", "comentario": "uma frase com os números"}, "checklists": [{"ordem": 123, "checklist": "nome exato", "motivo": "frase curta"}], "alertas": ["riscos, se houver"]}`;

const erro = (mensagem: string, status: number) => Response.json({ error: mensagem }, { status });

export async function handleAssistentePcp(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return erro("Requisição inválida.", 400);
  }
  const parsed = assistenteRequestSchema.safeParse(body);
  if (!parsed.success) return erro("Requisição inválida.", 400);
  const { momento, id } = parsed.data;

  const token = tokenDaRequisicao(request);
  if (!token) return erro("Entre na sua conta para usar o assistente.", 401);

  // The context is read as the caller: the function itself only serves Gestão and PCP.
  const ctx = await rpcComoUsuario(token, "contexto_assistente_pcp", {
    p_momento: momento,
    p_id: id,
  });
  if (!ctx.ok) {
    const detalhe = (await ctx.json().catch(() => null)) as { code?: string } | null;
    if (ctx.status === 401) return erro("Entre na sua conta para usar o assistente.", 401);
    if (detalhe?.code === "42501") return erro("O assistente é só para Gestão e PCP.", 403);
    if (detalhe?.code === "PGRST202")
      return erro("O assistente ainda não foi instalado no banco.", 503);
    return erro("Não foi possível ler os dados para o assistente.", 400);
  }
  const contexto = (await ctx.json()) as Record<string, unknown>;
  const carga = contexto["carga"] as CargaProducao;
  const semIa = (aviso: string): AssistenteResposta =>
    momento === "prazo"
      ? { momento, carga, sugestao: null, aviso }
      : { momento, carga, sugestao: null, aviso };

  const model = modeloIA();
  if (!model) return Response.json(semIa("A IA não está configurada; veja a carga abaixo."));

  const acesso = await checarAcesso(request);
  if (acesso === "limite") {
    return Response.json(semIa("Você chegou ao limite de sugestões de hoje; veja a carga abaixo."));
  }
  if (acesso !== "ok") return erro("O assistente é só para quem já foi aprovado na equipe.", 403);

  try {
    const { text } = await generateText({
      model,
      instructions: momento === "prazo" ? PROMPT_PRAZO : PROMPT_LIBERACAO,
      prompt: JSON.stringify(contexto),
      abortSignal: request.signal,
      maxRetries: 0,
    });
    const resposta: AssistenteResposta =
      momento === "prazo"
        ? { momento, carga, sugestao: lerSugestaoPrazo(text, carga.hoje), aviso: null }
        : {
            momento,
            carga,
            sugestao: lerSugestaoLiberacao(
              text,
              ((contexto["checklists_disponiveis"] as { nome: string }[] | undefined) ?? []).map(
                (c) => c.nome,
              ),
            ),
            aviso: null,
          };
    if (!resposta.sugestao)
      resposta.aviso = "A IA não respondeu no formato esperado; veja a carga abaixo.";
    return Response.json(resposta);
  } catch (e) {
    console.error("assistente-pcp AI error", e);
    return Response.json(semIa("A IA não respondeu agora; veja a carga abaixo."));
  }
}
