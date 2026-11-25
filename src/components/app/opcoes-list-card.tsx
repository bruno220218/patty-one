import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Any list item with an id and a text (liberação options, production sectors…). */
export type OpcaoLista = { id: string; valor: string };

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** One editable list: add (also filters while typing), rename, reorder and remove. */
export function OpcoesListCard<T extends OpcaoLista>({
  titulo,
  opcoes,
  disabled,
  onAdd,
  onRename,
  onRemove,
  onReorder,
}: {
  titulo: string;
  opcoes: T[];
  disabled?: boolean;
  onAdd: (valor: string) => Promise<unknown>;
  onRename: (id: string, valor: string) => Promise<unknown>;
  onRemove: (opcao: T) => void;
  onReorder: (ids: string[]) => Promise<unknown>;
}) {
  const [texto, setTexto] = useState("");
  const [editing, setEditing] = useState<{ id: string; valor: string } | null>(null);
  const filtro = fold(texto);
  const visiveis = filtro ? opcoes.filter((o) => fold(o.valor).includes(filtro)) : opcoes;
  const existe = opcoes.some((o) => fold(o.valor) === filtro);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim() || existe) return;
    const ok = await onAdd(texto);
    if (ok !== undefined) setTexto("");
  };

  const move = (index: number, delta: -1 | 1) => {
    const ids = opcoes.map((o) => o.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    void onReorder(ids);
  };

  const saveRename = async () => {
    if (!editing) return;
    const ok = await onRename(editing.id, editing.valor);
    if (ok !== undefined) setEditing(null);
  };

  return (
    <section className="surface-card flex min-h-0 flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <span className="rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">
          {opcoes.length}
        </span>
      </header>

      <form onSubmit={add} className="flex gap-2 border-b border-border p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar ou adicionar…"
            aria-label={`Buscar ou adicionar em ${titulo}`}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          className="h-8"
          disabled={disabled || !texto.trim() || existe}
          title={existe ? "Já está na lista" : undefined}
        >
          <Plus />
          Adicionar
        </Button>
      </form>

      <ul className="max-h-80 flex-1 divide-y divide-border overflow-y-auto">
        {visiveis.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            {filtro ? "Nada encontrado. Clique em Adicionar para incluir." : "Lista vazia."}
          </li>
        )}
        {visiveis.map((o) => {
          const index = opcoes.findIndex((x) => x.id === o.id);
          const isEditing = editing?.id === o.id;
          return (
            <li key={o.id} className="group flex items-center gap-1 px-3 py-1.5">
              {isEditing ? (
                <form
                  className="flex flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveRename();
                  }}
                >
                  <Input
                    autoFocus
                    value={editing.valor}
                    onChange={(e) => setEditing({ id: o.id, valor: e.target.value })}
                    onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                    aria-label={`Novo nome para ${o.valor}`}
                    className="h-7 text-sm"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="Salvar"
                  >
                    <Check />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="Cancelar"
                    onClick={() => setEditing(null)}
                  >
                    <X />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 break-words text-sm">{o.valor}</span>
                  <div
                    className={cn(
                      "flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
                      disabled && "pointer-events-none opacity-30",
                    )}
                  >
                    {!filtro && (
                      <>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label={`Subir ${o.valor}`}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label={`Descer ${o.valor}`}
                          disabled={index === opcoes.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown />
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={`Renomear ${o.valor}`}
                      onClick={() => setEditing({ id: o.id, valor: o.valor })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remover ${o.valor}`}
                      onClick={() => onRemove(o)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
