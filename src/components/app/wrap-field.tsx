import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/**
 * Text field that wraps long text onto new lines and grows in height instead of cutting it off.
 * Optional `suggestions` show a filtered list while typing (any text is still accepted).
 * Enter picks the highlighted suggestion; otherwise Enter adds a line only when `multiline`.
 */
export function WrapField({
  value,
  onChange,
  suggestions,
  multiline = false,
  className,
  id,
  placeholder,
  "aria-label": ariaLabel,
  inputMode,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[] | undefined;
  multiline?: boolean | undefined;
  className?: string | undefined;
  id?: string | undefined;
  placeholder?: string | undefined;
  "aria-label"?: string | undefined;
  inputMode?: "text" | "decimal" | "numeric" | "tel" | undefined;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Grow to fit the text (and re-fit when the column width changes).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  const matches = useMemo(() => {
    if (!suggestions?.length) return [];
    const q = fold(value);
    const list = q ? suggestions.filter((s) => fold(s).includes(q) && fold(s) !== q) : suggestions;
    return list.slice(0, 8);
  }, [suggestions, value]);

  const open = focused && !dismissed && matches.length > 0;

  const pick = (s: string) => {
    onChange(s);
    setDismissed(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (open && e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === "Escape") {
      setDismissed(true);
    } else if (e.key === "Enter" && !e.shiftKey) {
      if (open) {
        e.preventDefault();
        pick(matches[highlight] ?? value);
      } else if (!multiline) {
        e.preventDefault();
      }
    }
  };

  const field = (
    <textarea
      ref={ref}
      id={id}
      rows={1}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      inputMode={inputMode}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => {
        onChange(multiline ? e.target.value : e.target.value.replace(/\n/g, " "));
        setDismissed(false);
        setHighlight(0);
      }}
      onFocus={() => {
        setFocused(true);
        setDismissed(false);
      }}
      onBlur={() => setFocused(false)}
      onKeyDown={onKeyDown}
      className={cn(
        "block w-full min-w-0 resize-none overflow-hidden bg-transparent px-2 py-2 text-sm leading-snug break-words outline-none placeholder:text-muted-foreground/60 focus:bg-accent/60",
        className,
      )}
    />
  );

  if (!suggestions?.length) return field;

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>{field}</PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={2}
        className="w-[max(var(--radix-popover-trigger-width),16rem)] p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <ul role="listbox" className="max-h-64 overflow-y-auto">
          {matches.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === highlight}
              // mousedown keeps focus in the field
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
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
