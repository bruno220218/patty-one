import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, streamText } from "ai";
import { nextStepsRequestSchema, type NextStepsRequest } from "./next-steps-schema";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

const INSTRUCTIONS = `Você é um assistente de gestão de projetos da Patty One, uma empresa de produção (impressão, acabamento, pintura, embalagem etc.).
A pessoa responsável por um projeto descreveu um bloqueio. Com base no bloqueio, nas tarefas (feitas e pendentes), no progresso e no prazo, sugira próximos passos práticos para destravar o projeto.

Regras de resposta:
- Escreva em português do Brasil, em texto simples, sem markdown (sem asteriscos, sem cerquilhas, sem negrito).
- Comece com uma linha curta de diagnóstico, começando com "Diagnóstico:".
- Depois liste de 3 a 5 próximos passos numerados (1., 2., 3.), um por linha. Cada passo começa com um verbo no imperativo e cabe em até duas frases.
- Relacione os passos às tarefas pendentes pelo nome quando fizer sentido, e considere o prazo se ele existir.
- Se faltar informação essencial, inclua um passo para obtê-la. Não invente fatos sobre o projeto.`;

function describeProject(data: NextStepsRequest): string {
  const { project, blocker, today } = data;
  const total = project.tasks.length;
  const done = project.tasks.filter((t) => t.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const taskLines =
    total === 0
      ? "(nenhuma tarefa cadastrada)"
      : project.tasks
          .map(
            (t, i) =>
              `${i + 1}. [${t.done ? "feita" : "pendente"}] ${t.title}${
                t.completedAt ? ` (concluída em ${t.completedAt.slice(0, 10)})` : ""
              }`,
          )
          .join("\n");

  return `Data de hoje: ${today}
Projeto: ${project.name}
Descrição: ${project.description || "(sem descrição)"}
Criado em: ${project.createdAt.slice(0, 10)}
Prazo: ${project.dueDate ?? "sem prazo definido"}
Progresso: ${done} de ${total} tarefas concluídas (${percent}%)

Tarefas, na ordem do projeto:
${taskLines}

Bloqueio descrito pela pessoa responsável:
${blocker}`;
}

function friendlyError(error: unknown): string {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  if (status === 402) {
    return "Os créditos de IA do workspace acabaram. Adicione créditos para voltar a gerar sugestões.";
  }
  if (status === 429) {
    return "Muitas solicitações ao mesmo tempo. Aguarde alguns segundos e tente de novo.";
  }
  if (status === 403) {
    return "O uso de IA está bloqueado para este workspace no momento. Fale com a pessoa administradora.";
  }
  if (status === 401) {
    return "A IA não está configurada corretamente neste app.";
  }
  console.error("next-steps AI error", error);
  return "Não foi possível gerar sugestões agora. Tente novamente em instantes.";
}

export async function handleNextSteps(request: Request): Promise<Response> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return Response.json({ error: "A IA não está configurada neste app." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const parsed = nextStepsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Descreva o bloqueio com pelo menos 3 caracteres." },
      { status: 400 },
    );
  }

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages: [{ role: "user", content: describeProject(parsed.data) }],
    abortSignal: request.signal,
    maxRetries: 0,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  return withLovableAiGatewayRunIdHeader(
    result.toUIMessageStreamResponse({ sendReasoning: true, onError: friendlyError }),
    runIdFetch,
  );
}
