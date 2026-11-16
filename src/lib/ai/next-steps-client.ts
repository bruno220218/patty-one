import type { Project } from "@/lib/data";
import type { NextStepsRequest } from "./next-steps-schema";

export function buildNextStepsRequest(project: Project, blocker: string): NextStepsRequest {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  return {
    project: {
      name: project.name,
      description: project.description,
      dueDate: project.dueDate,
      createdAt: project.createdAt,
      tasks: project.tasks.map((t) => ({
        title: t.title,
        done: t.completedAt !== null,
        completedAt: t.completedAt,
      })),
    },
    blocker,
    today,
  };
}

export class NextStepsError extends Error {}

/**
 * Streams next-step suggestions. Calls onText with the accumulated text as it arrives
 * and resolves with the final text. Throws NextStepsError with a user-facing message.
 */
export async function streamNextSteps(
  payload: NextStepsRequest,
  { signal, onText }: { signal?: AbortSignal; onText: (text: string) => void },
): Promise<string> {
  const response = await fetch("/api/next-steps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: signal ?? null,
  });

  if (!response.ok || !response.body) {
    let message = "Não foi possível gerar sugestões agora. Tente novamente em instantes.";
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* keep default */
    }
    throw new NextStepsError(message);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";
  let streamError: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const event = JSON.parse(data) as { type: string; delta?: string; errorText?: string };
        if (event.type === "text-delta" && event.delta) {
          text += event.delta;
          onText(text);
        } else if (event.type === "error") {
          streamError = event.errorText ?? "Não foi possível gerar sugestões agora.";
        }
      } catch {
        /* ignore malformed frame */
      }
    }
  }

  if (streamError) throw new NextStepsError(streamError);
  if (!text.trim()) {
    throw new NextStepsError("A IA não retornou sugestões para este bloqueio.");
  }
  return text.trim();
}
