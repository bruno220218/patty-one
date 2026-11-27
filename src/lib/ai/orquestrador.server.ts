import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";
import skillComercial from "./orquestrador/skills/skill-comercial.md?raw";
import skillCompras from "./orquestrador/skills/skill-compras-estoque.md?raw";
import skillCriacao from "./orquestrador/skills/skill-criacao.md?raw";
import skillExterna from "./orquestrador/skills/skill-externa.md?raw";
import skillMapeamento from "./orquestrador/skills/skill-mapeamento.md?raw";
import skillOrcamentos from "./orquestrador/skills/skill-orcamentos.md?raw";
import skillPcp from "./orquestrador/skills/skill-pcp.md?raw";
import skillProjetos from "./orquestrador/skills/skill-projetos.md?raw";
import {
  MAX_DADOS_CHARS,
  MENSAGEM_SEM_COTA,
  SETORES,
  juntarConsultas,
  orquestradorRequestSchema,
  respostaSemAgente,
  semCota,
  textoDaSkill,
  type ConsultaSetor,
  type DefinicaoSetor,
  type OrquestradorPedido,
  type OrquestradorResposta,
  type SetorId,
} from "./orquestrador-schema";
import {
  checarAcesso,
  modeloIA,
  opcoesProvedor,
  temModeloAlternativo,
  tokenDaRequisicao,
  type PapelModelo,
} from "./provider.server";

// Orquestrador: a central agent reads the question and consults the sector agents (tools), each
// following its skill and only the data the page loaded as the signed-in person. Nothing is
// written. Sectors without data in Patty One answer without calling the AI.

const SKILLS: Record<SetorId, string> = {
  pcp: skillPcp,
  comercial: skillComercial,
  orcamentos: skillOrcamentos,
  criacao: skillCriacao,
  projetos: skillProjetos,
  compras: skillCompras,
  externa: skillExterna,
  mapeamento: skillMapeamento,
};

/** Orchestrator rounds (each may call several sectors at once); the last one must answer. */
const MAX_RODADAS = 4;
const TEMPO_SETOR_MS = 90_000;
const TEMPO_TOTAL_MS = 180_000;

const erro = (mensagem: string, status: number) => Response.json({ error: mensagem }, { status });

/** The single sector's answer when exactly one sector was consulted and it answered. */
function respostaUnica(consultas: ConsultaSetor[], respostas: string[]): string | null {
  return consultas.length === 1 && consultas[0]?.situacao === "respondeu" && respostas.length === 1
    ? (respostas[0] ?? null)
    : null;
}

