import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Archive,
  BarChart3,
  LayoutDashboard,
  Calculator,
  CalendarDays,
  CalendarRange,
  Camera,
  Images,
  Map as MapIcon,
  Ruler,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileText,
  FolderOpen,
  History,
  Hourglass,
  Lightbulb,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  Package,
  MonitorPlay,
  Settings,
  ShoppingCart,
  Trash2,
  Truck,
  Upload,
  Users,
  UsersRound,
  Home,
  Percent,
  Receipt,
  Wallet,
  Zap,
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
  | "/visitas/nova"
  | "/paineis"
  | "/paineis/midias"
  | "/medidas"
  | "/status-servicos"
  | "/cis"
  | "/cadastros"
  | "/comercial"
  | "/comercial/historico"
  | "/midia-ooh"
  | "/midia-ooh/bissemanas"
  | "/configuracoes"
  | "/importar"
  | "/producao"
  | "/planejamento"
  | "/planejamento/programacao"
  | "/planejamento/equipes"
  | "/planejamento/veiculos"
  | "/planejamento/catalogos"
  | "/financeiro"
  | "/dashboard";

type NavItem = {
  id: string;
  label: string;
  icon: typeof ListChecks;
  /** Missing when the screen doesn't exist yet ("em breve"). */
  to?: NavTo;
  /** Opens the page already filtered (e.g. ?modelo=midia). */
  search?: Record<string, string>;
  gestorOnly?: boolean;
};
type NavSub = { titulo?: string; itens: NavItem[] };
/** Top level of the menu: a sector, shown to people with one of its functions (and gestão). */
type Setor = {
  titulo: string;
  funcoes?: string[];
  /** Only for people with one of its functions: gestão already has these items elsewhere. */
  soParaFuncao?: boolean;
  subs: NavSub[];
};

