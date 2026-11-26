import { generateText } from "ai";
import {
  assistenteRequestSchema,
  lerSugestaoLiberacao,
  lerSugestaoOrdem,
  lerSugestaoPrazo,
  lerSugestaoProgramacao,
  type AssistenteRequest,
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

const PROMPT_ORDEM = `${BASE}
Tarefa: revisar uma ordem de produção. Sugira a complexidade ("Simples", "Média" ou "Complexa") e a prioridade ("Baixa", "Normal", "Alta" ou "Urgente") só quando houver motivo nos dados (prazo perto, atraso, tamanho do serviço); aponte etapas paradas (em andamento há muito tempo, pausadas, ou com horas muito acima da "mediana_horas_historico"). Se a situação for "Aguardando conferência", liste o que o PCP deve conferir antes de liberar para o cliente, de acordo com o tipo e as etapas.
Formato:
{"resumo": "uma frase", "complexidade": {"valor": "Simples|Média|Complexa", "motivo": "frase curta"} ou null, "prioridade": {"valor": "Baixa|Normal|Alta|Urgente", "motivo": "frase curta"} ou null, "etapas_paradas": ["etapa: o que está acontecendo"], "conferir": ["itens a conferir, só na conferência"], "alertas": ["riscos, se houver"]}`;

const PROMPT_PROGRAMACAO = `${BASE}
Tarefa: revisar a Programação do dia ("dia") antes de o PCP fechar. Aponte conflitos (pessoas ou veículos em mais de um serviço, serviços sem equipe ou sem líder), as ordens que deveriam entrar primeiro (atrasadas ou com prazo perto, em "ordens_sem_programacao" ou nos serviços do dia; use o número da ordem) e o que fazer com as pendências. Compare com a capacidade por setor quando fizer sentido.
Formato:
{"resumo": "uma frase", "prioridades": [{"ordem": 123, "motivo": "frase curta"}], "conflitos": ["o conflito e uma saída"], "sugestoes": ["até 4 sugestões práticas"], "alertas": ["riscos, se houver"]}`;

const PROMPTS = {
  prazo: PROMPT_PRAZO,
  liberacao: PROMPT_LIBERACAO,
  ordem: PROMPT_ORDEM,
  programacao: PROMPT_PROGRAMACAO,
} as const;

const erro = (mensagem: string, status: number) => Response.json({ error: mensagem }, { status });

/** Order numbers the AI may cite for the day: those in the services and the unscheduled ones. */
function ordensDoDia(contexto: Record<string, unknown>): number[] {
  const servicos =
    (contexto["servicos"] as { ordem?: { numero?: number } | null }[] | undefined) ?? [];
  const sem = (contexto["ordens_sem_programacao"] as { numero?: number }[] | undefined) ?? [];
  return [...servicos.map((x) => x.ordem?.numero), ...sem.map((x) => x.numero)].filter(
    (n): n is number => typeof n === "number",
  );
}

function lerSugestao(
  momento: AssistenteRequest["momento"],
  texto: string,
  contexto: Record<string, unknown>,
  hoje: string,
) {
  switch (momento) {
    case "prazo":
      return lerSugestaoPrazo(texto, hoje);
    case "liberacao":
      return lerSugestaoLiberacao(
        texto,
        ((contexto["checklists_disponiveis"] as { nome: string }[] | undefined) ?? []).map(
          (c) => c.nome,
        ),
      );
    case "ordem":
      return lerSugestaoOrdem(texto);
    case "programacao":
      return lerSugestaoProgramacao(texto, ordensDoDia(contexto));
  }
}

export async function handleAssistentePcp(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return erro("Requisição inválida.", 400);
  }
  const parsed = assistenteRequestSchema.safeParse(body);
  if (!parsed.success) return erro("Requisição inválida.", 400);
  const pedido = parsed.data;
  const { momento } = pedido;

  const token = tokenDaRequisicao(request);
  if (!token) return erro("Entre na sua conta para usar o assistente.", 401);

  // The context is read as the caller: the functions themselves only serve Gestão and PCP.
  const ctx =
    pedido.momento === "programacao"
      ? await rpcComoUsuario(token, "contexto_programacao_pcp", { p_data: pedido.data })
      : await rpcComoUsuario(token, "contexto_assistente_pcp", {
          p_momento: pedido.momento,
          p_id: pedido.id,
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
  const montar = (sugestao: unknown, aviso: string | null) =>
    ({ momento, carga, sugestao, aviso }) as AssistenteResposta;

  const model = modeloIA();
  if (!model) return Response.json(montar(null, "A IA não está configurada; veja a carga abaixo."));

  const acesso = await checarAcesso(request);
  if (acesso === "limite") {
    return Response.json(
      montar(null, "Você chegou ao limite de sugestões de hoje; veja a carga abaixo."),
    );
  }
  if (acesso !== "ok") return erro("O assistente é só para quem já foi aprovado na equipe.", 403);

  try {
    const { text } = await generateText({
      model,
      instructions: PROMPTS[momento],
      prompt: JSON.stringify(contexto),
      abortSignal: request.signal,
      maxRetries: 0,
    });
    const sugestao = lerSugestao(momento, text, contexto, carga.hoje);
    return Response.json(
      montar(
        sugestao,
        sugestao ? null : "A IA não respondeu no formato esperado; veja a carga abaixo.",
      ),
    );
  } catch (e) {
    console.error("assistente-pcp AI error", e);
    return Response.json(montar(null, "A IA não respondeu agora; veja a carga abaixo."));
  }
}