function instrucoesOrquestrador(pedido: OrquestradorPedido): string {
  const quem = pedido.usuario.nome
    ? `O usuário é ${pedido.usuario.nome} (funções: ${pedido.usuario.funcoes.join(", ") || "não informadas"}).`
    : "";
  return [
    "Você é o Orquestrador de Operações da Patty One, empresa de comunicação visual (fachadas, ACM, placas, impressão, painéis de LED, outdoor, instalação e colagem).",
    quem,
    "Para responder, consulte os setores com as ferramentas sempre que a resposta depender de dados ou regras de um setor. Se envolver mais de um setor, chame as ferramentas na mesma rodada.",
    "Se uma ferramenta devolver SEM_DADOS, SEM_ACESSO ou ERRO, diga ao usuário qual parte ficou sem resposta e por quê. Nunca invente números, clientes, datas ou status.",
    "Responda em português do Brasil, direto e acionável, em texto simples: sem markdown (sem #, sem ** e sem tabelas). Use frases curtas e, para listas, linhas começando com '- '.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A sector's answer; when its model is out of quota, tries the other configured model once. */
async function consultarSetor(
  setor: DefinicaoSetor,
  pergunta: string,
  dados: Record<string, unknown>,
  origem: string,
  abortSignal: AbortSignal,
): Promise<string> {
  try {
    return await consultarSetorCom("setor", setor, pergunta, dados, origem, abortSignal);
  } catch (e) {
    if (!semCota(e) || !temModeloAlternativo()) throw e;
    return consultarSetorCom("principal", setor, pergunta, dados, origem, abortSignal);
  }
}

async function consultarSetorCom(
  papel: PapelModelo,
  setor: DefinicaoSetor,
  pergunta: string,
  dados: Record<string, unknown>,
  origem: string,
  abortSignal: AbortSignal,
): Promise<string> {
  const model = modeloIA(papel);
  if (!model) throw new Error("IA desligada");
  const { text } = await generateText({
    model,
    // The fixed skill goes first so the provider can reuse it (prompt caching); the data and
    // the question, which change every time, go after it.
    instructions: textoDaSkill(SKILLS[setor.id]),
    prompt: [
      `Pergunta recebida de: ${origem || "usuário do sistema"}`,
      `Dados atuais do Patty One (JSON):\n${JSON.stringify(dados)}`,
      `Pergunta:\n${pergunta}`,
      "Sua resposta pode ir direto para o usuário: responda em português do Brasil, em texto simples (sem markdown: sem #, sem ** e sem tabelas), curta e acionável, com no máximo 15 linhas e listas em linhas começando com '- '. Use só os dados acima; se faltar algum dado, diga o que falta em vez de supor. Ignore os passos da skill que pedem dados que não vieram e não devolva JSON.",
    ].join("\n\n"),
    maxOutputTokens: 900,
    maxRetries: 1,
    providerOptions: opcoesProvedor(papel),
    abortSignal: AbortSignal.any([abortSignal, AbortSignal.timeout(TEMPO_SETOR_MS)]),
  });
  return text.trim() || "O setor não trouxe resposta.";
}

function montarFerramentas(
  pedido: OrquestradorPedido,
  consultas: ConsultaSetor[],
  respostas: string[],
  abortSignal: AbortSignal,
): ToolSet {
  const ferramentas: ToolSet = {};
  const origem = [pedido.usuario.nome, pedido.usuario.funcoes.join("/")].filter(Boolean).join(", ");
  for (const setor of SETORES) {
    ferramentas[setor.ferramenta] = tool({
      description: setor.descricao,
      inputSchema: z.object({ pergunta: z.string().describe("A pergunta exata para o setor.") }),
      execute: async ({ pergunta }: { pergunta: string }) => {
        const registrar = (situacao: ConsultaSetor["situacao"]) =>
          consultas.push({ setor: setor.id, nome: setor.nome, situacao });
        if (!setor.fonte) {
          registrar("sem_dados");
          return respostaSemAgente(setor, "sem_dados");
        }
        const dados = pedido.dados[setor.fonte];
        if (!dados) {
          registrar("sem_acesso");
          return respostaSemAgente(setor, "sem_acesso");
        }
        try {
          const resposta = await consultarSetor(setor, pergunta, dados, origem, abortSignal);
          registrar("respondeu");
          respostas.push(resposta);
          return resposta;
        } catch (e) {
          console.error(`orquestrador: setor ${setor.id}`, e instanceof Error ? e.message : e);
          registrar("erro");
          return respostaSemAgente(setor, "erro");
        }
      },
    });
  }
  return ferramentas;
}

export async function handleOrquestrador(request: Request): Promise<Response> {
  let texto: string;
  try {
    texto = await request.text();
  } catch {
    return erro("Requisição inválida.", 400);
  }
  if (texto.length > MAX_DADOS_CHARS + 50_000) return erro("Dados grandes demais.", 413);
  let body: unknown;
  try {
    body = JSON.parse(texto);
  } catch {
    return erro("Requisição inválida.", 400);
  }
  const parsed = orquestradorRequestSchema.safeParse(body);
  if (!parsed.success) return erro("Requisição inválida.", 400);
  const pedido = parsed.data;

  if (!tokenDaRequisicao(request)) return erro("Entre na sua conta para usar o orquestrador.", 401);

  const model = modeloIA();
  if (!model) return erro("A IA não está configurada.", 503);

  const acesso = await checarAcesso(request);
  if (acesso === "sem_login") return erro("Entre na sua conta para usar o orquestrador.", 401);
  if (acesso === "nao_membro")
    return erro("O orquestrador é só para quem já foi aprovado na equipe.", 403);
  if (acesso === "limite") return erro("Você chegou ao limite de perguntas de hoje.", 429);

  const consultas: ConsultaSetor[] = [];
  const respostas: string[] = [];
  const inicio = Date.now();
  const abortSignal = AbortSignal.any([request.signal, AbortSignal.timeout(TEMPO_TOTAL_MS)]);
  const responder = (texto: string, aviso: string | null) =>
    Response.json({
      resposta: texto || "Não consegui montar uma resposta agora.",
      consultas: juntarConsultas(consultas),
      aviso,
      segundos: Math.round((Date.now() - inicio) / 1000),
    } satisfies OrquestradorResposta);

  const rodar = async (papel: PapelModelo) => {
    const modelo = modeloIA(papel);
    if (!modelo) throw new Error("IA desligada");
    const { text } = await generateText({
      model: modelo,
      instructions: instrucoesOrquestrador(pedido),
      messages: [
        ...pedido.historico.map((h) => ({
          role: h.papel === "usuario" ? ("user" as const) : ("assistant" as const),
          content: h.texto,
        })),
        { role: "user" as const, content: pedido.mensagem },
      ],
      tools: montarFerramentas(pedido, consultas, respostas, abortSignal),
      // Faster path: when the first round consulted a single sector and it answered, its answer
      // already goes to the user (it was written for them), saving one AI round.
      stopWhen: [stepCountIs(MAX_RODADAS), () => respostaUnica(consultas, respostas) !== null],
      // Last round without tools: the model has to answer with what it already has.
      prepareStep: ({ stepNumber }) =>
        stepNumber >= MAX_RODADAS - 1 ? { toolChoice: "none" as const } : undefined,
      maxOutputTokens: 1500,
      maxRetries: 1,
      providerOptions: opcoesProvedor(papel),
      abortSignal,
    });
    return text.trim() || respostaUnica(consultas, respostas) || respostas.join("\n\n");
  };

  try {
    return responder(await rodar("principal"), null);
  } catch (e) {
    console.error("orquestrador AI error", e instanceof Error ? e.message : e);
    // Sectors already answered: give their answers rather than nothing.
    if (respostas.length) {
      return responder(
        respostas.join("\n\n"),
        "O orquestrador não conseguiu juntar as respostas; abaixo vai o que os setores disseram.",
      );
    }
    if (!semCota(e)) return erro("A IA não respondeu agora. Tente de novo em instantes.", 502);
    if (!temModeloAlternativo()) return erro(MENSAGEM_SEM_COTA, 429);
  }

  // The main model is out of quota: one more try with the alternative one (AI_MODEL_SETOR).
  consultas.length = 0;
  respostas.length = 0;
  try {
    return responder(
      await rodar("setor"),
      "O modelo principal estava sem cota hoje; esta resposta usou o modelo alternativo.",
    );
  } catch (e) {
    console.error("orquestrador AI error (alternativo)", e instanceof Error ? e.message : e);
    if (respostas.length) return responder(respostas.join("\n\n"), null);
    return semCota(e)
      ? erro(MENSAGEM_SEM_COTA, 429)
      : erro("A IA não respondeu agora. Tente de novo em instantes.", 502);
  }
}
