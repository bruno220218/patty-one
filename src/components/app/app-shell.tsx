import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileText,
  FolderOpen,
  Hourglass,
  Lightbulb,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  MonitorPlay,
  Trash2,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useNotifications } from "@/hooks/use-data";
import { cn } from "@/lib/utils";
import { FUNCOES, paineisRepository, type CurrentUser } from "@/lib/data";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "./empty-state";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";

/** Served from public/ so it works on any host. */
const LOGO_URL = "/patty-logo.png";

type NavTo =
  | "/checklists"
  | "/projetos"
  | "/liberacoes"
  | "/arquivados"
  | "/equipe"
  | "/relatorios"
  | "/lixeira"
  | "/briefings"
  | "/visitas"
  | "/paineis"
  | "/cis";

type NavItem = { to: NavTo; label: string; icon: typeof ListChecks; gestorOnly?: boolean };

// Same structure as the PattyOne (mídia) app: grouped menu, secondary items at the bottom.
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operação",
    items: [
      { to: "/projetos", label: "Projetos", icon: FolderOpen },
      { to: "/liberacoes", label: "Liberações", icon: FileCheck2 },
      { to: "/briefings", label: "Briefings", icon: Lightbulb },
      { to: "/visitas", label: "Visitas técnicas", icon: MapPin },
    ],
  },
  {
    title: "Mídia",
    items: [
      { to: "/paineis", label: "Painéis RGB", icon: MonitorPlay },
      { to: "/cis", label: "CI", icon: FileText },
    ],
  },
  {
    title: "Gestão",
    items: [
      { to: "/checklists", label: "Checklists", icon: ListChecks, gestorOnly: true },
      { to: "/equipe", label: "Equipe", icon: Users, gestorOnly: true },
      { to: "/relatorios", label: "Relatórios", icon: BarChart3, gestorOnly: true },
    ],
  },
];

const FOOTER_ITEMS: NavItem[] = [
  { to: "/arquivados", label: "Arquivados", icon: Archive },
  { to: "/lixeira", label: "Lixeira", icon: Trash2 },
];

const ALL_ITEMS = [...NAV_GROUPS.flatMap((g) => g.items), ...FOOTER_ITEMS];

/** Pages outside the menu still get a name in the "Início › …" trail. */
const OUTRAS_PAGINAS: { to: string; label: string }[] = [
  { to: "/listas", label: "Listas da liberação" },
];

const BARE_PATHS = ["/auth", "/reset-password"];
const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 76;
const COLLAPSED_KEY = "pattyone:sidebar-collapsed";

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

/** Collapsed desktop menu, remembered per browser; Ctrl/Cmd + B toggles it. */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "true");
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, String(!c));
      } catch {
        /* ignore */
      }
      return !c;
    });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  return { collapsed, toggle };
}

const iniciais = (nome: string) =>
  nome
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