const SETORES: Setor[] = [
  {
    titulo: "Comercial",
    funcoes: ["comercial"],
    subs: [
      {
        titulo: "Vendas",
        itens: [
          { id: "vendas", label: "Propostas e pedidos", icon: ShoppingCart, to: "/comercial" },
          {
            id: "historico-sige",
            label: "Histórico SIGE",
            icon: History,
            to: "/comercial/historico",
          },
          { id: "pontos-midia", label: "Mapeamento das áreas", icon: MapIcon, to: "/midia-ooh" },
          {
            id: "bissemanas-comercial",
            label: "Datas de colagens",
            icon: CalendarDays,
            to: "/midia-ooh/bissemanas",
          },
        ],
      },
      {
        titulo: "Briefing",
        itens: [
          {
            id: "briefing-criacao",
            label: "Briefing Criação",
            icon: Lightbulb,
            to: "/briefings",
            search: { destino: "criacao" },
          },
          {
            id: "briefing-orcamento",
            label: "Briefing Orçamento",
            icon: Calculator,
            to: "/briefings",
            search: { destino: "projetos_especiais" },
          },
        ],
      },
      {
        titulo: "Liberação",
        itens: [
          {
            id: "lib-projetos",
            label: "Liberação - Projetos Especiais",
            icon: FileCheck2,
            to: "/liberacoes",
            search: { modelo: "projeto" },
          },
          {
            id: "lib-midias",
            label: "Liberação - Mídias",
            icon: FileCheck2,
            to: "/liberacoes",
            search: { modelo: "midia" },
          },
        ],
      },
      {
        titulo: "Acompanhamento",
        itens: [
          {
            id: "checking",
            label: "Checking Fotográfico",
            icon: Camera,
            to: "/cis",
            search: { aba: "fotos" },
          },
          {
            id: "checkout",
            label: "Checkout Fotográfico",
            icon: Images,
            to: "/cis",
            search: { aba: "checkout" },
          },
          {
            id: "status-servicos",
            label: "Status Serviços",
            icon: Activity,
            to: "/status-servicos",
          },
        ],
      },
      {
        itens: [
          { id: "medidas", label: "Medidas", icon: Ruler, to: "/medidas" },
          {
            id: "solicitar-visita",
            label: "Solicitar Visita Técnica",
            icon: MapPin,
            to: "/visitas/nova",
          },
          { id: "com-cadastros", label: "Cadastros", icon: UsersRound, to: "/cadastros" },
          { id: "com-ci", label: "CI", icon: FileText, to: "/cis" },
        ],
      },
    ],
  },
  {
    titulo: "Produção",
    funcoes: ["producao", "pcp", "montagem"],
    subs: [
      {
        titulo: "Programação",
        itens: [
          {
            id: "programacao",
            label: "Programação Produção",
            icon: CalendarRange,
            to: "/planejamento/programacao",
          },
          { id: "cronograma", label: "Cronograma", icon: CalendarDays, to: "/planejamento" },
          { id: "ordens", label: "Ordens de produção", icon: ClipboardList, to: "/producao" },
        ],
      },
      {
        titulo: "Liberações",
        itens: [
          {
            id: "prod-lib-midia",
            label: "Liberações Mídia",
            icon: FileCheck2,
            to: "/liberacoes",
            search: { modelo: "midia" },
          },
        ],
      },
      {
        itens: [
          { id: "mapeamento", label: "Mapeamento das áreas", icon: MapIcon, to: "/midia-ooh" },
          {
            id: "datas-colagens",
            label: "Datas de colagens",
            icon: CalendarDays,
            to: "/midia-ooh/bissemanas",
          },
        ],
      },
      {
        titulo: "Cadastros da produção",
        itens: [
          {
            id: "equipes-planejamento",
            label: "Equipes de planejamento",
            icon: UsersRound,
            to: "/planejamento/equipes",
          },
          { id: "veiculos", label: "Veículos", icon: Truck, to: "/planejamento/veiculos" },
          {
            id: "catalogos",
            label: "Produtos, serviços e colaboradores",
            icon: Package,
            to: "/planejamento/catalogos",
          },
        ],
      },
    ],
  },
  {
    titulo: "Criação",
    funcoes: ["criacao"],
    subs: [
      {
        itens: [
          {
            id: "cri-briefings",
            label: "Briefings",
            icon: Lightbulb,
            to: "/briefings",
            search: { destino: "criacao" },
          },
          { id: "cri-liberacoes", label: "Liberações", icon: FileCheck2, to: "/liberacoes" },
          { id: "cri-medidas", label: "Medidas", icon: Ruler, to: "/medidas" },
          { id: "cri-projetos", label: "Projetos", icon: FolderOpen, to: "/projetos" },
        ],
      },
      {
        titulo: "Painéis RGB",
        itens: [
          { id: "cri-paineis", label: "Painéis", icon: MonitorPlay, to: "/paineis" },
          { id: "cri-cis", label: "CI's", icon: FileText, to: "/cis" },
          { id: "cri-midias", label: "Mídias", icon: Images, to: "/paineis/midias" },
        ],
      },
    ],
  },
  {
    titulo: "Projetos Especiais",
    funcoes: ["projetos_especiais"],
    subs: [
      {
        itens: [
          {
            id: "pe-briefings",
            label: "Briefings",
            icon: Lightbulb,
            to: "/briefings",
            search: { destino: "projetos_especiais" },
          },
          { id: "pe-liberacoes", label: "Liberações", icon: FileCheck2, to: "/liberacoes" },
          { id: "pe-medidas", label: "Medidas", icon: Ruler, to: "/medidas" },
          { id: "pe-projetos", label: "Projetos", icon: FolderOpen, to: "/projetos" },
        ],
      },
    ],
  },
  {
    titulo: "PCP",
    // Direção approves liberações; montagem and produção carry out projects and visitas.
    funcoes: ["pcp", "direcao", "montagem", "producao"],
    subs: [
      {
        itens: [
          {
            id: "pcp-checklists",
            label: "Checklist",
            icon: ListChecks,
            to: "/checklists",
          },
          { id: "pcp-projetos", label: "Projetos", icon: FolderOpen, to: "/projetos" },
          { id: "pcp-liberacoes", label: "Liberações", icon: FileCheck2, to: "/liberacoes" },
          { id: "pcp-visitas", label: "Visitas técnicas", icon: MapPin, to: "/visitas" },
        ],
      },
    ],
  },
  {
    // Checking fotográfico only needs its own page (the rest of Comercial isn't theirs).
    titulo: "Checking",
    funcoes: ["checking"],
    soParaFuncao: true,
    subs: [
      {
        itens: [
          {
            id: "chk-checking",
            label: "Checking Fotográfico",
            icon: Camera,
            to: "/cis",
            search: { aba: "fotos" },
          },
          {
            id: "chk-checkout",
            label: "Checkout Fotográfico",
            icon: Images,
            to: "/cis",
            search: { aba: "checkout" },
          },
        ],
      },
    ],
  },
  {
    titulo: "Financeiro",
    funcoes: ["financeiro", "direcao"],
    subs: [
      {
        itens: [
          {
            id: "contas-receber",
            label: "Contas a receber",
            icon: Wallet,
            to: "/financeiro",
            search: { aba: "receber" },
          },
          {
            id: "contas-pagar",
            label: "Contas a pagar",
            icon: Receipt,
            to: "/financeiro",
            search: { aba: "pagar" },
          },
          {
            id: "comissoes",
            label: "Comissões",
            icon: Percent,
            to: "/financeiro",
            search: { aba: "comissoes" },
          },
          {
            id: "aluguel-pontos",
            label: "Aluguel dos pontos",
            icon: Home,
            to: "/financeiro",
            search: { aba: "aluguel" },
          },
          {
            id: "energia",
            label: "Contratos de energia",
            icon: Zap,
            to: "/financeiro",
            search: { aba: "energia" },
          },
        ],
      },
    ],
  },
  {
    // Gestão also sees every sector above.
    titulo: "Gestão",
    funcoes: ["gestor"],
    subs: [
      {
        itens: [
          {
            id: "dashboard",
            label: "Dashboard",
            icon: LayoutDashboard,
            to: "/dashboard",
            gestorOnly: true,
          },
          {
            id: "importar",
            label: "Importar cadastros",
            icon: Upload,
            to: "/importar",
            gestorOnly: true,
          },
          { id: "equipe", label: "Equipe", icon: Users, to: "/equipe", gestorOnly: true },
          { id: "cadastros", label: "Cadastros", icon: UsersRound, to: "/cadastros" },
          { id: "arquivados", label: "Arquivados", icon: Archive, to: "/arquivados" },
          { id: "lixeira", label: "Lixeira", icon: Trash2, to: "/lixeira" },
          {
            id: "relatorios",
            label: "Relatórios",
            icon: BarChart3,
            to: "/relatorios",
            gestorOnly: true,
          },
        ],
      },
    ],
  },
];

