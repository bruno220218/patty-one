import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Archive, FolderOpen, ListChecks } from "lucide-react";
import logo from "@/assets/patty-logo.png.asset.json";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  {
    to: "/",
    label: "Checklists",
    icon: ListChecks,
    match: (p: string) => p === "/" || p.startsWith("/checklists"),
  },
  {
    to: "/projetos",
    label: "Projetos",
    icon: FolderOpen,
    match: (p: string) => p.startsWith("/projetos"),
  },
  {
    to: "/arquivados",
    label: "Arquivados",
    icon: Archive,
    match: (p: string) => p.startsWith("/arquivados"),
  },
] as const;

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <img src={logo.url} alt="Patty" className="h-9 w-9 rounded-full" />
      <span className="text-base font-bold tracking-tight text-foreground">Patty One</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Principal">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar/95 px-4 backdrop-blur md:hidden">
        <Brand />
        <ThemeToggle compact />
      </header>

      <main className="pb-28 md:pb-12 md:pl-60">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 md:px-10 md:py-10">
          {children}
        </div>
      </main>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Principal"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar/95 backdrop-blur md:hidden"
      >
        <div className="grid h-16 grid-cols-3">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  active ? "text-sidebar-accent-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-sidebar-accent",
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
