import { useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, RotateCcw, Sparkles, Square, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDataAction } from "@/hooks/use-data";
import { projectRepository, type Project, type ProjectBlocker } from "@/lib/data";
import { buildNextStepsRequest, NextStepsError, streamNextSteps } from "@/lib/ai/next-steps-client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BlockerPanel({ project }: { project: Project }) {
  const run = useDataAction();
  const [description, setDescription] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  const generate = async (blocker: Pick<ProjectBlocker, "id" | "description">) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setActiveId(blocker.id);
    setStreamText("");
    setErrors(({ [blocker.id]: _removed, ...rest }) => rest);
    let partial = "";
    try {
      const text = await streamNextSteps(buildNextStepsRequest(project, blocker.description), {
        signal: controller.signal,
        onText: (t) => {
          partial = t;
          setStreamText(t);
        },
      });
      await run(() => projectRepository.setBlockerSuggestion(project.id, blocker.id, text));
    } catch (error) {
      if (controller.signal.aborted) {
        if (partial.trim()) {
          await run(() =>
            projectRepository.setBlockerSuggestion(project.id, blocker.id, partial.trim()),
          );
        }
      } else {
        const message =
          error instanceof NextStepsError
            ? error.message
            : "Não foi possível conectar à IA. Verifique sua conexão e tente novamente.";
        setErrors((prev) => ({ ...prev, [blocker.id]: message }));
      }
    } finally {
      abortRef.current = null;
      setActiveId(null);
      setStreamText("");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 3 || activeId) return;
    const blocker = await run(() => projectRepository.addBlocker(project.id, description));
    if (!blocker) return;
    setDescription("");
    void generate(blocker);
  };

  const busy = activeId !== null;

  return (
    <section className="mt-10" aria-labelledby="blockers-title">
      <div className="mb-3">
        <h2 id="blockers-title" className="text-base font-semibold">
          Bloqueios
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Descreva o que está travando o projeto. A IA analisa as tarefas e o progresso e sugere
          próximos passos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="surface-card space-y-3 p-4">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex.: a tinta especial não chegou do fornecedor e a pintura está parada."
          aria-label="Descrição do bloqueio"
          rows={3}
          maxLength={2000}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || description.trim().length < 3}>
            <Sparkles />
            Sugerir próximos passos
          </Button>
        </div>
      </form>

      {project.blockers.length > 0 && (
        <ul className="mt-4 space-y-3">
          {project.blockers.map((b) => {
            const isActive = activeId === b.id;
            const resolved = b.resolvedAt !== null;
            const error = errors[b.id];
            return (
              <li key={b.id} className={cn("surface-card p-4", resolved && "opacity-75")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Registrado em {formatDateTime(b.createdAt)}
                  </p>
                  {resolved && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-status-done px-2.5 py-0.5 text-xs font-semibold text-status-done-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                      Resolvido
                    </span>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-line break-words text-sm font-medium">
                  {b.description}
                </p>

                <div className="mt-3 rounded-lg bg-accent/60 p-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                    Próximos passos sugeridos
                  </p>
                  {isActive ? (
                    streamText ? (
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
                        {streamText}
                      </p>
                    ) : (
                      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analisando o projeto…
                      </p>
                    )
                  ) : error ? (
                    <p className="mt-2 text-sm font-medium text-destructive" role="alert">
                      {error}
                    </p>
                  ) : b.suggestion ? (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
                      {b.suggestion}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Nenhuma sugestão ainda.</p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {isActive ? (
                    <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}>
                      <Square className="!h-3 !w-3" />
                      Parar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => generate(b)}
                    >
                      {b.suggestion || error ? <RotateCcw /> : <Sparkles />}
                      {error ? "Tentar novamente" : b.suggestion ? "Gerar novamente" : "Gerar sugestões"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isActive}
                    onClick={() =>
                      run(
                        () => projectRepository.setBlockerResolved(project.id, b.id, !resolved),
                        resolved ? "Bloqueio reaberto." : "Bloqueio resolvido.",
                      )
                    }
                  >
                    {resolved ? <Undo2 /> : <CheckCircle2 />}
                    {resolved ? "Reabrir" : "Marcar como resolvido"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isActive}
                    className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Excluir bloqueio"
                    onClick={() =>
                      run(
                        () => projectRepository.removeBlocker(project.id, b.id),
                        "Bloqueio excluído.",
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