const FOOTER_ITEMS: NavItem[] = [
  { id: "configuracoes", label: "Configurações", icon: Settings, to: "/configuracoes" },
];

/** Same page in several sectors (e.g. Projetos) lights up wherever it appears. */
const chaveItem = (i: NavItem) => `${i.to ?? i.id}?${new URLSearchParams(i.search).toString()}`;

const ALL_ITEMS = [...SETORES.flatMap((s) => s.subs.flatMap((sub) => sub.itens)), ...FOOTER_ITEMS];

/** Pages outside the menu still get a name in the "Início › …" trail. */
const OUTRAS_PAGINAS: { to: string; label: string }[] = [
  { to: "/listas", label: "Listas da liberação" },
  { to: "/importar-historico", label: "Importar histórico SIGE" },
];

/**
 * The menu item for the current page: same path, and when an item opens a filtered page
 * (?modelo=midia) the one whose filter matches wins over the plain item.
 */
function itemAtivo(pathname: string, search: Record<string, unknown>): NavItem | undefined {
  const noCaminho = ALL_ITEMS.filter(
    (i) => i.to && (pathname === i.to || (pathname.startsWith(`${i.to}/`) && !i.search)),
  );
  const comFiltro = noCaminho.find(
    (i) => i.search && Object.entries(i.search).every(([k, v]) => search[k] === v),
  );
  return (
    comFiltro ??
    noCaminho.filter((i) => !i.search).sort((a, b) => (b.to?.length ?? 0) - (a.to?.length ?? 0))[0]
  );
}