const funcoesTexto = (me: CurrentUser) =>
  !me.isMember
    ? "Aguardando aprovação"
    : FUNCOES.filter((f) => me.funcoes.includes(f.value))
        .map((f) => f.label)
        .join(" · ") || "Equipe";

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
        collapsed && "justify-center px-0",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
          : "text-sidebar-foreground hover:translate-x-0.5 hover:bg-sidebar-hover hover:text-sidebar-primary",
      )}
    >
      {active && (
        <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
      )}
      <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function UserMenu({
  me,
  collapsed,
  onSignOut,
}: {
  me: CurrentUser;
  collapsed: boolean;
  onSignOut: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "mt-2 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-hover",
            collapsed && "justify-center px-0",
          )}
          aria-label={collapsed ? `${me.name}: menu da conta` : undefined}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
            {iniciais(me.name)}
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-sidebar-primary">
                {me.name}
              </span>
              <span className="block truncate text-[11px] text-sidebar-foreground">
                {funcoesTexto(me)}
              </span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{me.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{funcoesTexto(me)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({
  me,
  pending,
  collapsed,
  isActive,
  onSignOut,
}: {
  me: CurrentUser | null | undefined;
  pending: boolean;
  collapsed: boolean;
  isActive: (to: string) => boolean;
  onSignOut: () => void;
}) {
  const visible = (i: NavItem) => !pending && (!i.gestorOnly || me?.isGestor);
  return (
    <div className="flex h-full flex-col">
      <Link
        to="/projetos"
        className={cn("flex items-center gap-3 px-4 py-5", collapsed && "justify-center px-0")}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
          <img src={LOGO_URL} alt="Patty" className="h-9 w-9 rounded-full object-contain" />
        </span>
        {!collapsed && (
          <span className="min-w-0">
            <span className="block leading-tight font-semibold text-sidebar-primary">
              Patty One
            </span>
            <span className="block truncate text-[11px] leading-tight text-sidebar-foreground">
              Produção e Comunicação Visual
            </span>
          </span>
        )}
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Principal">
        {NAV_GROUPS.map((g) => {
          const items = g.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div key={g.title}>
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-sidebar-hover" />
              ) : (
                <div className="mb-2 px-3 text-[10px] font-semibold tracking-wider text-sidebar-foreground/80 uppercase">
                  {g.title}
                </div>
              )}
              <div className="space-y-1">
                {items.map((it) => (
                  <NavLink key={it.to} item={it} active={isActive(it.to)} collapsed={collapsed} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border px-3 py-3">
        {FOOTER_ITEMS.filter(visible).map((it) => (
          <NavLink key={it.to} item={it} active={isActive(it.to)} collapsed={collapsed} />
        ))}
        {me && <UserMenu me={me} collapsed={collapsed} onSignOut={onSignOut} />}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = BARE_PATHS.some((p) => pathname.startsWith(p));
  // Liberação forms mirror a 12-column spreadsheet, so they get a wider page.
  const wide = pathname.startsWith("/liberacoes/");
  const { data: me } = useCurrentUser();
  const signOut = useSignOut();
  const showNotifications = !bare && Boolean(me?.isMember);
  const { data: notifications = [] } = useNotifications(me?.id, showNotifications);
  const { collapsed, toggle } = useCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Painéis RGB due-date notices: a daily database job creates them; opening the app also
  // does, in case the job isn't on. Each notice goes out once, so repeating is harmless.
  const isMember = Boolean(me?.isMember);
  useEffect(() => {
    if (isMember) paineisRepository.gerarAvisos().catch(() => undefined);
  }, [isMember]);

  // The phone menu closes after picking a page.
  useEffect(() => setMobileOpen(false), [pathname]);

  if (bare) {
    return (
      <TooltipProvider delayDuration={300}>
        <main className="min-h-screen px-4 py-10">{children}</main>
      </TooltipProvider>
    );
  }

  const pending = Boolean(me && !me.isMember);
  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);
  const atual = [...ALL_ITEMS, ...OUTRAS_PAGINAS].find((i) => isActive(i.to));
  const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="min-h-screen w-full bg-background"
        style={{ ["--sidebar-w" as string]: `${width + 32}px` }}
      >
        {/* Desktop: floating blue menu */}
        <aside
          className="fixed top-4 bottom-4 left-4 z-30 hidden overflow-hidden rounded-2xl bg-sidebar shadow-[var(--shadow-floating)] transition-[width] duration-300 ease-in-out md:block"
          style={{ width }}
        >
          <SidebarBody
            me={me}
            pending={pending}
            collapsed={collapsed}
            isActive={isActive}
            onSignOut={signOut}
          />
        </aside>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title="Ctrl/Cmd + B"
          className="fixed top-1/2 z-40 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-foreground shadow-[var(--shadow-floating)] transition-[left,color] duration-300 ease-in-out hover:text-primary md:flex"
          style={{ left: 16 + width - 14 }}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {/* Phone: the same menu as a drawer */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="top-4 bottom-4 left-4 h-auto w-[260px] rounded-2xl border-0 bg-sidebar p-0 text-sidebar-primary shadow-[var(--shadow-floating)] md:hidden"
          >
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarBody
              me={me}
              pending={pending}
              collapsed={false}
              isActive={isActive}
              onSignOut={signOut}
            />
          </SheetContent>
        </Sheet>

        <div className="transition-[padding] duration-300 ease-in-out md:pl-[var(--sidebar-w)]">
          <header className="flex items-center gap-3 px-4 py-4 md:px-6">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-colors hover:text-primary md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <nav aria-label="Você está em" className="hidden items-center gap-1.5 text-sm sm:flex">
              <Link to="/projetos" className="text-muted-foreground hover:text-primary">
                Início
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{atual?.label ?? "Patty One"}</span>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              {showNotifications && (
                <NotificationBell notifications={notifications} variant="icon" />
              )}
              <ThemeToggle round />
              {me && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${me.name}: menu da conta`}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-sm"
                    >
                      {iniciais(me.name)}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <span className="block truncate text-sm font-medium">{me.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {funcoesTexto(me)}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </header>

          <main className="px-4 pb-12 md:px-6">
            <div className={cn("mx-auto w-full", wide ? "max-w-[96rem]" : "max-w-6xl")}>
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
        </div>
      </div>
    </TooltipProvider>
  );
}
