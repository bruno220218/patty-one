import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, streamText } from "ai";
import { nextStepsRequestSchema, type NextStepsRequest } from "./next-steps-schema";

// IA opcional: qualquer provedor compatível com a API da OpenAI.
// AI_API_KEY (obrigatória para ligar), AI_BASE_URL (padrão: OpenAI) e AI_MODEL.
// Ex. grátis: Google Gemini -> AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
//   AI_MODEL=gemini-2.5-flash
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

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
    return "O provedor de IA recusou o pedido. Confira a chave e o modelo configurados.";
  }
  if (status === 401) {
    return "A IA não está configurada corretamente neste app.";
  }
  console.error("next-steps AI error", error);
  return "Não foi possível gerar sugestões agora. Tente novamente em instantes.";
}

type Acesso = "ok" | "sem_login" | "nao_membro" | "limite";

/**
 * Before spending AI credits: the caller must be an approved team member (sign-up is open,
 * so an account alone isn't enough) and within the daily limit. The database counts each
 * request (registrar_uso_ia); without that migration it falls back to the membership check.
 */
async function checarAcesso(request: Request): Promise<Acesso> {
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

export async function handleNextSteps(request: Request): Promise<Response> {
  const acesso = await checarAcesso(request);
  if (acesso === "sem_login") {
    return Response.json({ error: "Entre na sua conta para usar as sugestões." }, { status: 401 });
  }
  if (acesso === "nao_membro") {
    return Response.json(
      { error: "As sugestões são só para quem já foi aprovado na equipe." },
      { status: 403 },
    );
  }
  if (acesso === "limite") {
    return Response.json(
      { error: "Você chegou ao limite de sugestões de hoje. Amanhã libera de novo." },
      { status: 429 },
    );
  }
  const apiKey = process.env["AI_API_KEY"];
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

  const provider = createOpenAI({
    baseURL: process.env["AI_BASE_URL"] || DEFAULT_BASE_URL,
    apiKey,
  });

  const result = streamText({
    model: provider.chat(process.env["AI_MODEL"] || DEFAULT_MODEL),
    instructions: INSTRUCTIONS,
    messages: [{ role: "user", content: describeProject(parsed.data) }],
    abortSignal: request.signal,
    maxRetries: 0,
  });

  return result.toUIMessageStreamResponse({ onError: friendlyError });
}