const BARE_PATHS = ["/auth", "/reset-password"];
const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 76;
const COLLAPSED_KEY = "pattyone:sidebar-collapsed";
const GRUPOS_KEY = "pattyone:menu-grupos-fechados";

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

/** Menu groups the person closed (by title), remembered per browser. */
function useGruposFechados() {
  const [fechados, setFechados] = useState<string[]>([]);
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(GRUPOS_KEY) ?? "[]");
      if (Array.isArray(salvo)) setFechados(salvo.filter((t) => typeof t === "string"));
    } catch {
      /* ignore */
    }
  }, []);
  const alternar = useCallback((titulo: string) => {
    setFechados((atual) => {
      const novo = atual.includes(titulo) ? atual.filter((t) => t !== titulo) : [...atual, titulo];
      try {
        localStorage.setItem(GRUPOS_KEY, JSON.stringify(novo));
      } catch {
        /* ignore */
      }
      return novo;
    });
  }, []);
  return { fechados, alternar };
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
  recuo = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  /** Child of a subcategory: slightly indented. */
  recuo?: boolean;
}) {
  const classe = cn(
    "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
    collapsed && "justify-center px-0",
    !collapsed && recuo && "pl-5",
  );
  const conteudo = (
    <>
      {active && (
        <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-accent-foreground" />
      )}
      <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
      {!collapsed && <span className="min-w-0 flex-1 leading-snug">{item.label}</span>}
      {!collapsed && !item.to && (
        <span className="shrink-0 rounded-full bg-sidebar-hover px-1.5 py-px text-[9px] font-semibold tracking-wide uppercase">
          em breve
        </span>
      )}
    </>
  );
  const link = item.to ? (
    <Link
      to={item.to as never}
      search={(item.search ?? {}) as never}
      // Our own logic picks the active item (filtered pages included); the router's
      // default would also mark the plain item when a filtered one is open.
      activeOptions={{ exact: true }}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        classe,
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
          : "text-sidebar-foreground hover:translate-x-0.5 hover:bg-sidebar-hover hover:text-sidebar-primary",
      )}
    >
      {conteudo}
    </Link>
  ) : (
    <span
      aria-disabled="true"
      aria-label={`${item.label} (em breve)`}
      className={cn(classe, "cursor-default text-sidebar-foreground/55")}
    >
      {conteudo}
    </span>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {!item.to && " (em breve)"}
      </TooltipContent>
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
        <DropdownMenuItem asChild>
          <Link to="/configuracoes">
            <Settings className="mr-2 h-4 w-4" />
            Configurações
          </Link>
        </DropdownMenuItem>
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
  ativoId,
  onSignOut,
  fechados,
  onAlternarGrupo,
}: {
  me: CurrentUser | null | undefined;
  pending: boolean;
  collapsed: boolean;
  /** Menu item of the current page. */
  ativoId: string | undefined;
  onSignOut: () => void;
  /** Titles of the groups whose items are hidden. */
  fechados: string[];
  onAlternarGrupo: (titulo: string) => void;
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
        {SETORES.map((setor) => {
          const veSetor =
            !setor.funcoes ||
            (Boolean(me?.isGestor) && !setor.soParaFuncao) ||
            setor.funcoes.some((f) => me?.funcoes.includes(f as never));
          if (!veSetor) return null;
          const subs = setor.subs
            .map((sub) => ({ ...sub, itens: sub.itens.filter(visible) }))
            .filter((sub) => sub.itens.length > 0);
          if (subs.length === 0) return null;
          // With the menu shrunk to icons there are no titles, so every sector stays open.
          const fechado = !collapsed && fechados.includes(setor.titulo);
          const listaId = `menu-setor-${setor.titulo.toLowerCase()}`;
          const temAtivo = subs.some((sub) => sub.itens.some((it) => chaveItem(it) === ativoId));
          return (
            <div key={setor.titulo}>
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-sidebar-hover" />
              ) : (
                <button
                  type="button"
                  onClick={() => onAlternarGrupo(setor.titulo)}
                  aria-expanded={!fechado}
                  aria-controls={listaId}
                  title={fechado ? `Mostrar ${setor.titulo}` : `Esconder ${setor.titulo}`}
                  className="group mb-2 flex w-full items-center gap-1.5 rounded-md px-3 py-0.5 text-left text-[10px] font-semibold tracking-wider text-sidebar-foreground/80 uppercase transition-colors hover:text-sidebar-primary"
                >
                  <span className="flex-1">{setor.titulo}</span>
                  {fechado && temAtivo && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-sidebar-primary"
                      aria-label="a página aberta está neste grupo"
                    />
                  )}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 opacity-60 transition-transform duration-200 group-hover:opacity-100",
                      fechado && "-rotate-90",
                    )}
                  />
                </button>
              )}
              <div id={listaId} hidden={fechado} className="space-y-2">
                {subs.map((sub, n) => (
                  <div key={sub.titulo ?? `soltos-${n}`} className="space-y-0.5">
                    {sub.titulo && !collapsed && (
                      <div className="px-3 pt-1 text-[11px] font-medium text-sidebar-foreground/70">
                        {sub.titulo}
                      </div>
                    )}
                    {sub.itens.map((it) => (
                      <NavLink
                        key={it.id}
                        item={it}
                        active={chaveItem(it) === ativoId}
                        collapsed={collapsed}
                        recuo={Boolean(sub.titulo)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border px-3 py-3">
        {FOOTER_ITEMS.filter(visible).map((it) => (
          <NavLink key={it.id} item={it} active={chaveItem(it) === ativoId} collapsed={collapsed} />
        ))}
        {me && <UserMenu me={me} collapsed={collapsed} onSignOut={onSignOut} />}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locSearch = useRouterState({
    select: (s) => s.location.search as Record<string, unknown>,
  });
  const bare = BARE_PATHS.some((p) => pathname.startsWith(p));
  // Liberação forms mirror a 12-column spreadsheet, so they get a wider page.
  const wide =
    pathname.startsWith("/liberacoes/") || pathname.startsWith("/planejamento/programacao");
  const { data: me } = useCurrentUser();
  const signOut = useSignOut();
  const showNotifications = !bare && Boolean(me?.isMember);
  const { data: notifications = [] } = useNotifications(me?.id, showNotifications);
  const { collapsed, toggle } = useCollapsed();
  const { fechados, alternar } = useGruposFechados();
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
  const ativo = itemAtivo(pathname, locSearch);
  const atual =
    ativo ?? OUTRAS_PAGINAS.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
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
            ativoId={ativo ? chaveItem(ativo) : undefined}
            onSignOut={signOut}
            fechados={fechados}
            onAlternarGrupo={alternar}
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
              ativoId={ativo ? chaveItem(ativo) : undefined}
              onSignOut={signOut}
              fechados={fechados}
              onAlternarGrupo={alternar}
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
                    <DropdownMenuItem asChild>
                      <Link to="/configuracoes">
                        <Settings className="mr-2 h-4 w-4" />
                        Configurações
                      </Link>
                    </DropdownMenuItem>
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
