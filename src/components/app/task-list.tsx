import { useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { MoveDirection } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TaskListItem {
  id: string;
  title: string;
  completedAt?: string | null;
}

interface TaskListProps {
  tasks: TaskListItem[];
  /** Show checkboxes (projects). */
  checkable?: boolean;
  /** Tasks can only be checked; no add/edit/delete/reorder. */
  locked?: boolean;
  emptyText: string;
  onToggle?: (taskId: string, done: boolean) => void;
  onAdd: (title: string) => Promise<unknown>;
  onRename: (taskId: string, title: string) => Promise<unknown>;
  onRemove: (taskId: string) => void;
  onMove: (taskId: string, direction: MoveDirection) => void;
}

export function TaskList({
  tasks,
  checkable = false,
  locked = false,
  emptyText,
  onToggle,
  onAdd,
  onRename,
  onRemove,
  onMove,
}: TaskListProps) {
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const result = await onAdd(newTitle);
    if (result !== undefined) setNewTitle("");
  };

  const startEdit = (task: TaskListItem) => {
    setEditingId(task.id);
    setEditTitle(task.title);
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId || !editTitle.trim()) return;
    const result = await onRename(editingId, editTitle);
    if (result !== undefined) setEditingId(null);
  };

  return (
    <div className="space-y-2">
      {tasks.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      )}

      <ul className="space-y-2">
        {tasks.map((task, index) => {
          const done = Boolean(task.completedAt);
          const isEditing = editingId === task.id;
          return (
            <li key={task.id} className="surface-card flex items-center gap-3 px-4 py-3">
              {checkable && (
                <Checkbox
                  checked={done}
                  onCheckedChange={(v) => onToggle?.(task.id, v === true)}
                  aria-label={done ? `Desmarcar ${task.title}` : `Concluir ${task.title}`}
                  className="h-5 w-5 rounded-[5px]"
                />
              )}

              {isEditing ? (
                <form onSubmit={saveEdit} className="flex flex-1 items-center gap-2">
                  <Input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
                    aria-label="Título da tarefa"
                    className="h-9"
                  />
                  <Button type="submit" size="icon" aria-label="Salvar tarefa">
                    <Check />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Cancelar edição"
                    onClick={() => setEditingId(null)}
                  >
                    <X />
                  </Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "break-words text-sm font-medium",
                        done && "text-muted-foreground line-through",
                      )}
                    >
                      {task.title}
                    </p>
                    {task.completedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Concluída em {formatDateTime(task.completedAt)}
                      </p>
                    )}
                  </div>

                  {!locked && (
                    <div className="flex shrink-0 items-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label={`Subir ${task.title}`}
                        disabled={index === 0}
                        onClick={() => onMove(task.id, "up")}
                      >
                        <ChevronUp />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label={`Descer ${task.title}`}
                        disabled={index === tasks.length - 1}
                        onClick={() => onMove(task.id, "down")}
                      >
                        <ChevronDown />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label={`Editar ${task.title}`}
                        onClick={() => startEdit(task)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Excluir ${task.title}`}
                        onClick={() => onRemove(task.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {!locked && (
        <form onSubmit={handleAdd} className="surface-card flex items-center gap-2 p-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Nova tarefa"
            aria-label="Nova tarefa"
            className="h-10 border-0 shadow-none focus-visible:ring-0"
          />
          <Button type="submit" disabled={!newTitle.trim()} className="h-10">
            <Plus />
            Adicionar
          </Button>
        </form>
      )}
    </div>
  );
}
