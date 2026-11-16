import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { joinMultiplos, splitMultiplos } from "@/lib/data";
import { cn } from "@/lib/utils";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/**
 * Picks several options for one cell. Each pick becomes a tag; the value is stored as
 * "A, B, C". Typing filters the suggestions; Enter (or comma) adds the highlighted
 * suggestion or the typed text; Backspace on an empty box removes the last tag.
 */
export function MultiPickField({
  value,
  onChange,
  suggestions,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  "aria-label"?: string | undefined;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const items = splitMultiplos(value);
  const chosen = new Set(items.map(fold));

  const matches = useMemo(() => {
    const q = fold(query);
    return suggestions
      .filter((s) => !chosen.has(fold(s)) && (!q || fold(s).includes(q)))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, query, value]);

  const open = focused && !dismissed && matches.length > 0;

  const add = (item: string) => {
    if (!item.trim()) return;
    onChange(joinMultiplos([...items, item]));
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  };
  const remove = (index: number) => {
    onChange(joinMultiplos(items.filter((_, i) => i !== index)));
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (open && e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (open && e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = open ? matches[highlight] : undefined;
      add(pick ?? query);
    } else if (e.key === ",") {
      e.preventDefault();
      add(query);
    } else if (e.key === "Backspace" && query === "" && items.length > 0) {
      e.preventDefault();
      remove(items.length - 1);
    } else if (e.key === "Escape") {
      setDismissed(true);
    }
  };

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex min-h-9 w-full cursor-text flex-wrap items-start gap-1 px-1.5 py-1.5",
            focused && "bg-accent/60",
          )}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
              inputRef.current?.focus();
            }
          }}
        >
          {items.map((item, i) => (
            <span
              key={`${item}-${i}`}
              className="inline-flex max-w-full items-start gap-0.5 rounded bg-secondary py-0.5 pl-1.5 pr-0.5 text-xs font-medium leading-snug text-secondary-foreground"
            >
              <span className="break-words">{item}</span>
              <button
                type="button"
                aria-label={`Remover ${item}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => remove(i)}
                className="mt-px shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={query}
            aria-label={ariaLabel}
            placeholder={items.length ? "" : "Selecione…"}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setDismissed(false);
              setHighlight(0);
            }}
            onFocus={() => {
              setFocused(true);
              setDismissed(false);
            }}
            onBlur={() => {
              setFocused(false);
              // Keep what was typed without needing Enter.
              if (query.trim()) add(query);
            }}
            onKeyDown={onKeyDown}
            className="h-6 min-w-[3rem] flex-1 bg-transparent px-0.5 text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="w-[max(var(--radix-popover-trigger-width),16rem)] p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto">
          {matches.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                add(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "cursor-pointer rounded px-2 py-1.5 text-sm",
                i === highlight && "bg-accent text-accent-foreground",
              )}
            >
              {s}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
