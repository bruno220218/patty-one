import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, BarChart3, FolderOpen, Hourglass, ListChecks, LogOut, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useNotifications } from "@/hooks/use-data";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";

/** Served from public/ so it works on any host (not only Lovable). */
const LOGO_URL = "/patty-logo.png";

type NavItem = {
  to: "/checklists" | "/projetos" | "/arquivados" | "/equipe" | "/relatorios";
  label: string;
  icon: typeof ListChecks;
  gestorOnly?: boolean;
};

const NAV: NavItem[] = [
  { to: "/checklists", label: "Checklists", icon: ListChecks, gestorOnly: true },
  { to: "/projetos", label: "Projetos", icon: FolderOpen },
  { to: "/arquivados", label: "Arquivados", icon: Archive },
  { to: "/equipe", label: "Equipe", icon: Users, gestorOnly: true },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, gestorOnly: true },
];

const BARE_PATHS = ["/auth", "/reset-password"];

function Brand() {
  return (
    <Link to="/projetos" className="flex items-center gap-2.5">
      <img src={LOGO_URL} alt="Patty" className="h-9 w-9 rounded-full" />
      <span className="text-base font-bold tracking-tight text-foreground">Patty One</span>
    </Link>
  );
}

function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = BARE_PATHS.some((p) => pathname.startsWith(p));
  const { data: me } = useCurrentUser();
  const signOut = useSignOut();
  const showNotifications = !bare && Boolean(me?.isGestor);
  const { data: notifications = [] } = useNotifications(me?.id, showNotifications);

  if (bare) {
    return (
      <TooltipProvider delayDuration={300}>
        <main className="min-h-screen px-4 py-10">{children}</main>
      </TooltipProvider>
    );
  }

  const pending = Boolean(me && !me.isMember);
  const items = pending ? [] : NAV.filter((i) => !i.gestorOnly || me?.isGestor);
  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen w-full">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
          <div className="px-2">
            <Brand />
          </div>
          <nav className="mt-8 flex flex-col gap-1" aria-label="Principal">
            {items.map((item) => {
              const active = isActive(item.to);
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
          <div className="mt-auto space-y-1">
            {me && (
              <div className="mb-2 rounded-lg px-3 py-2">
                <p className="truncate text-sm font-semibold">{me.name}</p>
                <p className="text-xs text-muted-foreground">
                  {me.isGestor ? "Gestão" : me.isMember ? "Equipe" : "Aguardando aprovação"}
                </p>
              </div>
            )}
            {showNotifications && (
              <NotificationBell notifications={notifications} variant="sidebar" />
            )}
            <ThemeToggle />
            {me && (
              <button
                type="button"
                onClick={signOut}
                className="inline-flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            )}
          </div>
        </aside>

        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar/95 px-4 backdrop-blur md:hidden">
          <Brand />
          <div className="flex items-center gap-1">
            {showNotifications && <NotificationBell notifications={notifications} variant="icon" />}
            <ThemeToggle compact />
            {me && (
              <button
                type="button"
                onClick={signOut}
                aria-label="Sair"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        <main className="pb-28 md:pb-12 md:pl-60">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 md:px-10 md:py-10">
            {pending ? (
              <EmptyState
                icon={Hourglass}
                title="Aguardando aprovação"
                description="Sua conta foi criada. Peça a uma pessoa gestora para liberar seu acesso na área Equipe; depois, é só recarregar a página."
                action={
                  <Button variant="outline" onClick={signOut}>
                    <LogOut className="h-4 w-4" />
                    Sair
                  </Button>
                }
              />
            ) : (
              children
            )}
          </div>
        </main>

        {/* Mobile bottom bar */}
        <nav
          aria-label="Principal"
          hidden={items.length === 0}
          className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar/95 backdrop-blur md:hidden"
        >
          <div
            className="grid h-16"
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
          >
            {items.map((item) => {
              const active = isActive(item.to);
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
    </TooltipProvider>
  );
}
