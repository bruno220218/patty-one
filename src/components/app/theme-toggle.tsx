import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** `round` matches the top bar buttons; the default fits a menu. */
export function ThemeToggle({
  compact = false,
  round = false,
}: {
  compact?: boolean;
  round?: boolean;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  };

  const label = theme === "dark" ? "Claro" : "Escuro";
  const Icon = theme === "dark" ? Sun : Moon;

  if (round) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={`Ativar tema ${label.toLowerCase()}`}
        title={`Tema ${label.toLowerCase()}`}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:text-primary"
      >
        <Icon className="h-[18px] w-[18px]" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Ativar tema ${label.toLowerCase()}`}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        compact ? "h-9 w-9 justify-center" : "h-10 w-full px-3",
      )}
    >
      <Icon className="h-4 w-4" />
      {!compact && <span>{label}</span>}
    </button>
  );
}
